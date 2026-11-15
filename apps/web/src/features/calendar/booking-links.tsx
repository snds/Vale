import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"

import { usePushedChrome } from "@/app/screen"
import { FormLayer, FormLayerForm } from "@/components/editor-frame"
import {
  AdaptiveDialog,
  AdaptiveMenu,
  AdaptiveMenuItem,
  AdaptiveMenuRadioGroup,
  AdaptiveMenuRadioItem,
  AppFrameInset,
  AppFramePageHead,
  Banner,
  Button,
  EmptyState,
  FieldRow,
  FieldRowAction,
  FieldRowValue,
  FilterChip,
  FilterChipGroup,
  FloatButton,
  ListRow,
  Skeleton,
  TextField,
  ToggleRow,
  toast,
  useAppFrame,
} from "@unicron/ui"
import { isDesktopApp } from "@/core/client"
import { useBookingLinks, useCollections, useCore, usePimAction } from "@/core/queries"
import type { BookingLink, BookingLinkInput, Collection } from "@/core/types"
import { useConfirm } from "@/lib/confirm"
import { useCopy } from "@/lib/copy"
import { useLeaveGuard } from "@/lib/leave-guard"
import { calendarSwatches, swatchSquare } from "@/lib/swatches"

import { BookingPage } from "../booking/page"
import { bookingOverline, closeBooking, editBookingLink, newBookingLink, openBookingLink, previewBookingLink, useBooking } from "./booking-store"

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))
const two = (n: number) => String(n).padStart(2, "0")
/** Minutes after midnight as the clock writes them: `09:00`. */
const hhmm = (m: number) => `${two(Math.floor(m / 60))}:${two(m % 60)}`
const minutesOf = (v: string) => {
  const [h, m] = v.split(":").map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}
/** The page's address. On a gateway it is the gateway's own; elsewhere the page opens only in Preview. */
const urlOf = (l: BookingLink) => `${location.origin}/book/${l.token}`
/** "30 min", "1 h 30 min". */
const length = (m: number) => (m < 60 ? `${m} min` : m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m / 60} h`)
/** The hours a link offers, as a row's mono line writes them: `09:00 – 17:00`. */
const hours = (l: BookingLinkInput) => `${hhmm(l.dayStart)} – ${hhmm(l.dayEnd)}`
/** A row's mono detail (brief C7): `30 MIN // WEEKDAYS // 09:00 – 17:00`; the line sets the capitals. */
const detailLine = (l: BookingLinkInput) => [length(l.minutes), l.weekdaysOnly ? "Weekdays" : "Every day", hours(l)].join(" // ")

/**
 * The desktop and phone apps have no address other people can reach, so a
 * booking page can't be shared from them (ADR-0026). The gateway can.
 */
function useWhere() {
  const { data: core } = useCore()
  const native = core?.kind === "native" || isDesktopApp()
  return { noAddress: !!core && native && !core.remote, shareable: !!core?.remote }
}

/** NEW LINK, the head's one text action (brief C7). */
export function BookingHeadAction() {
  const { noAddress } = useWhere()
  if (noAddress) return null
  return (
    <Button variant="ghost" size="sm" onClick={newBookingLink}>
      New link
    </Button>
  )
}

/**
 * Booking links (ADR-0026, ADR-0101; brief C7): a page where people pick one
 * of your free times. It is a place of Calendar (ADR-0084): the list column,
 * or the whole screen on a phone. Each row is the link's title over its
 * length, days and hours; pressing it opens the link beside the list, or
 * pushed. The form and the preview open from here and from the link.
 */
export function BookingLinks() {
  const { data: links = [], isPending, error, refetch } = useBookingLinks()
  const { noAddress } = useWhere()
  const open = useBooking((s) => s.open)
  const split = useAppFrame().split
  // Leaving Booking links closes what it had open.
  useEffect(() => closeBooking, [])

  let body: ReactNode
  if (noAddress) body = <EmptyState overline="Booking links" title="Booking pages need the gateway." body="Set them up where your gateway runs." />
  else if (isPending)
    body = (
      <div className="flex flex-col gap-5" aria-hidden>
        {[0, 1].map((i) => (
          <div key={i} className="grid h-12 gap-2">
            <Skeleton />
            <Skeleton />
          </div>
        ))}
      </div>
    )
  else if (error && !links.length) body = <EmptyState tone="critical" overline="Booking links" title="Can't load booking links." body={message(error)} actionLabel="Try again" onAction={() => void refetch()} />
  else if (!links.length) body = <EmptyState overline={bookingOverline(0)} title="No booking links." body="Create one and send it to someone." actionLabel="New link" onAction={newBookingLink} />
  else
    body = (
      <ul aria-label="Your booking links" className="flex flex-col">
        {links.map((l) => (
          <ListRow
            key={l.id}
            render={<li />}
            layout="inline"
            selected={split && open === l.id}
            title={l.title}
            meta={detailLine(l)}
            metaStyle="label"
            onClick={() => openBookingLink(l.id)}
          />
        ))}
      </ul>
    )
  return (
    <section aria-label="Booking links" className="flex flex-col" aria-busy={isPending || undefined}>
      {body}
      <LinkFormLayer links={links} />
      <PreviewLayer links={links} />
    </section>
  )
}

