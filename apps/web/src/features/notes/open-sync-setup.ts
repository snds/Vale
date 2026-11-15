import { create } from "zustand"

import { useUi } from "@/app/ui-store"

/**
 * Intents (ADR-0084, ADR-0111): the notes' set-up, from anywhere. Since
 * brief T5 it lives in Settings › Notes, so each one opens that section;
 * `openNotesImport()` also opens its import form there.
 */
export function openSyncSetup() {
  useUi.getState().openSettings("notes")
}

/** Which of Settings › Notes' forms is open: set-up for sync, or import. */
export const useNotesSetupForm = create<{ form: "sync" | "import" | null }>(() => ({ form: null }))

export const openNotesForm = (form: "sync" | "import" | null) => useNotesSetupForm.setState({ form })

/** Importing notes, from Notes' empty list: Settings › Notes with its import form open. */
export function openNotesImport() {
  useUi.getState().openSettings("notes")
  openNotesForm("import")
}
