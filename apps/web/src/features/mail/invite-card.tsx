import { useQueryClient } from "@tanstack/react-query"
import { useState, type ReactNode } from "react"

import {
  AdaptiveMenu,
  AdaptiveMenuRadioGroup,
  AdaptiveMenuRadioItem,
  Button,
  FieldRow,
  FieldRowAction,
  FieldRowValue,
  SectionHeader,
  toast,
} from "@unicron/ui"
import { useMailAction } from "@/core/queries"
import type { Invite, InviteResponse } from "@/core/types"

import { MeetingPanel } from "../calendar/meeting-panel"
import { displayName } from "./format"
import { CounterRows, ProposeTimeForm, Quote, Result, YourCalendarRow } from "./invite-planning"
import { ANSWERS, fail, inviteTime, useInviteAnswer, useRowSize } from "./invite-words"

/**
 * The meeting a message carries (ADR-0093; brief M5): one table of methods
 * and states, drawn as Field Rows under a section header, with no card.
 *
 * - **request**, not answered: what it is (EVENT, WHEN with PROPOSE NEW TIME,
 *   WHERE, ORGANIZER, YOUR CALENDAR, CALENDAR with CHANGE) and the call rows.
 *   The answer itself is the conversation's needs-you block (its notice slot).
 * - **request**, answered: the same rows and YOUR ANSWER with CHANGE.
 * - **request**, outdated: one caption.
 * - **cancel**, **reply**, **counter**, **declinecounter**: their own rows and one result button.
 */

export function InviteCard({ invite, messageId, accountId }: { invite: Invite; messageId: string; accountId: string }) {
  switch (invite.method) {
    case "request":
      return invite.outdated ? (
        <Section label="Invitation">
          <p className="type-caption text-muted-foreground">Your calendar has a newer version of this event.</p>
        </Section>
      ) : (
        <Request invite={invite} messageId={messageId} accountId={accountId} />
      )
    case "cancel":
      return <Canceled invite={invite} messageId={messageId} />
    case "reply":
      return <Reply invite={invite} messageId={messageId} />
    case "counter":
      return (
        <Section label="New time proposed">
          <CounterRows invite={invite} messageId={messageId} />
        </Section>
      )
    case "declinecounter":
      return (
        <p className="type-body text-foreground" data-slot="invite-card">
          {invite.organizer ? displayName(invite.organizer) : "The organizer"} kept the original time.
        </p>
      )
    default:
      return null
  }
}

/** The invitation's own section: a header and its rows, no card. */
function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section aria-label={label} className="flex flex-col" data-slot="invite-card">
      <SectionHeader title={label} level={3} />
      <div className="flex flex-col pt-2">{children}</div>
    </section>
  )
}

