import { useEffect, useRef } from "react"

import { useMailPrefs } from "@/core/queries"
import type { MessageDetail, MessageSummary } from "@/core/types"

/**
 * Opening a conversation reads it — once, so "Mark unread" sticks. Advanced
 * settings can wait 3 seconds, so a glance doesn't count, or leave it to you
 * (ADR-0055). Mail's lanes and Search (ADR-0096) open conversations the same way.
 */
export function useMarkRead(row: MessageSummary | undefined, thread: MessageDetail[] | undefined, markSeen: (m: MessageSummary, seen: boolean) => void) {
  const markedRef = useRef<string | null>(null)
  const { data: mailPrefs } = useMailPrefs()
  const markRead = mailPrefs?.markRead
  useEffect(() => {
    if (!markRead || markRead === "manual") return
    if (!row || !thread || !thread.some((m) => !m.seen) || markedRef.current === row.threadId) return
    const mark = () => {
      markedRef.current = row.threadId
      markSeen(row, true)
    }
    if (markRead === "open") return mark()
    const t = setTimeout(mark, 3000)
    return () => clearTimeout(t)
  }, [row, thread, markSeen, markRead])
}
