import { cloneElement, useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode, type RefObject } from "react"

import { usePushedChrome } from "@/app/screen"
import { useUi } from "@/app/ui-store"
import {
  AdaptiveMenu,
  AdaptiveMenuItem,
  AppFrameInset,
  AppFramePageHead,
  Badge,
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogOverline,
  DialogTitle,
  EmptyState,
  FieldRow,
  FieldRowAction,
  FieldRowValue,
  FloatButton,
  Icon,
  InitialTile,
  ListRow,
  RadioGroup,
  RadioRow,
  SectionHeader,
  Skeleton,
  toast,
  useAppFrame,
} from "@unicron/ui"
import { getCoreClient } from "@/core/client"
import { useAccounts, useEvent, usePimAction } from "@/core/queries"
import type { Collection, EditScope, EventDetail as Detail, Repeat } from "@/core/types"
import { useConfirm } from "@/lib/confirm"
import { calendarSwatches, swatchSquare } from "@/lib/swatches"

import { displayName, initials } from "../mail/format"
import { LinkedNotes } from "../notes/linked-notes"
import { useQuickContext } from "../notes/use-quick-context"
import { addDays, clock, folio, fromSecs, sameDay } from "./dates"
import { MeetingPanel } from "./meeting-panel"
import { placeLabel, useJoin } from "./meeting"
import { inputFromDetail } from "./quick-add"
import { reminderLabel, travelLabel } from "./reminders"
import { deviceZone, zoneAbbr, zoneCity } from "./zones"

const REPEAT_TEXT: Record<Repeat, string | null> = {
  none: null,
  daily: "Every day",
  weekly: "Every week",
  monthly: "Every month",
  yearly: "Every year",
  custom: "Repeats (custom rule)",
}

/** A guest's answer, as the row's mono status says it (brief C2). */
const ANSWER: Record<string, string> = { accepted: "Going", declined: "Not going", tentative: "Maybe", "needs-action": "No reply" }

