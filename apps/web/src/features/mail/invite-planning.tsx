import { useQueryClient } from "@tanstack/react-query"
import { useRef, useState, type ReactNode } from "react"

import { Badge, Button, FieldRow, FieldRowAction, FieldRowValue, TextField, toast } from "@unicron/ui"
import { DatePicker } from "@/components/date-picker"
import { FormLayer, FormLayerForm } from "@/components/editor-frame"
import { useMailAction, useOccurrences } from "@/core/queries"
import type { Invite, Occurrence } from "@/core/types"
import { useLeaveGuard } from "@/lib/leave-guard"

import { dateInput, fromInputs, fromSecs, secs, timeInput } from "../calendar/dates"
import { displayName } from "./format"
import { clock, fail, folio, inviteTime, useRowSize } from "./invite-words"

/**
 * The invitation's planning parts (ADR-0093; brief M5): the time as the
 * frames write it, the YOUR CALENDAR row, a guest's counter-proposal, and the
 * Propose a new time form on f6's form layer.
 */

/** YOUR CALENDAR: what else is on your calendar then. Silence would read as "you're free", so it says so either way. */
export function YourCalendarRow({ conflicts }: { conflicts: Occurrence[] }) {
  const size = useRowSize()
  const [first, ...rest] = conflicts
  if (!first)
    return (
      <FieldRow size={size} label="Your calendar">
        <FieldRowValue truncate="wrap">Nothing else on your calendar then</FieldRowValue>
      </FieldRow>
    )
  return (
    <FieldRow size={size} label="Your calendar" badge={<Badge tone="warning">Clash</Badge>} description={rest.length > 0 ? `and ${rest.length} more` : undefined}>
      <FieldRowValue truncate="end">{`${first.title || "(no title)"} ${inviteTime(first.start, first.end, first.allDay, false)}`}</FieldRowValue>
    </FieldRow>
  )
}

/** A guest's note, as they wrote it. */
export function Quote({ children }: { children: ReactNode }) {
  return <blockquote className="type-body my-4 break-words text-muted-foreground rule-l ps-4">{children}</blockquote>
}