/** The link open in the detail column (a desktop) or pushed (narrower), if any. */
export function BookingLinkPane() {
  const open = useBooking((s) => s.open)
  const { data: links = [] } = useBookingLinks()
  const link = links.find((l) => l.id === open)
  if (!link) return null
  return <LinkDetail key={link.id} link={link} />
}

/** Delete, after one question: the page stops working at once, and nothing can bring its address back. */
function useDeleteLink(link: BookingLink) {
  const confirm = useConfirm()
  const remove = usePimAction((c) => c.deleteBookingLink(link.id))
  const ask = async () => {
    const yes = await confirm.ask({ title: "Delete this link?", description: "Its page stops working now.", confirmLabel: "Delete", run: () => remove.mutateAsync(undefined) })
    if (!yes) return
    openBookingLink(null)
    toast(`Deleted ${link.title}`)
  }
  return { ask, question: confirm.question() }
}

/**
 * One link (brief C7): its title, then Field Rows LINK (cut in the middle,
 * COPY LINK), LENGTH, HOURS, DAYS AHEAD, CALENDAR and NOTE, then PREVIEW,
 * EDIT and DELETE. A phone has EDIT and MORE (Preview, Delete) in its top bar.
 */
function LinkDetail({ link }: { link: BookingLink }) {
  const phone = useAppFrame().phone
  const { shareable } = useWhere()
  const { data: calendars = [] } = useCollections("calendar")
  const swatches = useMemo(() => calendarSwatches(calendars), [calendars])
  const calendar = calendars.find((c) => c.id === link.calendarId)
  const { copied, copy } = useCopy({ what: "link", label: "Booking link" })
  const del = useDeleteLink(link)
  // The top bar's DELETE runs the latest question, without rebuilding the bar on every render.
  const latest = useRef(del.ask)
  useEffect(() => {
    latest.current = del.ask
  })
  // The phone's pushed screen: EDIT, then MORE with PREVIEW and DELETE.
  const chrome = useMemo(
    () => ({
      actions: (
        <>
          <FloatButton label="Edit" icon="edit" size="l" onClick={() => editBookingLink(link.id)} />
          <AdaptiveMenu title={link.title} align="end" trigger={<FloatButton label="More" icon="overflow-menu--horizontal" size="l" />}>
            <AdaptiveMenuItem icon="view" onSelect={() => previewBookingLink(link.id)}>
              Preview
            </AdaptiveMenuItem>
            <AdaptiveMenuItem icon="trash-can" variant="destructive" onSelect={() => void latest.current()}>
              Delete
            </AdaptiveMenuItem>
          </AdaptiveMenu>
        </>
      ),
    }),
    [link.id, link.title, latest],
  )
  usePushedChrome(phone ? chrome : null)
  const size = phone ? "stacked" : "default"
  return (
    <AppFrameInset>
      <div className="flex flex-col gap-8" data-slot="booking-link" aria-label={link.title} role="region">
        <AppFramePageHead overline={`Booking link // ${length(link.minutes)}`} title={link.title} size="sm" />
        <div className="flex flex-col">
          <FieldRow
            size={size}
            label="Link"
            action={
              <FieldRowAction type="button" onClick={() => void copy(urlOf(link))} disabled={!shareable}>
                {copied ? "Copied" : "Copy link"}
              </FieldRowAction>
            }
            disabledReason={shareable ? undefined : "Only a gateway can share a page. Preview shows it here."}
          >
            <FieldRowValue truncate="middle" keepEnd={10}>
              {urlOf(link)}
            </FieldRowValue>
          </FieldRow>
          <FieldRow size={size} label="Length">
            {length(link.minutes)}
          </FieldRow>
          <FieldRow size={size} label="Hours" description={link.weekdaysOnly ? "Weekdays only" : "Every day, weekends too"}>
            {hours(link)}
          </FieldRow>
          <FieldRow size={size} label="Days ahead">
            {`Up to ${link.daysAhead} days`}
          </FieldRow>
          <FieldRow size={size} label="Calendar">
            <CalendarName calendar={calendar} square={swatchSquare(calendar ? swatches.get(calendar.id) : null)} />
          </FieldRow>
          <FieldRow size={size} label="Note" rule="both">
            <FieldRowValue truncate="wrap">{link.note ?? "None"}</FieldRowValue>
          </FieldRow>
        </div>
        {!phone && (
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Link actions">
            <Button variant="secondary" onClick={() => previewBookingLink(link.id)}>
              Preview
            </Button>
            <Button variant="secondary" onClick={() => editBookingLink(link.id)}>
              Edit
            </Button>
            <Button variant="secondary" onClick={() => void del.ask()}>
              Delete
            </Button>
          </div>
        )}
      </div>
      {del.question}
    </AppFrameInset>
  )
}

