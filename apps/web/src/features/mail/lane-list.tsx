import { useRef, useState } from "react"

import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  Icon,
  SectionHeader,
  Skeleton,
  SwipeRow,
  type SwipeRowAction,
} from "@unicron/ui"
import { DateTimePicker } from "@/components/date-picker"
import type { Lane, MessageSummary, SwipeActionId, SwipeActions } from "@/core/types"
import { longTime, snoozeOptions } from "@/lib/time"

import type { useTriage } from "./actions"
import { MessageRow } from "./message-row"
import { rowTime } from "./row-time"
import type { useSenderActions } from "./sender-actions"
import { useSnoozed } from "./use-snoozed"
import type { useMailVerbs } from "./vocabulary"

/** One action kind, so two slots that do the same thing, or a slot and a menu item, never list it twice. */
const kind = (id: SwipeActionId) => (id.startsWith("snooze") ? "snooze" : id)

interface RowProps {
  message: MessageSummary
  lane: Lane
  now: number
  selected: boolean
  onOpen: () => void
  account?: string
  /** The four stored slots (ADR-0025) as the four drawn tiles (States / 01): `right` leading; `rightLong`, `leftLong`, `left` trailing from the inside out. */
  swipes: SwipeActions
  /** The Screener's own pair: LET IN (a full swipe runs it) and SCREEN OUT (it opens and stops). */
  screening: boolean
  triage: ReturnType<typeof useTriage>
  senders: ReturnType<typeof useSenderActions>
  verb: ReturnType<typeof useMailVerbs>
}

/**
 * A conversation in a lane (ADR-0113; brief M1, States / 01): the message row
 * in unicron's SwipeRow. The person's four swipe slots fill the four tiles,
 * and the row's menu lists the same actions and the rest of the brief's
 * (overflow button on hover, focus and touch; right-click; Menu key; Shift+F10).
 */
export function LaneConversation({ message: m, lane, now, selected, onOpen, account, swipes, screening, triage, senders, verb }: RowProps) {
  const [picking, setPicking] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const used = new Set<string>()
  const action = (id: SwipeActionId, tone: "primary" | "neutral"): SwipeRowAction | undefined => {
    const v = id === "none" || used.has(kind(id)) ? null : verb(id, m)
    if (!v) return undefined
    used.add(kind(id))
    return { icon: v.icon, label: v.label, tone, reversible: v.reversible, onAction: v.onAction }
  }
  let leading: SwipeRowAction | undefined
  let trailing: SwipeRowAction[]
  if (screening) {
    leading = { icon: "user--admin", label: "Let in", tone: "primary", reversible: true, onAction: () => senders.decide(m.from, "allowed") }
    trailing = [{ icon: "user--minus", label: "Screen out", tone: "primary", onAction: () => senders.decide(m.from, "screened_out") }]
  } else {
    leading = action(swipes.right, "primary")
    // The outer tile first, so a slot that repeats it is the one left out.
    const outer = action(swipes.left, "primary")
    const middle = action(swipes.leftLong, "neutral")
    const inner = action(swipes.rightLong, "neutral")
    trailing = [inner, middle, outer].filter((a) => a !== undefined)
  }

  const snoozable = !m.archived && m.mailbox !== "Sent"
  const menu = (
    <>
      {!used.has("archive") && (
        <DropdownMenuItem onClick={() => triage.toggleArchive(m)}>
          <Icon name={m.archived ? "reset" : "archive"} />
          {m.archived ? "Move to Inbox" : "Archive"}
        </DropdownMenuItem>
      )}
      {snoozable && (
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Icon name="time" />
            Snooze until
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent width="auto">
            {snoozeOptions().map((o) => (
              <DropdownMenuItem key={o.label} onClick={() => triage.snooze(m, o.until, o.label)}>
                {o.label}
                <span className="ml-auto pl-4 type-meta text-muted-foreground">{o.detail}</span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setPicking(true)}>
              <Icon name="calendar" />
              Pick date and time…
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      )}
      {!used.has("star") && (
        <DropdownMenuItem onClick={() => triage.toggleFlag(m)}>
          <Icon name={m.flagged ? "star--filled" : "star"} />
          {m.flagged ? "Unstar" : "Star"}
        </DropdownMenuItem>
      )}
      {!used.has("read") && (
        <DropdownMenuItem onClick={() => triage.toggleSeen(m)}>
          <Icon name={m.seen ? "email--new" : "view"} />
          {m.seen ? "Mark unread" : "Mark read"}
        </DropdownMenuItem>
      )}
      {/* A reminder needs your own message in the conversation; a single message from someone else has none. */}
      {!used.has("remind") && (m.mailbox === "Sent" || m.followUpAt != null || m.threadCount > 1) && (
        <DropdownMenuItem onClick={() => verb("remind", m)?.onAction()}>
          <Icon name="notification" />
          Remind me in 3 days
        </DropdownMenuItem>
      )}
      {!used.has("newsletters") && m.mailbox !== "Sent" && (
        <DropdownMenuItem onClick={() => verb("newsletters", m)?.onAction()}>
          <Icon name="blog" />
          Always in Newsletters
        </DropdownMenuItem>
      )}
    </>
  )

  return (
    <div ref={box} className="relative">
      <SwipeRow leading={leading} trailing={trailing}>
        <MessageRow message={m} lane={lane} now={now} selected={selected} onOpen={onOpen} account={account} menu={menu} />
      </SwipeRow>
      {picking && (
        // The row's menu is gone once a row in it is picked, so the picker stands at the row's top right, and focus goes back to the row.
        <DateTimePicker
          open
          onOpenChange={(open) => {
            if (open) return
            setPicking(false)
            box.current?.querySelector<HTMLElement>('[data-slot="list-row-main"]')?.focus()
          }}
          trigger={<span aria-hidden className="absolute top-4 right-3" />}
          title="Snooze"
          action="Snooze"
          onPick={(at) => triage.snooze(m, at, longTime(at))}
        />
      )}
    </div>
  )
}

/** Skeleton rows as States / 04 draws them: two bars, 20 apart, over a hairline, set in as far as a row's text. Five while a lane loads, three while more come. */
export function LoadingRows({ count, label }: { count: number; label: string }) {
  return (
    <div role="status" aria-busy="true" aria-label={label} className="flex flex-col px-3">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} variant="row" />
      ))}
    </div>
  )
}

/**
 * Desktop / 04's detail column beside an empty Inbox: what is snoozed and
 * when it comes back, in the snoozed lane's own order. Nothing when nothing is.
 */
export function SnoozedBeside({ accountId, now, onOpen, selectedId }: { accountId: string | null; now: number; onOpen: (m: MessageSummary) => void; selectedId: string | null }) {
  const snoozed = useSnoozed(accountId)
  if (!snoozed.length) return null
  return (
    <section aria-label="Snoozed" className="flex flex-col">
      <SectionHeader title={`Snoozed // back at ${rowTime(snoozed[0]!.snoozedUntil!, new Date(now * 1000))}`} count={snoozed.length} />
      <div role="list" aria-label="Snoozed">
        {snoozed.map((m) => (
          <div role="listitem" key={m.threadId}>
            <MessageRow message={m} selected={m.threadId === selectedId} onOpen={() => onOpen(m)} />
          </div>
        ))}
      </div>
    </section>
  )
}
