/**
 * The build watch (ADR-0091; the shared update contract, A2b): how an open
 * web page learns that its server has a newer front end, and when it may
 * reload by itself.
 *
 * The build writes `build.json` (`{"build": "<id>"}`) at the web root and
 * the same id into the page (`<meta name="vale-build">`, vite.config.ts).
 * The page fetches `build.json` again later. A different id means a new
 * version is ready.
 *
 * - An answer that is not JSON with a `build` string (a sign-in page, an
 *   error, a proxy's page) means "can't tell". It never means "new".
 * - The page reloads by itself only in a quiet moment: the tab has been
 *   hidden for a minute, or nobody has typed, clicked or touched for five;
 *   and the app says no work would be lost; and it has not already reloaded
 *   for this id (so a bad deploy cannot loop).
 * - Otherwise it waits and keeps offering Reload.
 *
 * This file is the rules only: no DOM, no imports, every outside thing
 * passed in. `build-watch-dom.ts` wires it to the page. It runs under
 * `node --test` (apps/web/test/build-watch.test.mjs).
 */

/** How often the page asks while it is visible. */
export const CHECK_EVERY_MS = 15 * 60 * 1000
/** How long the tab must have been hidden before a reload by itself. */
export const HIDDEN_FOR_MS = 60 * 1000
/** How long nobody must have typed, clicked or touched before a reload by itself. */
export const IDLE_FOR_MS = 5 * 60 * 1000
/** How often a waiting reload looks for its quiet moment. */
export const QUIET_EVERY_MS = 30 * 1000
/** Asks closer together than this are dropped (several events often fire at once). */
export const MIN_GAP_MS = 5 * 1000
/** The largest `build.json` read (the real one is under 100 bytes). */
export const BUILD_JSON_LIMIT = 4096
/** Where the id reloaded for is kept, for this tab only. */
export const RELOADED_KEY = "vale.build.reloadedFor"

/** What the page shows. Plain data. */
export interface BuildWatchState {
  /** This page's own build id. */
  current: string
  /** The server's id when it differs from this page's, else null. */
  latest: string | null
  /** A new version is ready: offer Reload. */
  ready: boolean
  /** A file this page needs is gone with the old build: say "Reload to continue". */
  needed: boolean
  /** When the server last gave a readable answer (ms since 1970). */
  checkedAt: number | null
}

/** Everything the rules need from outside. */
export interface BuildWatchEnv {
  /** This page's build id. */
  current: string
  /** The body of `build.json`, fetched past every cache; null or a throw when it could not be read. */
  fetchText: () => Promise<string | null>
  now: () => number
  /** Whether the tab is hidden right now. */
  hidden: () => boolean
  /** The app's `canReloadNow()`. */
  canReload: () => boolean
  /** Saves what the app keeps (drafts) before a reload. */
  save: () => void
  reload: () => void
  /** The id this tab already reloaded for, and where to note the next. `sessionStorage` in the page. */
  reloadedFor: () => string | null
  noteReloaded: (id: string) => void
}

/**
 * The build id in a `build.json` body, or null when the body is anything
 * else. Ids are short and plain (letters, digits, dot, dash, underscore), so
 * a page of HTML or a huge answer is never taken for one.
 */
export function readBuild(body: string | null | undefined): string | null {
  if (typeof body !== "string" || body.length > BUILD_JSON_LIMIT) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    return null
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null
  const build = (parsed as { build?: unknown }).build
  return typeof build === "string" && /^[A-Za-z0-9._-]{1,64}$/.test(build) ? build : null
}

/** Whether this is a quiet moment, by the clock alone. */
export function quietByTheClock(now: number, hiddenSince: number | null, lastActivity: number): boolean {
  if (hiddenSince !== null && now - hiddenSince >= HIDDEN_FOR_MS) return true
  return now - lastActivity >= IDLE_FOR_MS
}

