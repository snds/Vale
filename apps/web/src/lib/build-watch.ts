import { useSyncExternalStore } from "react"
import { startBuildWatch as startSharedWatch, type BuildWatchState, type RunningBuildWatch } from "@unicron/ui"

import { queryClient } from "@/core/queries"
import { addReloadCheck, canReloadNow, fieldHoldsWords, saveBeforeReload } from "@/lib/can-reload"
import { paneHoldsWriting } from "@/lib/leave-guard"

/**
 * The build watch wired to Vale (ADR-0091). The rules and the page wiring are Unicron's shared copy
 * since 1.1 (`startBuildWatch`, Updates 5; ADR-0116); Vale gives it its storage prefix (`vale`, so
 * the page tag is `vale-build` and the note is `vale.build.reloadedFor`), its `canReloadNow()` and
 * its draft saver. `startBuildWatch()` runs once from main.tsx. It does nothing:
 *
 * - inside a Tauri shell (the desktop app, the phones, Vale Demo for Mac): there the page ships
 *   inside the app, and the app's own updater is the only path (ADR-0076);
 * - in a page with no build id (`vite dev`).
 *
 * Everywhere else (a gateway, the static demo) it asks `build.json` at load, when the tab becomes
 * visible, when the device comes back online, every 15 minutes while visible, and when a lazy file
 * fails to load.
 *
 * What a screen uses: `useBuildWatch()` for the state, `reloadForNewBuild()` for the Reload action,
 * `checkBuildNow()` after an owner's Update or Reload.
 */
let watch: RunningBuildWatch | null = null

/**
 * Writing on the page that a reload would drop: any field with words in it (`fieldHoldsWords`),
 * focused or not, and an editor that has the caret. An editor without the caret does not count: a
 * note that is open shows its saved text. Fields a component keeps for itself (`aria-hidden`) are
 * skipped.
 */
function writingOnThePage(): boolean {
  for (const field of document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea")) {
    if (field.getAttribute("aria-hidden") !== "true" && fieldHoldsWords(field)) return true
  }
  const el = document.activeElement
  return el instanceof HTMLElement && el.isContentEditable && (el.textContent ?? "") !== ""
}

/** The standing questions `canReloadNow()` asks in Vale. Screens add their own with `holdReload`. */
function addChecks() {
  addReloadCheck("unsaved writing in a form", paneHoldsWriting)
  addReloadCheck("writing in a field or an editor", writingOnThePage)
  // The form layer, a question, a menu's sheet: anything open over the page.
  addReloadCheck("a dialog is open", () => document.querySelector('[role="dialog"], [role="alertdialog"], [aria-modal="true"]') !== null)
  // A send, a save, an upload: every change the app asks its core for.
  addReloadCheck("a change is being saved or sent", () => queryClient.isMutating() > 0)
}

let checksAdded = false

/** Starts the watch. Safe to call twice. Returns whether it runs. */
export function startBuildWatch(): boolean {
  if (watch) return true
  if (typeof window === "undefined" || "__TAURI_INTERNALS__" in window) return false
  if (!checksAdded) {
    addChecks()
    checksAdded = true
  }
  watch = startSharedWatch({
    storagePrefix: "vale",
    canReloadNow,
    save: saveBeforeReload,
    url: new URL(`${import.meta.env.BASE_URL}build.json`, window.location.origin).toString(),
    // A gateway's page sits behind its sign-in.
    credentials: "same-origin",
  })
  return watch !== null
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
