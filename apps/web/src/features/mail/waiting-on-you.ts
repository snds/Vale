import { MESSAGE_PAGE, useMessages } from "@/core/queries"
import type { MessageSummary } from "@/core/types"
import { useNowSecs } from "@/hooks/use-now"

/**
 * What waits on you in Mail and can wait (cross-app settlement, 2026-11-16; amends cross-app
 * decisions §2): conversations a reminder brought back with no reply yet. They show as a count in
 * the needs-you tone on the way into Mail, and as the block on Mail's home screen (the Inbox); a
 * conversation's own screen keeps its block. Vale has nothing time-limited or blocking of this kind,
 * so no block shows on every screen. The Inbox ranks a due reminder at the top, so its first page
 * holds them all.
 */
export function useWaitingOnYou(): MessageSummary[] {
  const now = useNowSecs(60_000)
  const { data = [] } = useMessages({ lane: "inbox", accountId: null, search: null, category: null, split: null, bundle: false, limit: MESSAGE_PAGE })
  return data.filter((m) => m.followUpAt != null && m.followUpAt <= now)
}

/** The mark on the way into Mail: the count in the needs-you tone, its words in the name. */
export function waitingMark(waiting: number) {
  return waiting > 0 ? { count: waiting, tone: "needs-you" as const, label: `${waiting} ${waiting === 1 ? "reminder" : "reminders"} with no reply yet` } : undefined
}