/** The calendar as its row shows it: the 8 px swatch square, then the name. */
function CalendarName({ calendar, square }: { calendar: Collection | undefined; square: string | null }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      {square && <span className={square} aria-hidden data-slot="swatch" />}
      <span className="truncate">{calendar?.name ?? "None"}</span>
    </span>
  )
}

/** The lengths a link can offer: five or more choices, so a menu (decisions §5). */
const LENGTHS = [15, 30, 45, 60, 90]
/** How far ahead: three short choices, so chips in the row (decisions §5). */
const DAYS = [3, 7, 14]

/** The form on the form layer (ADR-0087): new, or the link being edited. */
function LinkFormLayer({ links }: { links: BookingLink[] }) {
  const editing = useBooking((s) => s.editing)
  const close = () => useBooking.setState({ editing: null })
  const link = editing?.id ? links.find((l) => l.id === editing.id) : undefined
  return (
    <FormLayer open={!!editing && (!editing.id || !!link)} onClose={close}>
      {editing && <LinkForm key={editing.id ?? "new"} link={link} onDone={close} />}
    </FormLayer>
  )
}

/**
 * The form (brief C7): TITLE, LENGTH, FROM and TO, Weekdays only, DAYS
 * AHEAD, CALENDAR and NOTE; CREATE LINK or SAVE. A failed save stays open
 * with the core's words above the actions.
 */
