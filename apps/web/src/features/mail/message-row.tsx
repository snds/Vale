import type { ReactNode } from "react"

import { Badge, Highlight, Icon, ListRow, TruncatedText } from "@unicron/ui"
import type { Lane, MessageSummary } from "@/core/types"

import { displayName } from "./format"
import { rowTime } from "./row-time"
import { RowTimeTip } from "./row-time-tip"

export interface MessageRowProps {
  message: MessageSummary
  onOpen: () => void
  /** The conversation open beside the list. */
  selected?: boolean
  /** The lane the row is listed in: Snoozed and Waiting show when it comes back, in place of when it came. */
  lane?: Lane
  /** The time now, in seconds, to tell a follow-up that has come due. Without it, none shows as due. */
  now?: number
  /** Which account the message came to, where more than one is listed together. */
  account?: string
  /** The words a search matched: marked in the subject and the preview. */
  query?: string
  /** The row's own actions, as `DropdownMenuItem`s: the overflow button, right-click, the Menu key, Shift+F10 (ADR-0113). */
  menu?: ReactNode
}

/**
 * A conversation as a row (ADR-0085, ADR-0113): the core's `MessageSummary`
 * on unicron's message row, with the data the core has today and nothing
 * else. No face (Q8). Mail's lanes put it in a SwipeRow and give it a menu;
 * Search lists it bare.
 */
export function MessageRow({ message: m, onOpen, selected, lane, now, account, query, menu }: MessageRowProps) {
  // Your own mail says who it went to.
  const sentTo = m.mailbox === "Sent" ? m.sentTo : null
  // A follow-up that came due brings your own message back to the inbox.
  const nudged = (lane === undefined || lane === "inbox") && now !== undefined && m.followUpAt != null && m.followUpAt <= now
  // Snoozed and Waiting say when the row comes back, after the glyph that says why.
  const returns = lane === "snoozed" && m.snoozedUntil ? ("time" as const) : lane === "waiting" && m.followUpAt ? ("notification" as const) : null
  const at = lane === "snoozed" && m.snoozedUntil ? m.snoozedUntil : lane === "waiting" && m.followUpAt ? m.followUpAt : nudged ? Math.max(m.followUpAt!, m.sortAt) : m.sortAt
  const today = now !== undefined ? new Date(now * 1000) : undefined
  const subject = m.subject || "(no subject)"
  return (
    <ListRow
      layout="message"
      selected={selected}
      onClick={onOpen}
      unread={!m.seen}
      sender={sentTo ? `To ${sentTo}` : displayName(m.from)}
      count={m.threadCount > 1 ? m.threadCount : undefined}
      tag={nudged ? <Badge>No reply yet</Badge> : undefined}
      marks={
        m.flagged || m.hasAttachments ? (
          <>
            {m.flagged && <Icon name="star--filled" size="sm" label="Starred" />}
            {m.hasAttachments && <Icon name="attachment" tone="muted" size="sm" label="Has attachments" />}
          </>
        ) : undefined
      }
      account={account}
      // The clock time as the frames write it; its relative age in a tooltip (cross-app settlement).
      time={
        returns ? (
          <span className="inline-flex items-center gap-1 align-bottom">
            <Icon name={returns} size="sm" label={returns === "time" ? "Back at" : "Reminder at"} />
            <RowTimeTip at={at} now={today}>
              {rowTime(at, today)}
            </RowTimeTip>
          </span>
        ) : (
          <RowTimeTip at={at} now={today}>
            {rowTime(at, today)}
          </RowTimeTip>
        )
      }
      subject={query ? <Highlight text={subject} query={query} /> : <TruncatedText>{subject}</TruncatedText>}
      preview={m.preview ? query ? <Highlight text={m.preview} query={query} /> : m.preview : undefined}
      menu={menu}
    />
  )
}
