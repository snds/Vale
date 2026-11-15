import { useEffect } from "react"
import { create } from "zustand"

import { useUi } from "@/app/ui-store"

/**
 * Where the contact form stands (ADR-0103; brief P3, Desktop / 10).
 *
 * - **In the detail column** when Contacts shows its list beside the
 *   detail (the expanded width) at the moment the form is opened: EDIT on a
 *   person, NEW CONTACT in Contacts' sidebar.
 * - **In the form layer** otherwise: the whole screen on a phone (Mobile /
 *   13), a 640 dialog at medium width, and a dialog over the section you are
 *   in when another section opens it (the sender panel's Add, quick create
 *   from Mail, a signature in a message).
 *
 * `hosts` counts the Contacts views that can hold the form beside their
 * list; `inPane` is decided once, when the form opens. `dirty` is the pane's
 * form holding changes: the status line then says UNSAVED CHANGES.
 */
interface ContactPane {
  hosts: number
  inPane: boolean
  dirty: boolean
}
export const useContactPane = create<ContactPane>(() => ({ hosts: 0, inPane: false, dirty: false }))

useUi.subscribe((s, prev) => {
  if (s.contactEditor === prev.contactEditor) return
  if (!s.contactEditor) useContactPane.setState({ inPane: false, dirty: false })
  else if (!prev.contactEditor) useContactPane.setState((p) => ({ inPane: p.hosts > 0, dirty: false }))
})

/**
 * Contacts says it can hold the form beside its list while `split` is true.
 * When the last such view goes (another section, a narrower window) a form
 * standing there closes: a move away with changes has already asked
 * (`lib/leave-guard`), so nothing unsaved is dropped without the question.
 */
export function useContactPaneHost(split: boolean) {
  useEffect(() => {
    if (!split) return
    useContactPane.setState((p) => ({ hosts: p.hosts + 1 }))
    return () => {
      useContactPane.setState((p) => ({ hosts: p.hosts - 1 }))
      // Next tick: a view that mounts again at once (React's development double run) keeps the form.
      setTimeout(() => {
        const pane = useContactPane.getState()
        if (pane.hosts === 0 && pane.inPane) useUi.getState().closeContactEditor()
      })
    }
  }, [split])
}

/** Closes the form when it stands in the detail column; a form in the layer is left alone. */
export function closePaneEditor() {
  if (useContactPane.getState().inPane) useUi.getState().closeContactEditor()
}