function LinkForm({ link, onDone }: { link?: BookingLink; onDone: () => void }) {
  const { data: calendars = [] } = useCollections("calendar")
  const writable = useMemo(() => calendars.filter((c) => c.writable && !c.id.startsWith("interesting:")), [calendars])
  const swatches = useMemo(() => calendarSwatches(calendars), [calendars])
  const [initial] = useState(() => ({
    title: link?.title ?? "",
    minutes: link?.minutes ?? 30,
    start: hhmm(link?.dayStart ?? 9 * 60),
    end: hhmm(link?.dayEnd ?? 17 * 60),
    weekdays: link?.weekdaysOnly ?? true,
    days: link?.daysAhead ?? 7,
    note: link?.note ?? "",
  }))
  const [title, setTitle] = useState(initial.title)
  const [minutes, setMinutes] = useState(initial.minutes)
  const [start, setStart] = useState(initial.start)
  const [end, setEnd] = useState(initial.end)
  const [weekdays, setWeekdays] = useState(initial.weekdays)
  const [days, setDays] = useState(initial.days)
  const [note, setNote] = useState(initial.note)
  const [picked, setCalendarId] = useState<string | null>(null)
  const calendarId = picked ?? link?.calendarId ?? (writable.find((c) => !c.hidden) ?? writable[0])?.id ?? ""
  const calendar = writable.find((c) => c.id === calendarId)
  const [error, setError] = useState<string | null>(null)
  // Field Rows stack their label over the value on a phone (brief 4.0).
  const size = useAppFrame().phone ? "stacked" : "default"
  const dirty =
    title !== initial.title || minutes !== initial.minutes || start !== initial.start || end !== initial.end || weekdays !== initial.weekdays || days !== initial.days || note !== initial.note || picked !== null
  useLeaveGuard(dirty)
  const endError = minutesOf(end) <= minutesOf(start) ? "End after it starts." : null
  const save = usePimAction((c, input: BookingLinkInput) => c.saveBookingLink(link?.id ?? null, input))
  const submit = async () => {
    setError(null)
    try {
      const l = await save.mutateAsync({ title, minutes, calendarId, dayStart: minutesOf(start), dayEnd: minutesOf(end), weekdaysOnly: weekdays, daysAhead: days, note: note || null })
      toast(link ? `Saved ${l.title}` : `Created ${l.title}`)
      onDone()
      openBookingLink(l.id)
    } catch (e) {
      // The core's words, with a capital: "Give the link a title, like “Intro call”".
      setError(message(e).replace(/^./, (c) => c.toUpperCase()))
    }
  }
  return (
    <FormLayerForm
      overline={link ? "Edit booking link" : "New booking link"}
      title={title.trim() || (link ? "Edit booking link" : "New booking link")}
      primary={{ label: link ? "Save" : "Create link", disabled: !!endError || !writable.length, loading: save.isPending }}
      error={error}
      onSubmit={() => void submit()}
    >
      <div className="flex flex-col gap-6">
        <p className="type-body text-text-secondary">People pick one of your free times, and it lands in your calendar. Nothing else about your calendar shows.</p>
        <TextField label="Title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Intro call" data-form-focus="" />
        <div className="flex flex-col">
          <FieldRow
            size={size}
            label="Length"
            action={
              <AdaptiveMenu title="Length" align="end" trigger={<FieldRowAction type="button" aria-label="Change length">Change</FieldRowAction>}>
                <AdaptiveMenuRadioGroup value={String(minutes)} onValueChange={(v) => setMinutes(Number(v))}>
                  {LENGTHS.map((m) => (
                    <AdaptiveMenuRadioItem key={m} value={String(m)}>
                      {length(m)}
                    </AdaptiveMenuRadioItem>
                  ))}
                </AdaptiveMenuRadioGroup>
              </AdaptiveMenu>
            }
          >
            {length(minutes)}
          </FieldRow>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <TextField type="time" label="From" step={1800} value={start} onChange={(e) => e.target.value && setStart(e.target.value)} />
          <TextField type="time" label="To" step={1800} value={end} onChange={(e) => e.target.value && setEnd(e.target.value)} error={endError ?? undefined} />
        </div>
        <div className="flex flex-col">
          <ToggleRow label="Weekdays only" checked={weekdays} onCheckedChange={setWeekdays} />
          <FieldRow size={size} label="Days ahead">
            <FilterChipGroup type="single" label="Days ahead" value={String(days)} onValueChange={(v) => setDays(Number(v))}>
              {DAYS.map((d) => (
                <FilterChip key={d} value={String(d)} aria-label={`${d} days`}>
                  {`${d} days`}
                </FilterChip>
              ))}
            </FilterChipGroup>
          </FieldRow>
          {writable.length ? (
            <FieldRow
              size={size}
              label="Calendar"
              rule="both"
              description="A calendar on a mail account also emails the booker."
              action={
                <AdaptiveMenu title="Calendar" align="end" trigger={<FieldRowAction type="button" aria-label="Change calendar">Change</FieldRowAction>}>
                  <AdaptiveMenuRadioGroup value={calendarId} onValueChange={setCalendarId}>
                    {writable.map((c) => (
                      <AdaptiveMenuRadioItem key={c.id} value={c.id}>
                        {c.name}
                      </AdaptiveMenuRadioItem>
                    ))}
                  </AdaptiveMenuRadioGroup>
                </AdaptiveMenu>
              }
            >
              <CalendarName calendar={calendar} square={swatchSquare(calendar ? swatches.get(calendar.id) : null)} />
            </FieldRow>
          ) : (
            <Banner size="compact" tone="critical" body="No calendar takes new events. Add an account with a calendar first." />
          )}
        </div>
        <TextField multiline minRows={3} label="Note" helper="Shown on the page. Optional." value={note} onChange={(e) => setNote(e.target.value)} placeholder="On video; I'll send the link." />
      </div>
    </FormLayerForm>
  )
}

/**
 * The preview (brief C7): viewer 960, a sheet on a phone. A compact info
 * banner says what it is, above the real page, whose button reads
 * BOOK (PREVIEW): a booking made here is a real one.
 */
function PreviewLayer({ links }: { links: BookingLink[] }) {
  const id = useBooking((s) => s.preview)
  const link = links.find((l) => l.id === id)
  return (
    <AdaptiveDialog
      open={!!link}
      onOpenChange={(o) => !o && useBooking.setState({ preview: null })}
      size="viewer"
      height="full"
      overline="Preview"
      title={link?.title ?? "Preview"}
    >
      {link && (
        <div className="flex flex-col gap-8 pb-4" data-slot="booking-preview">
          <Banner size="compact" tone="info" body="Preview: what visitors see. Booking here adds a real event." />
          <BookingPage token={link.token} preview />
        </div>
      )}
    </AdaptiveDialog>
  )
}