/** Only web links become links; anything else in URL stays text. */
const safeUrl = (u: string | null) => (u && /^https?:\/\//i.test(u) ? u : null)

/** A map search for the place, in the browser (brief C2, MAP). OpenStreetMap: no account, no tracking, any device. */
const mapSearch = (place: string) => `https://www.openstreetmap.org/search?query=${encodeURIComponent(place)}`

/** A place a map can find: not a call's link or its name ("Microsoft Teams Meeting"). */
function mappable(e: Pick<Detail, "location" | "meetingUrl">) {
  const place = e.location?.trim()
  if (!place || /:\/\//.test(place)) return null
  if (e.meetingUrl && /\b(meeting|call|zoom|teams|meet|webex|jitsi|whereby|facetime)\b/i.test(place)) return null
  return place
}

/** A clock time in another zone, by its own clock: `09:00`. */
const theirClock = (secs: number, zone: string) => fromSecs(secs).toLocaleTimeString("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" })

/** WHEN, as the frames write it: `16:30 – 17:15`, `All day`, or the days a span covers. */
function whenText(e: Pick<Detail, "start" | "end" | "allDay">) {
  const a = fromSecs(e.start)
  const b = fromSecs(e.end)
  if (e.allDay) {
    const last = addDays(b, -1)
    return sameDay(a, last) || last < a ? "All day" : `${folio(a)} – ${folio(last)}`
  }
  if (e.end === e.start) return clock(e.start)
  return sameDay(a, b) ? `${clock(e.start)} – ${clock(e.end)}` : `${folio(a)} ${clock(e.start)} – ${folio(b)} ${clock(e.end)}`
}

/** What the event's own rows need around it: its calendar, that calendar's account and swatch, and the people. */
function useEventFacts(e: Detail | undefined, calendars: Map<string, Collection>) {
  const { data: accounts = [] } = useAccounts()
  const swatches = useMemo(() => calendarSwatches(calendars.values()), [calendars])
  if (!e) return null
  const cal = calendars.get(e.calendarId)
  const account = accounts.find((a) => a.id === cal?.accountId)
  // Invited: the organizer owns the guest list (and the real copy of the event).
  const organizerIsMe = !e.organizer || accounts.some((a) => a.address.toLowerCase() === e.organizer!.email.toLowerCase())
  return { cal, account, swatch: cal ? (swatches.get(cal.id) ?? null) : null, organizerIsMe }
}

/**
 * EDIT and DELETE (brief C2): EDIT opens the form, after a menu of scopes for
 * a repeating event; DELETE asks first (decisions §10, DC10), with the three
 * scopes as RadioRows for a series. Deleting closes what showed it, with the
 * toast "Deleted {title}".
 */
function useEventActions(e: Detail | undefined, organizerIsMe: boolean, eventId: string, onDeleted: () => void) {
  const openEditor = useUi((s) => s.openEventEditor)
  const remove = usePimAction((c, { occurrence, scope }: { occurrence: number | null; scope: EditScope }) => c.deleteEvent(eventId, occurrence, scope))
  const confirm = useConfirm()
  const [scope, setScope] = useState<EditScope>("this")
  const picked = useRef<EditScope>("this")

  const edit = async (to: EditScope) => {
    if (!e) return
    const guests = e.attendees.filter((a) => !e.organizer || a.email.toLowerCase() !== e.organizer.email.toLowerCase()).map(({ name, email }) => ({ name, email }))
    // The whole series is edited from its first occurrence, so the dates apply
    // to all; one occurrence (or the rest of the series) from the one picked.
    const base: Detail = e.recurring && to === "all" ? await (await getCoreClient()).getEvent(e.eventId) : e
    openEditor({
      eventId: e.eventId,
      initial: { ...inputFromDetail(base), reminders: base.reminders, attendees: organizerIsMe ? guests : undefined },
      scope: e.recurring ? to : "all",
      occurrence: e.originalStart,
      guestOf: organizerIsMe ? undefined : displayName(e.organizer!),
    })
  }

  const askDelete = async () => {
    if (!e) return
    const title = e.title || "(no title)"
    setScope("this")
    picked.current = "this"
    const done = await confirm.ask({
      title: `Delete ${title}?`,
      confirmLabel: "Delete",
      run: () => remove.mutateAsync({ occurrence: e.recurring ? e.originalStart : null, scope: e.recurring ? picked.current : "all" }),
    })
    if (!done) return
    toast(`Deleted ${title}`)
    onDeleted()
  }

  const day = e ? folio(fromSecs(e.start)) : ""
  const question = confirm.question(
    e?.recurring ? (
      <RadioGroup
        aria-label="Which events"
        value={scope}
        onValueChange={(v) => {
          setScope(v as EditScope)
          picked.current = v as EditScope
        }}
      >
        <RadioRow value="this" label="This event" description={`Only ${day}.`} />
        <RadioRow value="following" label="This and following" description={`${day} and every one after it.`} />
        <RadioRow value="all" label="All events" description="The whole series." />
      </RadioGroup>
    ) : undefined,
  )
  return { edit, askDelete, question }
}

/** EDIT: a button, or for a series a menu of the three scopes. `trigger` draws it (a phone's float button). */
function EditControl({ recurring, onEdit, trigger }: { recurring: boolean; onEdit: (scope: EditScope) => void; trigger: ReactElement<Record<string, unknown>> }) {
  if (!recurring) return cloneElement(trigger, { onClick: () => onEdit("all") })
  return (
    <AdaptiveMenu title="Edit" trigger={trigger} align="start">
      <AdaptiveMenuItem onSelect={() => onEdit("this")}>This event</AdaptiveMenuItem>
      <AdaptiveMenuItem onSelect={() => onEdit("following")}>This and following</AdaptiveMenuItem>
      <AdaptiveMenuItem onSelect={() => onEdit("all")}>All events</AdaptiveMenuItem>
    </AdaptiveMenu>
  )
}

/** The secondary pair, as Desktop / 07 draws it. */
function EditDelete({ e, onEdit, onDelete }: { e: Detail; onEdit: (scope: EditScope) => void; onDelete: () => void }) {
  return (
    <>
      <EditControl
        recurring={e.recurring}
        onEdit={onEdit}
        trigger={
          <Button variant="secondary">
            <Icon name="edit" /> Edit
          </Button>
        }
      />
      <Button variant="secondary" onClick={onDelete}>
        <Icon name="trash-can" /> Delete
      </Button>
    </>
  )
}

/** A read-only calendar's one line, in place of EDIT and DELETE (brief C2). */
function ReadOnly({ cal }: { cal: Collection | undefined }) {
  return (
    <p className="flex items-center gap-2 type-caption text-text-secondary" data-slot="read-only">
      <Icon name="locked" size="sm" /> {`${cal?.name ?? "This calendar"} is read-only.`}
    </p>
  )
}

/**
 * Everything about one event, in the order of brief C2: the call, the Field
 * Rows that have a value, the guests, the notes, and the notes linked to it.
 * The same in the detail column, the review dialog and a pushed screen.
 */
function EventBody({ e, facts, join }: { e: Detail; facts: NonNullable<ReturnType<typeof useEventFacts>>; join: boolean }) {
  const frame = useAppFrame()
  const size = frame.phone ? "stacked" : "default"
  const { cal, account, swatch } = facts
  const repeat = REPEAT_TEXT[e.repeat]
  const place = placeLabel(e)
  const map = mappable(e)
  const zone = e.timeZone && !e.allDay && e.timeZone !== deviceZone() ? e.timeZone : null
  const link = safeUrl(e.url)
  const square = swatchSquare(swatch)
  // The organizer first, then the guests; the organizer is in the list once.
  const people = [...(e.organizer && !e.attendees.some((a) => a.email.toLowerCase() === e.organizer!.email.toLowerCase()) ? [{ ...e.organizer, status: null as string | null }] : []), ...e.attendees]
  const isOrganizer = (email: string) => !!e.organizer && e.organizer.email.toLowerCase() === email.toLowerCase()

  return (
    <div className="flex flex-col gap-8">
      {(e.meeting || e.manage?.length || e.meetingUrl) && (
        <div className="flex flex-col">
          {e.meeting || e.manage?.length ? <MeetingPanel meeting={e.meeting} manage={e.manage} join={join} /> : join && e.meetingUrl ? <BareJoin url={e.meetingUrl} appUrl={e.meetingAppUrl} /> : null}
        </div>
      )}
      <div className="flex flex-col" role="group" aria-label="Details">
        <FieldRow size={size} label="When">
          {whenText(e)}
        </FieldRow>
        {repeat && (
          <FieldRow size={size} label="Repeats">
            {repeat}
          </FieldRow>
        )}
        {place && (
          <FieldRow
            size={size}
            label="Where"
            action={
              map ? (
                <FieldRowAction href={mapSearch(map)} target="_blank" rel="noreferrer noopener" aria-label={`Map of ${map}`}>
                  Map
                </FieldRowAction>
              ) : undefined
            }
          >
            {place}
          </FieldRow>
        )}
        {e.travel && !e.allDay ? (
          <FieldRow size={size} label="Travel">
            {`${travelLabel(e.travel)} // leave by ${clock(e.start - e.travel * 60)}`}
          </FieldRow>
        ) : null}
        {zone && (
          <FieldRow size={size} label="Time zone">
            {`${zoneCity(zone)} time: ${theirClock(e.start, zone)} – ${theirClock(e.end, zone)} ${zoneAbbr(zone, fromSecs(e.start))}`}
          </FieldRow>
        )}
        {e.reminders.length > 0 && (
          <FieldRow size={size} label="Alert">
            {e.reminders.map((m) => reminderLabel(m, e.allDay)).join(", ")}
          </FieldRow>
        )}
        <FieldRow size={size} label="Calendar">
          <FieldRowValue truncate="end">
            {square && <span className={square} aria-hidden data-slot="swatch" />}
            {square && " "}
            {cal?.name ?? "Calendar"}
            {cal?.accountId && account && account.displayName !== cal.name && <span className="text-text-label">{` // ${account.displayName}`}</span>}
            {cal && !cal.accountId && <span className="text-text-label">{" // not synced"}</span>}
          </FieldRowValue>
        </FieldRow>
        {link && (
          <FieldRow
            size={size}
            label="Link"
            action={
              <FieldRowAction href={link} target="_blank" rel="noreferrer noopener">
                Open
              </FieldRowAction>
            }
          >
            <FieldRowValue truncate="middle">{link}</FieldRowValue>
          </FieldRow>
        )}
      </div>

      {people.length > 0 && (
        <section className="flex flex-col gap-2" aria-label="Guests">
          <SectionHeader title="Guests" count={people.length} level={3} />
          <ul className="flex flex-col">
            {people.map((p) => (
              <ListRow
                key={p.email}
                render={<li />}
                size="compact"
                leading={<InitialTile size="s" initials={initials(p)} />}
                title={displayName(p)}
                badge={isOrganizer(p.email) ? <Badge>Organizer</Badge> : undefined}
                status={p.status ? (ANSWER[p.status] ?? undefined) : undefined}
              />
            ))}
          </ul>
        </section>
      )}

      {e.notes && (
        <section className="flex flex-col gap-1" aria-labelledby={`notes-${e.eventId}`}>
          <h3 id={`notes-${e.eventId}`} className="type-overline text-text-label">
            Notes
          </h3>
          <p className="type-body break-words whitespace-pre-line">{e.notes}</p>
        </section>
      )}

      {!e.eventId.startsWith("special:") && (
        <LinkedNotes target={{ kind: "event", id: e.eventId }} title={`${e.title} · ${fromSecs(e.start).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`} />
      )}
    </div>
  )
}

/** A call the invitation says nothing more about than its link: JOIN alone. */
function BareJoin({ url, appUrl }: { url: string; appUrl: string | null | undefined }) {
  return <MeetingPanel meeting={{ service: "", url, appUrl: appUrl ?? null, meetingId: null, passcode: null, dialIn: [] }} join />
}

/** Loading (brief 4.0): a title bar and three lines. */
function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy data-slot="event-loading">
      <div className="grid h-12 w-2/3">
        <Skeleton />
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="grid h-5">
          <Skeleton />
        </div>
      ))}
    </div>
  )
}

