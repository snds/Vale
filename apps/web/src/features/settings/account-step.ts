import { create } from "zustand"

/**
 * Where Settings › Accounts stands (brief T1; ADR-0104): its list, or a
 * screen pushed in its column (managing one account, adding one with a
 * provider's form, connecting calendars and contacts). It lives outside the
 * section so the page's way back (the phone's top bar, the status line's back
 * at medium width) closes the pushed screen before it leaves the section,
 * and so "Add an account…" elsewhere can open the section at its providers.
 */
export type AccountStep = { kind: "list" } | { kind: "manage"; id: string } | { kind: "add"; preset: string } | { kind: "connect"; id: string }

interface AccountStepState {
  step: AccountStep
  /** Bring the ADD AN ACCOUNT group into view and focus its first provider, once. */
  focusAdd: boolean
}

export const useAccountStep = create<AccountStepState>(() => ({ step: { kind: "list" }, focusAdd: false }))

export const setAccountStep = (step: AccountStep) => useAccountStep.setState({ step })

/** Back from a pushed screen to the list. False when the list is showing, so the caller goes on back. */
export function closeAccountStep(): boolean {
  if (useAccountStep.getState().step.kind === "list") return false
  useAccountStep.setState({ step: { kind: "list" } })
  return true
}
