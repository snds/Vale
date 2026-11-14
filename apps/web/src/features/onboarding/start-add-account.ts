import { useUi } from "@/app/ui-store"
import { useAccountStep } from "@/features/settings/account-step"

/**
 * "Add an account…", from a section's account list and the command menu
 * (brief X1): Settings › Accounts, at its ADD AN ACCOUNT providers (brief
 * T1; ADR-0104), with the first one focused. Each provider opens today's
 * form in that column (pushed on a phone) until first run restyles it as
 * X8's second step.
 */
export function startAddAccount() {
  useAccountStep.setState({ step: { kind: "list" }, focusAdd: true })
  useUi.getState().openSettings("accounts")
}

/**
 * "Add account" for someone with none yet, from Mail's empty state (brief
 * M1). It will start first run at its first step (brief X8); until then it
 * opens Settings › Accounts too.
 */
export function startFirstRun() {
  useUi.getState().openSettings("accounts")
}