/**
 * One event (ADR-0099; brief C2, Desktop / 07, Mobile / 09) in the detail
 * column beside Upcoming and the Day, or pushed over the calendar on a phone
 * and at medium width. On a phone the top bar holds Edit and Delete, and the
 * bottom row the place button and, when there is a call, Join call.
 */
export function EventDetailPane({ eventId, start, calendars, onDeleted }: { eventId: string; start: number; calendars: Map<string, Collection>; onDeleted: () => void }) {
  const frame = useAppFrame()
  const { data: e, error, isPending } = useEvent(eventId, start)
  // Quick Note links to the event that's open (ADR-0037); holidays aren't linkable.
  useQuickContext(e && !eventId.startsWith("special:") ? { kind: "event", id: eventId, label: e.title } : null)
  const facts = useEventFacts(e, calendars)
  const actions = useEventActions(e, facts?.organizerIsMe ?? true, eventId, onDeleted)
  const latest = useRef(actions)
  useEffect(() => {
    latest.current = actions
  })
  usePhoneChrome(frame.phone ? e : undefined, latest)

  let content: ReactNode
  if (isPending) content = <DetailSkeleton />
  else if (error || !e || !facts)
    content = <EmptyState size="sm" overline="Calendar" title="That event is gone." body={error instanceof Error ? error.message : undefined} />
  else
    content = (
      <article className="flex flex-col gap-8" aria-label={e.title || "(no title)"} data-slot="event-detail">
        <EventBody e={e} facts={facts} join={!frame.phone} />
        {e.writable ? (
          !frame.phone && (
            <div className="flex flex-wrap gap-4" role="group" aria-label="Event actions">
              <EditDelete e={e} onEdit={(s) => void actions.edit(s)} onDelete={() => void actions.askDelete()} />
            </div>
          )
        ) : (
          <ReadOnly cal={facts.cal} />
        )}
      </article>
    )

  return (
    <AppFrameInset>
      {e && !isPending && <AppFramePageHead overline={`Event // ${folio(fromSecs(e.start))}`} title={e.title || "(no title)"} size={frame.phone ? "sm" : "md"} />}
      {content}
      {actions.question}
    </AppFrameInset>
  )
}

