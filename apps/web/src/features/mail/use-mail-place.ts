import { useUi } from "@/app/ui-store"
import { isMember } from "@/core/client"
import { useAccounts, useScreener, useSharedInbox } from "@/core/queries"

import type { MailTab } from "./lanes"

/** Mail's folders, in the order the nav lists them (brief X1). The core has lanes, not Drafts, Sent or Spam. */
const FOLDERS: MailTab[] = ["inbox", "screener", "unread", "starred", "snoozed", "waiting", "scheduled", "archive"]
const TEAM: MailTab[] = ["mine", "team"]
/**
 * Mail's place as it stands: the lane and the account in the store, unless
 * one is gone (the Screener turned off, an account removed); then the Inbox,
 * and all accounts. The nav and the view both read it, so they never differ.
 */
export function useMailPlace() {
  const stored = useUi((s) => s.mailTab)
  const storedAccount = useUi((s) => s.mailAccount)
  const { data: screener } = useScreener()
  const { data: accounts = [] } = useAccounts()
  const sharedInbox = useSharedInbox()
  // The Screener is listed while it's on, while senders still wait in it, or while its lane is open (brief M3:
  // off and empty, it is not listed); "Assigned to me" with a shared inbox; Team is the owner's.
  const shown = (id: MailTab) => (id !== "screener" || !!screener?.enabled || (screener?.waiting ?? 0) > 0 || stored === "screener") && (id !== "mine" || sharedInbox) && (id !== "team" || !isMember())
  const tab: MailTab = shown(stored) ? stored : "inbox"
  const account = accounts.find((a) => a.id === storedAccount) ?? null
  return { tab, account, accounts, folders: FOLDERS.filter(shown), team: TEAM.filter(shown), waiting: screener?.waiting ?? 0 }
}
