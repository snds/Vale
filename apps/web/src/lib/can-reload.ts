/**
 * Whether reloading the page now would lose work (ADR-0091; the shared
 * update contract, A2b). The build watch asks before it reloads an open page
 * by itself. It never decides alone: it also wants a quiet moment.
 *
 * Two ways to say "not now":
 *
 * - `holdReload(why)` while something is in flight (a send, an upload, an
 *   answer that is still arriving). It returns the release.
 * - `addReloadCheck(why, holds)` for a standing question asked at the moment
 *   of reloading (unsaved writing, an open dialog).
 *
 * A check that throws counts as "not now": a reload must never lose work
 * because a check broke.
 *
 * No imports, so it runs under `node --test` (apps/web/test).
 */
type Check = { why: string; holds: () => boolean }

const holds = new Map<symbol, string>()
const checks = new Set<Check>()
const savers = new Set<() => void>()

/** Holds reloads until the returned function is called. Calling it twice is fine. */
export function holdReload(why: string): () => void {
  const key = Symbol(why)
  holds.set(key, why)
  return () => {
    holds.delete(key)
  }
}

/** Adds a question asked each time a reload is considered. Returns the remove. */
export function addReloadCheck(why: string, holdsNow: () => boolean): () => void {
  const check: Check = { why, holds: holdsNow }
  checks.add(check)
  return () => {
    checks.delete(check)
  }
}

/** Why a reload would lose work right now, in the order asked. Empty means it would not. */
export function reloadBlockers(): string[] {
  const out = [...holds.values()]
  for (const check of checks) {
    let blocked = true
    try {
      blocked = check.holds()
    } catch {
      blocked = true
    }
    if (blocked) out.push(check.why)
  }
  return out
}

/** What the question below needs of a text field. An `<input>` and a `<textarea>` both fit. */
export interface FieldLike {
  type: string
  value: string
  disabled: boolean
  readOnly: boolean
}

/** Kinds of `<input>` that never hold a person's words. */
const NOT_WORDS = new Set(["button", "checkbox", "color", "file", "hidden", "image", "radio", "range", "reset", "submit"])

/**
 * Whether a field holds words a reload would drop: any field a person can
 * type in that is not empty, with or without the caret. A field can be
 * filled and left (a visitor's name on a booking page, half of a new
 * account's settings) while the form around it is still unsent. This cannot
 * tell typed words from saved ones, so a screen of filled fields holds the
 * reload too. That is the safe side: the page still offers Reload.
 */
export const fieldHoldsWords = (field: FieldLike): boolean => !field.disabled && !field.readOnly && !NOT_WORDS.has(field.type) && field.value !== ""

/** Whether a reload now would lose nothing. */
export const canReloadNow = (): boolean => reloadBlockers().length === 0

/** Registers something to save before any reload (a draft the app keeps). Returns the remove. */
export function beforeReload(save: () => void): () => void {
  savers.add(save)
  return () => {
    savers.delete(save)
  }
}

/** Runs every saver. One that throws does not stop the others. */
export function saveBeforeReload(): void {
  for (const save of savers) {
    try {
      save()
    } catch {
      // A saver that fails must not block the others or the reload a person asked for.
    }
  }
}