/**
 * A phone's pushed event (Mobile / 09): Edit and Delete in the top bar; the
 * bottom row's start is the place button (a map search), its end the one
 * primary, Join call, when there is a call.
 */
function usePhoneChrome(e: Detail | undefined, latest: RefObject<ReturnType<typeof useEventActions>>) {
  const place = e ? mappable(e) : null
  const call = e?.meeting?.url ?? e?.meetingUrl ?? null
  const appUrl = e?.meeting?.appUrl ?? e?.meetingAppUrl ?? null
  const join = useJoin(call ?? "", appUrl)
  const joining = useRef(join)
  useEffect(() => {
    joining.current = join
  })
  const chrome = useMemo(
    () =>
      e
        ? {
            actions: e.writable ? (
              <>
                <EditControl recurring={e.recurring} onEdit={(s) => void latest.current.edit(s)} trigger={<FloatButton label="Edit" icon="edit" size="l" />} />
                <FloatButton label="Delete" icon="trash-can" size="l" onClick={() => void latest.current.askDelete()} />
              </>
            ) : undefined,
            start: place ? <FloatButton label={`Map of ${place}`} icon="location" size="l" onClick={() => window.open(mapSearch(place), "_blank", "noopener,noreferrer")} /> : undefined,
            end: call ? <FloatButton label="Join call" icon="video" kind="primary" size="l" onClick={() => joining.current.open()} /> : undefined,
          }
        : null,
    [e, place, call, latest],
  )
  usePushedChrome(chrome)
}

