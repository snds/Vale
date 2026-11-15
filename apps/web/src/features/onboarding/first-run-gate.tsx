import { Activity, useEffect, useLayoutEffect, type ReactNode } from "react"

import { toast } from "@unicron/ui"
import { useUi } from "@/app/ui-store"
import { isMember } from "@/core/client"
import { useAccounts } from "@/core/queries"

import { FirstRun } from "./first-run-screens"
import { saidNotNow, useFirstRun } from "./first-run"

/**
 * Stands between the gateway's door and the app (ADR-0083, ADR-0107). First
 * run shows, in the focus frame, when the first read of the accounts finds
 * none, the person is not a team member, and "Not now" was not chosen on
 * this device (brief X8). The sample-mail demo always has accounts, so it
 * reaches first run only through its `no-account` scenario. Mail's empty
 * state opens it again (`startFirstRun`). While it shows, the app stays
 * mounted and hidden, so it comes back as it was.
 */
export function FirstRunGate({ children }: { children: ReactNode }) {
  const open = useFirstRun((s) => s.open)
  const { data: accounts, isPending } = useAccounts()

  // Decided once, when the accounts first arrive. A failed read lets the app in: it says what went wrong.
  useLayoutEffect(() => {
    if (open !== null || isPending) return
    useFirstRun.setState({ open: !!accounts && accounts.length === 0 && !isMember() && !saidNotNow() })
  }, [open, isPending, accounts])

  // Nothing until then, so neither screen flashes before the other.
  if (open === null) return null
  return (
    <>
      <Activity mode={open ? "hidden" : "visible"}>{children}</Activity>
      {open ? <FirstRun /> : <AddedToast />}
    </>
  )
}

/**
 * Done (brief X8): no third screen. The Inbox opens, its strip says FIRST
 * SYNC, and this toast names the address. It is raised after the app's own
 * effects, so the frame's Toaster is listening.
 */
function AddedToast() {
  const added = useFirstRun((s) => s.added)
  useEffect(() => {
    if (!added) return
    useFirstRun.setState({ added: null })
    useUi.getState().setVertical("mail")
    toast.success(`Added ${added}`)
  }, [added])
  return null
}
