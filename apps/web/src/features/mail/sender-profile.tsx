import { useRef } from "react"

import { useUi } from "@/app/ui-store"
import { AppFrameSidePanel, Button, InitialTile, SectionHeader, Skeleton } from "@unicron/ui"
import { isMember } from "@/core/client"
import { useContactPhotos, useSenderProfile } from "@/core/queries"
import { useNowSecs } from "@/hooks/use-now"
import { partOfDay } from "@/lib/time"
import type { Address, MessageSummary, Occurrence } from "@/core/types"
import { OccurrenceCard } from "@/features/calendar/occurrence-card"
import { LinkedNotes } from "@/features/notes/linked-notes"

import { displayName, initials } from "./format"
import { MessageRow } from "./message-row"
import { useSenderPanel } from "./sender-panel"

const monthYear = (secs: number) => new Date(secs * 1000).toLocaleDateString(undefined, { month: "short", year: "numeric" })

/** Recent conversations the panel lists: enough to answer in context, not a second inbox. */
const RECENT = 5

/**
 * Who sent this, beside the message (ADR-0093; brief M5; ADR-0036 before
 * it): their face, name and address; their local time; how to reach them;
 * and what you have done together (mail, meetings), so you can answer in
 * context. `threadId` is the open conversation, left out of the mail list.
 */