function Request({ invite, messageId, accountId }: { invite: Invite; messageId: string; accountId: string }) {
  const size = useRowSize()
  const { answer, pending, error, writable, target, choose } = useInviteAnswer(invite, messageId, accountId)
  const [proposing, setProposing] = useState(false)
  const going = invite.attendees.filter((a) => a.status === "accepted").length
  const answered = ANSWERS.find((a) => a.value === invite.myStatus)
  const canPropose = !invite.recurring && invite.start != null
  return (
    <Section label="Invitation">
      {invite.start != null && invite.end != null && (
        <FieldRow
          size={size}
          label="When"
          rule="none"
          description={invite.proposed ? `You proposed ${inviteTime(invite.proposed.start, invite.proposed.end, false)}` : undefined}
          action={canPropose && <FieldRowAction onClick={() => setProposing(true)}>{invite.proposed ? "Propose another" : "Propose new time"}</FieldRowAction>}
        >
          <FieldRowValue truncate="wrap">{inviteTime(invite.start, invite.end, invite.allDay)}</FieldRowValue>
        </FieldRow>
      )}
      {invite.location && (
        <FieldRow size={size} label="Where">
          <FieldRowValue truncate="end">{invite.location}</FieldRowValue>
        </FieldRow>
      )}
      {invite.organizer && (
        <FieldRow size={size} label="Organizer">
          <FieldRowValue truncate="end">{`${displayName(invite.organizer)}${invite.attendees.length > 1 ? ` // ${invite.attendees.length} invited, ${going} going` : ""}`}</FieldRowValue>
        </FieldRow>
      )}
      {!invite.allDay && invite.start != null && <YourCalendarRow conflicts={invite.conflicts ?? []} />}
      {!invite.eventId && writable.length > 0 && (
        <FieldRow
          size={size}
          label="Calendar"
          action={
            writable.length > 1 && (
              <AdaptiveMenu title="Calendar" align="end" trigger={<FieldRowAction>Change</FieldRowAction>}>
                <AdaptiveMenuRadioGroup value={target} onValueChange={(v) => choose(String(v))}>
                  {writable.map((c) => (
                    <AdaptiveMenuRadioItem key={c.id} value={c.id}>
                      {c.name}
                    </AdaptiveMenuRadioItem>
                  ))}
                </AdaptiveMenuRadioGroup>
              </AdaptiveMenu>
            )
          }
        >
          {writable.find((c) => c.id === target)?.name ?? ""}
        </FieldRow>
      )}
      {answered && (
        <FieldRow
          size={size}
          label="Your answer"
          aria-live="polite"
          action={
            <AdaptiveMenu title="Your answer" align="end" trigger={<FieldRowAction loading={pending}>Change</FieldRowAction>}>
              <AdaptiveMenuRadioGroup value={invite.myStatus ?? ""} onValueChange={(v) => void answer(v as InviteResponse)}>
                {ANSWERS.map((a) => (
                  <AdaptiveMenuRadioItem key={a.value} value={a.value}>
                    {a.label}
                  </AdaptiveMenuRadioItem>
                ))}
              </AdaptiveMenuRadioGroup>
            </AdaptiveMenu>
          }
        >
          {`${answered.label}${invite.eventId ? " // in your calendar" : ""}`}
        </FieldRow>
      )}
      {error && (
        <p role="alert" className="type-caption text-destructive">
          {error}
        </p>
      )}
      <MeetingPanel meeting={invite.meeting} manage={invite.manage} compact />
      {canPropose && <ProposeTimeForm invite={invite} messageId={messageId} open={proposing} onClose={() => setProposing(false)} />}
    </Section>
  )
}

/** Applies what a message says about an event you have: a cancellation, or a guest's answer. */
function useApply(messageId: string, done: string) {
  const qc = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const apply = useMailAction((c) => c.applyInviteUpdate(messageId))
  const run = async () => {
    setError(null)
    try {
      await apply.mutateAsync(undefined)
      void qc.invalidateQueries({ queryKey: ["pim"] })
      toast(done)
    } catch (e) {
      setError(fail(e))
    }
  }
  return { run, pending: apply.isPending, error }
}

function Canceled({ invite, messageId }: { invite: Invite; messageId: string }) {
  const size = useRowSize()
  const title = invite.title || "(no title)"
  const remove = useApply(messageId, `Removed ${title} from your calendar`)
  return (
    <Section label="Canceled event">
      <p className="type-body text-foreground">{invite.organizer ? `${displayName(invite.organizer)} canceled this event.` : "This event was canceled."}</p>
      <FieldRow size={size} label="Event">
        <FieldRowValue truncate="end">
          <s>{title}</s>
        </FieldRowValue>
      </FieldRow>
      {invite.start != null && invite.end != null && (
        <FieldRow size={size} label="When">
          <FieldRowValue truncate="wrap">{inviteTime(invite.start, invite.end, invite.allDay)}</FieldRowValue>
        </FieldRow>
      )}
      <Result error={remove.error}>
        {invite.eventId && (
          <Button variant="secondary" loading={remove.pending} onClick={() => void remove.run()}>
            Remove from calendar
          </Button>
        )}
      </Result>
    </Section>
  )
}

const REPLIED: Record<string, string> = { accepted: "accepted", tentative: "said maybe to", declined: "declined" }

function Reply({ invite, messageId }: { invite: Invite; messageId: string }) {
  const size = useRowSize()
  const title = invite.title || "(no title)"
  const update = useApply(messageId, `Updated ${title}`)
  const who = invite.from ? displayName(invite.from) : "A guest"
  return (
    <Section label="Reply">
      <p className="type-body text-foreground">
        {who} {REPLIED[invite.from?.status ?? ""] ?? "replied to"} your invitation.
      </p>
      <FieldRow size={size} label="Event">
        <FieldRowValue truncate="end">{title}</FieldRowValue>
      </FieldRow>
      {invite.start != null && invite.end != null && (
        <FieldRow size={size} label="When">
          <FieldRowValue truncate="wrap">{inviteTime(invite.start, invite.end, invite.allDay)}</FieldRowValue>
        </FieldRow>
      )}
      {invite.comment && <Quote>{invite.comment}</Quote>}
      <Result error={update.error}>
        {invite.eventId && (
          <Button variant="secondary" loading={update.pending} onClick={() => void update.run()}>
            Update your event
          </Button>
        )}
      </Result>
    </Section>
  )
}
