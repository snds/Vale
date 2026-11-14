import { useSyncExternalStore } from "react"

import { queryClient } from "@/core/queries"
import { QUIET_EVERY_MS, RELOADED_KEY, createBuildWatch, type BuildWatch, type BuildWatchState } from "@/lib/build-watch"
import { addReloadCheck, canReloadNow, saveBeforeReload } from "@/lib/can-reload"
import { paneHoldsWriting } from "@/lib/leave-guard"

/**
 * The build watch wired to the page (ADR-0091). `startBuildWatch()` runs
 * once from main.tsx. It does nothing:
 *
 * - inside a Tauri shell (the desktop app, the phones, Vale Demo for Mac):
 *   there the page ships inside the app, and the app's own updater is the
 *   only path (ADR-0076);
 * - in a page with no build id (`vite dev`).
 *
 * Everywhere else (a gateway, the static demo) it asks `build.json` at
 * load, when the tab becomes visible, when the device comes back online,
 * every 15 minutes while visible, and when a lazy file fails to load.
 *
 * What a screen uses: `useBuildWatch()` for the state, `reloadForNewBuild()`
 * for the Reload action, `checkBuildNow()` after an owner's Update or Reload.
 */
let watch: BuildWatch | null = null

/** This page's build id (vite.config.ts writes the tag), or null. */
export function pageBuild(): string | null {
  if (typeof document === "undefined") return null
  const id = document.querySelector('meta[name="vale-build"]')?.getAttribute("content")?.trim()
  return id ? id : null
}

/** `sessionStorage`, which a browser may refuse (private windows, blocked site data). */
function session(): Storage | null {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

/** A field, a text box or an editor that holds writing and has the caret. */
function writingHasFocus(): boolean {
  const el = document.activeElement
  if (!(el instanceof HTMLElement)) return false
  if (el instanceof HTMLTextAreaElement) return el.value !== ""
  if (el instanceof HTMLInputElement) {
    const typed = !["button", "checkbox", "color", "file", "hidden", "image", "radio", "range", "reset", "submit"].includes(el.type)
    return typed && el.value !== ""
  }
  return el.isContentEditable && (el.textContent ?? "") !== ""
}

/** The standing questions `canReloadNow()` asks in Vale. Screens add their own with `holdReload`. */
function addChecks() {
  addReloadCheck("unsaved writing in a form", paneHoldsWriting)
  addReloadCheck("writing in a field or an editor", writingHasFocus)
  // The form layer, a question, a menu's sheet: anything open over the page.
  addReloadCheck("a dialog is open", () => document.querySelector('[role="dialog"], [role="alertdialog"], [aria-modal="true"]') !== null)
  // A send, a save, an upload: every change the app asks its core for.
  addReloadCheck("a change is being saved or sent", () => queryClient.isMutating() > 0)
}

/** Starts the watch. Safe to call twice. Returns whether it runs. */
export function startBuildWatch(): boolean {
  if (watch) return true
  if (typeof window === "undefined" || "__TAURI_INTERNALS__" in window) return false
  const current = pageBuild()
  if (!current) return false

  const url = new URL(`${import.meta.env.BASE_URL}build.json`, window.location.origin).toString()
  addChecks()
  const made = createBuildWatch({
    current,
    fetchText: async () => {
      // `no-store`: past the browser's cache, whatever a server in between says.
      const res = await fetch(url, { cache: "no-store", credentials: "same-origin", redirect: "error", headers: { accept: "application/json" } })
      return res.ok ? await res.text() : null
    },
    now: () => Date.now(),
    hidden: () => document.visibilityState === "hidden",
    canReload: canReloadNow,
    save: saveBeforeReload,
    reload: () => window.location.reload(),
    reloadedFor: () => {
      try {
        return session()?.getItem(RELOADED_KEY) ?? null
      } catch {
        return null
      }
    },
    noteReloaded: (id) => {
      try {
        session()?.setItem(RELOADED_KEY, id)
      } catch {
        // The rules read the note back before reloading: with no note kept, the page only offers Reload.
      }
    },
  })
  watch = made

  const activity = () => made.activity()
  for (const name of ["keydown", "pointerdown", "touchstart", "wheel"]) window.addEventListener(name, activity, { capture: true, passive: true })
  document.addEventListener("visibilitychange", () => made.visibility())
  window.addEventListener("online", () => made.online())
  // A lazy file of the old build is gone. The failed import still throws to the screen that asked;
  // the watch reloads if the moment is quiet, and otherwise says "Reload to continue" (`needed`).
  window.addEventListener("vite:preloadError", () => void made.preloadFailed())
  window.setInterval(() => made.tick(), QUIET_EVERY_MS)
  void made.check()
  return true
}

const NONE: BuildWatchState | null = null

/** The watch's state for a screen, or null where it does not run. */
export function useBuildWatch(): BuildWatchState | null {
  return useSyncExternalStore(
    (listener) => watch?.subscribe(listener) ?? (() => {}),
    () => watch?.state() ?? NONE,
    () => NONE,
  )
}

/** The Reload action: saves what the app keeps, then reloads at once. */
export function reloadForNewBuild(): void {
  if (watch) watch.reloadNow()
  else window.location.reload()
}

/** Asks the server now (after an owner's Update or Reload finishes). */
export function checkBuildNow(): void {
  void watch?.check(true)
}