export function SenderProfile({ from, threadId, onOpenThread }: { from: Address; threadId: string; onOpenThread?: (row: MessageSummary) => void }) {
  const { data: p, isPending } = useSenderProfile(from.email)
  const { data: photos } = useContactPhotos()
  const openComposer = useUi((s) => s.openComposer)
  const openContactEditor = useUi((s) => s.openContactEditor)
  const jumpTo = useUi((s) => s.jumpTo)
  const now = useNowSecs()
  if (isPending || !p) {
    return (
      <div role="status" aria-busy="true" aria-label="Loading who sent this" className="flex flex-col gap-4 [&_[data-slot=skeleton]]:size-full">
        <div className="size-16">
          <Skeleton />
        </div>
        <div className="h-5 w-2/3">
          <Skeleton />
        </div>
        <div className="h-4 w-1/2">
          <Skeleton />
        </div>
      </div>
    )
  }
  const c = p.contact
  const name = c?.fullName || p.name || from.name || p.email
  const phone = c?.phones[0]?.value
  const dial = phone?.replace(/[^\d+]/g, "")
  const photo = c?.photo ?? photos?.[p.email]
  const threads = p.activity.threads.filter((t) => t.threadId !== threadId).slice(0, RECENT)
  const meetings: Occurrence[] = [...p.activity.upcoming, ...p.activity.past]

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <InitialTile size="l" initials={initials({ name, email: p.email })} src={photo ?? undefined} />
        <div className="flex flex-col gap-1">
          <h3 className="type-subtitle break-words text-foreground">{name}</h3>
          {c && (c.title || c.org) && <p className="type-caption text-muted-foreground">{[c.title, c.org].filter(Boolean).join(", ")}</p>}
          <p className="type-meta break-all text-muted-foreground">{p.email}</p>
          {p.localOffset !== null && <LocalTime offset={p.localOffset} seen={p.offsetSeen} now={now} />}
        </div>
        {!c && <p className="type-body text-foreground">Not in your contacts.</p>}
        <div className="flex flex-wrap gap-2" role="group" aria-label={`Reach ${name}`}>
          <Button variant="secondary" size="sm" onClick={() => openComposer({ to: [{ name, email: p.email }] })}>
            Write
          </Button>
          {dial && (
            <Button variant="secondary" size="sm" nativeButton={false} render={<a href={`tel:${dial}`} />}>
              Call
            </Button>
          )}
          {dial && (
            <Button variant="secondary" size="sm" nativeButton={false} render={<a href={`sms:${dial}`} />}>
              Message
            </Button>
          )}
          {c ? (
            <Button variant="secondary" size="sm" onClick={() => jumpTo({ kind: "contact", id: c.id })}>
              Open card
            </Button>
          ) : (
            <Button variant="secondary" size="sm" onClick={() => openContactEditor({ initial: { fullName: p.name ?? from.name ?? "", emails: [{ value: p.email, label: null }] } })}>
              Add
            </Button>
          )}
        </div>
      </div>

      {p.received > 0 && (
        <section aria-label="Mail" className="flex flex-col gap-2">
          <SectionHeader title="Mail" count={p.received} level={4} />
          {p.firstSeen && <p className="type-meta text-muted-foreground">Since {monthYear(p.firstSeen)}</p>}
          {threads.length > 0 && (
            <ul aria-label={`Recent mail with ${name}`}>
              {threads.map((t) => (
                <li key={t.threadId}>
                  <MessageRow message={t} now={now} onOpen={() => (onOpenThread ? onOpenThread(t) : jumpTo({ kind: "thread", id: t.threadId, row: t }))} />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {meetings.length > 0 && (
        <section aria-label="Meetings" className="flex flex-col gap-2">
          <SectionHeader title="Meetings" count={meetings.length} level={4} />
          <ul aria-label={`Meetings with ${name}`} className="flex flex-col gap-2">
            {meetings.map((o) => (
              <li key={`${o.eventId}-${o.start}`}>
                <OccurrenceCard occurrence={o} date onOpen={() => jumpTo({ kind: "event", id: o.eventId, start: o.start })} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Notes are the gateway owner's; a team member sees nothing about them (brief 4.0). */}
      {c && !isMember() && <LinkedNotes target={{ kind: "contact", id: c.id }} title={c.fullName} />}
    </div>
  )
}

const FRESH = 90 * 86_400
const two = (n: number) => String(n).padStart(2, "0")

/** "3 h behind", "4½ h ahead", "same time": the gap to their clock, in the panel's mono line. */
function gap(offset: number, mine: number) {
  const d = offset - mine
  if (d === 0) return "same time"
  const h = Math.abs(d) / 60
  const n = Number.isInteger(h) ? `${h}` : Number.isInteger(h * 2) ? `${Math.floor(h)}½` : h.toFixed(2).replace(/0$/, "")
  return `${n} h ${d > 0 ? "ahead" : "behind"}`
}

/**
 * Their local time (ADR-0040), from the offset in the Date header of their
 * newest personal mail, live: `09:14 there // 3 h behind`, then the part of
 * their day when it is outside working hours ("Night there"), and "as of
 * {month}" when that mail is old.
 */
function LocalTime({ offset, seen, now }: { offset: number; seen: number | null; now: number }) {
  // Their wall clock: shift by their offset and read it as UTC.
  const there = new Date((now + offset * 60) * 1000)
  const mine = -new Date(now * 1000).getTimezoneOffset()
  const day = partOfDay(there.getUTCHours(), there.getUTCDay())
  const stale = seen !== null && now - seen > FRESH
  const parts = [`${two(there.getUTCHours())}:${two(there.getUTCMinutes())} there`, gap(offset, mine), day, stale && seen !== null ? `as of ${monthYear(seen)}` : null]
  return (
    <p data-slot="sender-local-time" className="type-meta text-muted-foreground">
      {parts.filter(Boolean).join(" // ")}
    </p>
  )
}

/**
 * The sender panel's place beside the columns (DC5, brief 3.2): a third
 * column, 312 wide, when the detail column keeps 960 beside it; otherwise,
 * and on a phone, a sheet from the side, opened by FROM or More › About.
 * Mail puts it in MasterDetail's `side` slot.
 */
export function SenderPanelSlot() {
  const { from, threadId, open, onOpenThread } = useSenderPanel()
  const body = useRef<HTMLDivElement>(null)
  if (!from || !threadId) return null
  const setOpen = (next: boolean) => useSenderPanel.setState({ open: next })
  return (
    <AppFrameSidePanel open={open} onOpenChange={setOpen} title={`About ${displayName(from)}`}>
      <div ref={body}>
        <SenderProfile
          key={from.email}
          from={from}
          threadId={threadId}
          onOpenThread={(t) => {
            // A sheet gives way to the conversation it opens; a column stays beside it.
            if (body.current?.closest('[role="dialog"]')) setOpen(false)
            onOpenThread?.(t)
          }}
        />
      </div>
    </AppFrameSidePanel>
  )
}