export interface BuildWatch {
  state: () => BuildWatchState
  subscribe: (listener: () => void) => () => void
  /** Asks the server now. `force` skips the minimum gap (an owner's Update or Reload just finished). */
  check: (force?: boolean) => Promise<BuildWatchState>
  /** Someone typed, clicked or touched. */
  activity: () => void
  /** The tab became hidden or visible. Becoming visible asks the server. */
  visibility: () => void
  /** The device came back online. */
  online: () => void
  /** A lazy file failed to load (`vite:preloadError`). True when the page is reloading for it. */
  preloadFailed: () => Promise<boolean>
  /** The clock: asks when a check is due, and reloads when a new version waits and the moment is quiet. */
  tick: () => void
  /** Reload was pressed: saves, then reloads at once. */
  reloadNow: () => void
}

export function createBuildWatch(env: BuildWatchEnv): BuildWatch {
  let state: BuildWatchState = { current: env.current, latest: null, ready: false, needed: false, checkedAt: null }
  const listeners = new Set<() => void>()
  let lastAsked: number | null = null
  let asking: Promise<BuildWatchState> | null = null
  let lastActivity = env.now()
  let hiddenSince: number | null = env.hidden() ? env.now() : null
  let reloading = false

  const set = (patch: Partial<BuildWatchState>) => {
    const next = { ...state, ...patch }
    const same = (Object.keys(next) as (keyof BuildWatchState)[]).every((k) => next[k] === state[k])
    if (same) return
    state = next
    for (const listener of listeners) listener()
  }

  const doReload = () => {
    if (reloading) return
    reloading = true
    try {
      env.save()
    } catch {
      // Saving is the app's; a failure there is not a reason to keep an old page a person asked to leave.
    }
    env.reload()
  }

  /** Reloads by itself when every rule says yes. */
  const reloadIfQuiet = (): boolean => {
    if (reloading) return true
    const id = state.latest
    if (!state.ready || id === null) return false
    if (env.reloadedFor() === id) return false
    if (!quietByTheClock(env.now(), hiddenSince, lastActivity)) return false
    let free = false
    try {
      free = env.canReload()
    } catch {
      free = false
    }
    if (!free) return false
    // Once per id. If the note cannot be kept (no session storage), never reload by itself:
    // without it a bad deploy could reload this tab again and again.
    env.noteReloaded(id)
    if (env.reloadedFor() !== id) return false
    doReload()
    return true
  }

  const ask = async (): Promise<BuildWatchState> => {
    let body: string | null = null
    try {
      body = await env.fetchText()
    } catch {
      body = null
    }
    const id = readBuild(body)
    // Can't tell: keep what is known. An unreadable answer never clears or raises the offer.
    if (id === null) return state
    if (id === env.current) set({ latest: null, ready: false, needed: false, checkedAt: env.now() })
    else set({ latest: id, ready: true, checkedAt: env.now() })
    return state
  }

  const check = (force = false): Promise<BuildWatchState> => {
    // A forced ask that arrives during another waits for it, then asks afresh: the one in flight
    // may have left before the server changed.
    if (asking) return force ? asking.then(() => check(true)) : asking
    const now = env.now()
    if (!force && lastAsked !== null && now - lastAsked < MIN_GAP_MS) return Promise.resolve(state)
    lastAsked = now
    asking = ask().finally(() => {
      asking = null
    })
    return asking
  }

  return {
    state: () => state,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    check,
    activity: () => {
      lastActivity = env.now()
    },
    visibility: () => {
      if (env.hidden()) {
        if (hiddenSince === null) hiddenSince = env.now()
        return
      }
      // Coming back counts as someone being here: no reload under their eyes.
      hiddenSince = null
      lastActivity = env.now()
      void check()
    },
    online: () => {
      void check()
    },
    preloadFailed: async () => {
      await check(true)
      if (!state.ready) return false
      if (reloadIfQuiet()) return true
      set({ needed: true })
      return false
    },
    tick: () => {
      if (reloading) return
      const now = env.now()
      if (!env.hidden() && (lastAsked === null || now - lastAsked >= CHECK_EVERY_MS)) void check()
      reloadIfQuiet()
    },
    reloadNow: doReload,
  }
}