/** A section's result: its buttons, or a caption once it is answered, and a failed action's words beside them. */
export function Result({ error, children }: { error?: string | null; children: ReactNode }) {
  if (!children && !error) return null
  return (
    <div className="flex flex-col gap-2 pt-4">
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
      {error && (
        <p role="alert" className="type-caption text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

/** As organizer: a guest asks for another time (iTIP COUNTER). Take it (everyone gets the update) or keep yours. */
export function CounterRows({ invite, messageId }: { invite: Invite; messageId: string }) {
  const size = useRowSize()
  const qc = useQueryClient()
  const accept = useMailAction((c) => c.acceptCounter(messageId))
  const keep = useMailAction((c) => c.declineCounter(messageId))
  const [error, setError] = useState<string | null>(null)
  const who = invite.from ? displayName(invite.from) : "A guest"
  const title = invite.title || "(no title)"
  const run = async (yes: boolean) => {
    setError(null)
    try {
      await (yes ? accept : keep).mutateAsync(undefined)
      void qc.invalidateQueries({ queryKey: ["pim"] })
      toast(yes ? `Moved ${title} and told everyone` : `Kept the time and told ${who}`)
    } catch (e) {
      setError(fail(e))
    }
  }
  const busy = accept.isPending || keep.isPending
  return (
    <>
      <p className="type-body text-foreground">{who} proposed a new time</p>
      <FieldRow size={size} label="Event">
        <FieldRowValue truncate="end">{title}</FieldRowValue>
      </FieldRow>
      {invite.currentStart != null && invite.currentEnd != null && (
        <FieldRow size={size} label="Now">
          <FieldRowValue truncate="wrap">
            <s>{inviteTime(invite.currentStart, invite.currentEnd, invite.allDay)}</s>
          </FieldRowValue>
        </FieldRow>
      )}
      {invite.start != null && invite.end != null && (
        <FieldRow size={size} label="Proposed">
          <FieldRowValue truncate="wrap">{inviteTime(invite.start, invite.end, invite.allDay)}</FieldRowValue>
        </FieldRow>
      )}
      {invite.comment && <Quote>{invite.comment}</Quote>}
      {!invite.allDay && invite.start != null && <YourCalendarRow conflicts={invite.conflicts ?? []} />}
      <Result error={error}>
        {invite.answered ? (
          <p className="type-caption text-muted-foreground" aria-live="polite">
            {invite.answered === "accepted" ? "You moved the event to this time" : "You kept the original time"}
          </p>
        ) : !invite.eventId ? (
          <p className="type-caption text-muted-foreground">This event isn’t in your calendar any more.</p>
        ) : (
          <>
            <Button variant="secondary" loading={accept.isPending} disabled={busy} onClick={() => void run(true)}>
              Accept new time
            </Button>
            <Button variant="secondary" loading={keep.isPending} disabled={busy} onClick={() => void run(false)}>
              Keep original
            </Button>
          </>
        )}
      </Result>
    </>
  )
}

/**
 * Propose a new time (brief M5): a guest asks the organizer for another time
 * (iTIP COUNTER), in the form layer. Your answer stays as it is.
 */
export function ProposeTimeForm({ invite, messageId, open, onClose }: { invite: Invite; messageId: string; open: boolean; onClose: () => void }) {
  return <FormLayer open={open} onClose={onClose}>{open && <ProposeBody invite={invite} messageId={messageId} onDone={onClose} />}</FormLayer>
}

function ProposeBody({ invite, messageId, onDone }: { invite: Invite; messageId: string; onDone: () => void }) {
  const qc = useQueryClient()
  // Starts from your last proposal, else the invitation's own time.
  const [first] = useState(() => {
    const start = fromSecs(invite.proposed?.start ?? invite.start ?? 0)
    const length = (invite.end ?? 0) - (invite.start ?? 0) || 3600
    return { date: dateInput(start), from: timeInput(start), to: timeInput(fromSecs(secs(start) + length)) }
  })
  const [date, setDate] = useState(first.date)
  const [from, setFrom] = useState(first.from)
  const [to, setTo] = useState(first.to)
  const [note, setNote] = useState("")
  const [error, setError] = useState<string | null>(null)
  const ends = useRef<HTMLInputElement>(null)
  useLeaveGuard(() => date !== first.date || from !== first.from || to !== first.to || note.trim() !== "")
  const s = secs(fromInputs(date, from))
  const e = secs(fromInputs(date, to))
  const backwards = !(e > s)
  const { data: busy = [] } = useOccurrences(s, backwards ? s + 60 : e)
  const clashes = backwards ? [] : busy.filter((o) => !o.allDay && o.start < e && o.end > s && o.eventId !== invite.eventId)
  const propose = useMailAction((c, a: { start: number; end: number; note: string }) => c.proposeTime(messageId, a.start, a.end, a.note || null))
  const organizer = invite.organizer ? displayName(invite.organizer) : "the organizer"
  const submit = async () => {
    if (backwards) return ends.current?.focus()
    setError(null)
    try {
      await propose.mutateAsync({ start: s, end: e, note: note.trim() })
      void qc.invalidateQueries({ queryKey: ["pim"] })
      toast(`Asked ${organizer} about ${folio(s)} ${clock(s)}`)
      onDone()
    } catch (err) {
      setError(fail(err))
    }
  }
  return (
    <FormLayerForm overline="Propose a new time" title={invite.title || "(no title)"} primary={{ label: "Propose", loading: propose.isPending }} error={error} onSubmit={() => void submit()}>
      <FieldRow
        label="New date"
        rule="none"
        action={<DatePicker title="New date" value={date} onPick={setDate} align="end" trigger={<FieldRowAction type="button">Change</FieldRowAction>} />}
      >
        {folio(secs(fromInputs(date)))}
      </FieldRow>
      <div className="grid grid-cols-2 gap-4">
        <TextField label="Starts" type="time" required value={from} onChange={(ev) => setFrom(ev.target.value)} data-form-focus="" />
        <TextField ref={ends} label="Ends" type="time" required value={to} onChange={(ev) => setTo(ev.target.value)} error={backwards ? "The new time ends before it starts." : undefined} />
      </div>
      {!backwards && <YourCalendarRow conflicts={clashes} />}
      <TextField label={`Note to ${organizer}`} multiline minRows={3} helper="Optional" value={note} onChange={(ev) => setNote(ev.target.value)} />
    </FormLayerForm>
  )
}
