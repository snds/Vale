import { useUi } from "@/app/ui-store"
import { useAccountStep } from "@/features/settings/account-step"

import { openFirstRun } from "./first-run"

/**
 * "Add an account…", from a section's account list and the command menu
 * (brief X1): Settings › Accounts, at its ADD AN ACCOUNT providers (brief
 * T1; ADR-0104), with the first one focused. Each provider opens first
 * run's second step in that column (pushed on a phone; ADR-0107).
 */
export function startAddAccount() {
  useAccountStep.setState({ step: { kind: "list" }, focusAdd: true })
  useUi.getState().openSettings("accounts")
}

/**
 * "Add account" for someone with none yet, from Mail's empty state (brief
 * M1): first run again, at its first step, in the focus frame (brief X8;
 * ADR-0107). NOT NOW there returns to the app.
 */
export function startFirstRun() {
  openFirstRun()
}