/**
 * An event opened from the Week, the Month or the Day's hours on a desktop
 * (brief C2, Q2): a review dialog of 560 over the full-width view. Its
 * footer holds EDIT and DELETE, then JOIN, the dialog's one primary.
 */
export function EventReview({ eventId, start, calendars, onClose }: { eventId: string | null; start: number; calendars: Map<string, Collection>; onClose: () => void }) {
  if (!eventId) return null
  return <EventReviewOpen key={`${eventId}@${start}`} eventId={eventId} start={start} calendars={calendars} onClose={onClose} />
}

function EventReviewOpen({ eventId, start, calendars, onClose }: { eventId: string; start: number; calendars: Map<string, Collection>; onClose: () => void }) {
  const { data: e, error, isPending } = useEvent(eventId, start)
  useQuickContext(e && !eventId.startsWith("special:") ? { kind: "event", id: eventId, label: e.title } : null)
  const facts = useEventFacts(e, calendars)
  const actions = useEventActions(e, facts?.organizerIsMe ?? true, eventId, onClose)
  const call = e?.meeting ?? (e?.meetingUrl ? { url: e.meetingUrl, appUrl: e.meetingAppUrl ?? null } : null)
  return (
    <>
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent size="review">
          <DialogHeader>
            <DialogOverline>{e ? `Event // ${folio(fromSecs(e.start))}` : "Event"}</DialogOverline>
            <DialogTitle>{e ? e.title || "(no title)" : isPending ? "Event" : "That event is gone."}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="flex flex-col gap-8 pb-4" data-slot="event-detail">
              {isPending ? <DetailSkeleton /> : error || !e || !facts ? <p className="type-body text-text-secondary">{error instanceof Error ? error.message : "It was deleted or moved."}</p> : <EventBody e={e} facts={facts} join={false} />}
              {e && facts && !e.writable && <ReadOnly cal={facts.cal} />}
            </div>
          </DialogBody>
          {e && (e.writable || call) && (
            <DialogFooter sticky>
              {e.writable && (
                <div className="mr-auto flex flex-wrap gap-2">
                  <EditDelete
                    e={e}
                    onEdit={(s) => {
                      onClose()
                      void actions.edit(s)
                    }}
                    onDelete={() => void actions.askDelete()}
                  />
                </div>
              )}
              {call && <DialogJoin url={call.url} appUrl={call.appUrl} />}
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
      {/* Beside the dialog, not in it: a layer of its own, so its scrim dims the dialog (ADR-0087). */}
      {actions.question}
    </>
  )
}

/** The review dialog's one primary: JOIN, a link to the call. */
function DialogJoin({ url, appUrl }: { url: string; appUrl: string | null }) {
  const join = useJoin(url, appUrl)
  return (
    <Button
      nativeButton={false}
      render={<a href={join.href} target={join.inApp ? undefined : "_blank"} rel="noreferrer" onClick={(ev) => join.native && (ev.preventDefault(), join.open())} />}
    >
      <Icon name="video" /> {`Join ${join.service}`}
    </Button>
  )
}
