import { useQuery } from "@tanstack/react-query"
import { useEffect, useRef, useState, type ReactNode } from "react"

import {
  AppFrame,
  AppFrameFocus,
  AppLockup,
  Banner,
  Button,
  EmptyState,
  FieldRow,
  FieldRowAction,
  FieldRowValue,
  FilterChip,
  FilterChipGroup,
  PageHead,
  SectionHeader,
  Skeleton,
  TextField,
  useAppFrame,
} from "@unicron/ui"
import { visitorBook, visitorBooking, visitorChange, visitorManaged } from "@/core/client"
import type { Booked, ManagedBooking, TimeSlot } from "@/core/types"
import { useConfirm } from "@/lib/confirm"
import { useCopy } from "@/lib/copy"

import { clock, folio, fromSecs } from "../calendar/dates"

/** The visitor's own zone, short, as the page names it: "PST". */
const zoneName = (at = Date.now()) => new Intl.DateTimeFormat(undefined, { timeZoneName: "short" }).formatToParts(at).find((p) => p.type === "timeZoneName")?.value ?? Intl.DateTimeFormat().resolvedOptions().timeZone
const LONG_DAY = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" })
/** A time as a mono line writes it: `Fri 11.13 // 10:00 – 10:30`; the line sets the capitals. */
const when = (start: number, end: number) => `${folio(fromSecs(start))} // ${clock(start)} – ${clock(end)}`
/** The same in words, for a sentence and a screen reader: "Friday, November 13, 10:00 – 10:30". */
const spoken = (start: number, end: number) => `${LONG_DAY.format(start * 1000)}, ${clock(start)} – ${clock(end)}`
const message = (e: unknown) => (e instanceof Error ? e.message : String(e))
const capital = (s: string) => s.replace(/^./, (c) => c.toUpperCase())
/** The core's answer when someone else took the time first (ADR-0026). */
const taken = (e: unknown) => /just taken/i.test(message(e))

/** Slots grouped by the visitor's own local day. */
function byDay(slots: TimeSlot[]) {
  const days: { key: string; label: string; slots: TimeSlot[] }[] = []
  for (const s of slots) {
    const key = fromSecs(s.start).toDateString()
    if (days.at(-1)?.key === key) days.at(-1)!.slots.push(s)
    else days.push({ key, label: folio(fromSecs(s.start)), slots: [s] })
  }
  return days
}

/**
 * The page for a visitor (brief C7; ADR-0026, ADR-0031, ADR-0101): Vale's
 * focus frame, 432 wide, in Vale's theme as the visitor's system sets it,
 * with no account and no shell. In the owner's preview the same content
 * stands in the preview's column instead.
 */
function Visitor({ preview, children }: { preview: boolean; children: ReactNode }) {
  if (preview) return <div className="mx-auto flex w-full max-w-(--c-app-frame-focus) flex-col gap-8">{children}</div>
  return (
    <AppFrame>
      <AppFrameFocus lockup={<AppLockup name="Vale" />} aria-label="Booking">
        <div className="flex flex-col gap-8">{children}</div>
      </AppFrameFocus>
    </AppFrame>
  )
}

/** Free times are loading: chip-sized bars, and the words for a screen reader. */
function Loading({ what }: { what: string }) {
  return (
    <div className="flex flex-col gap-8" data-slot="booking-loading">
      <p className="sr-only" role="status">
        {what}
      </p>
      <div className="grid h-24 content-end gap-3" aria-hidden>
        <div className="h-4 w-24">
          <Skeleton />
        </div>
        <div className="h-9 w-56">
          <Skeleton />
        </div>
      </div>
      <div className="flex flex-col gap-3" aria-hidden>
        {[0, 1].map((d) => (
          <div key={d} className="flex flex-col gap-2">
            <div className="h-4 w-16">
              <Skeleton />
            </div>
            <div className="flex flex-wrap gap-2">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-6 w-14">
                  <Skeleton />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** The link is off or was never one: the same answer for both, as the gateway gives (ADR-0026). */
function Inactive({ overline }: { overline: string }) {
  return <EmptyState tone="critical" overline={overline} title="This link isn't active." body="Ask whoever sent it for a new one." />
}

/**
 * The times as one single-choice chip group across all days (brief C7): a
 * mono label per day, its times under it. The arrow keys run through every
 * time; each time's name says its day.
 */
function Times({ label, slots, value, onPick }: { label: string; slots: TimeSlot[]; value: number | null; onPick: (s: TimeSlot) => void }) {
  return (
    <FilterChipGroup
      type="single"
      label={label}
      value={value === null ? null : String(value)}
      onValueChange={(v) => {
        const s = slots.find((x) => String(x.start) === v)
        if (s) onPick(s)
      }}
    >
      {byDay(slots).map((d) => (
        // 8 inside a day, 16 between days: the days read as groups (rules 12.2, 1:2).
        <div key={d.key} className="flex w-full flex-col gap-2 not-first:pt-2" data-slot="booking-day">
          <span className="type-overline text-text-label" aria-hidden>
            {d.label}
          </span>
          <div className="flex flex-wrap gap-2">
            {d.slots.map((s) => (
              <FilterChip key={s.start} value={String(s.start)} aria-label={spoken(s.start, s.end)}>
                {clock(s.start)}
              </FilterChip>
            ))}
          </div>
        </div>
      ))}
    </FilterChipGroup>
  )
}

/**
 * A scheduling link's public page (brief C7, B; ADR-0026): the link's head,
 * FREE TIMES, YOUR DETAILS and one primary BOOK. It only ever reads the
 * link's free times and writes one booking.
 */
export function BookingPage({ token, preview = false }: { token: string; preview?: boolean }) {
  const { data, error, isPending, refetch } = useQuery({ queryKey: ["pim", "booking-page", token], queryFn: () => visitorBooking(token), retry: false, refetchOnMount: "always" })
  const [done, setDone] = useState<Booked | null>(null)
  const [peek, setPeek] = useState(false)
  // In the owner's preview, the booker's own page opens right here (ADR-0031).
  if (done && peek) return <ManageBookingPage token={token} code={done.code} preview />
  return (
    <Visitor preview={preview}>
      {done ? (
        <Confirmed booked={done} token={token} preview={preview} onPeek={() => setPeek(true)} />
      ) : isPending ? (
        <Loading what="Loading free times…" />
      ) : error || !data ? (
        <Inactive overline="Book" />
      ) : (
        <>
          <div className="flex flex-col gap-4">
            <PageHead overline={`Book // ${data.minutes} min`} title={data.title} size="sm" />
            <div className="flex flex-col gap-2">
              <p className="type-body text-text-secondary">With {data.host}</p>
              {data.note && <p className="type-body whitespace-pre-line">{data.note}</p>}
            </div>
          </div>
          {data.slots.length === 0 ? (
            <EmptyState size="sm" overline="Free times // 00" title="No free times right now." body="Check back later, or reply to whoever sent the link." />
          ) : (
            <BookForm token={token} slots={data.slots} preview={preview} onBooked={setDone} onTaken={() => void refetch()} />
          )}
        </>
      )}
    </Visitor>
  )
}

function BookForm({ token, slots, preview, onBooked, onTaken }: { token: string; slots: TimeSlot[]; preview: boolean; onBooked: (b: Booked) => void; onTaken: () => void }) {
  const phone = useAppFrame().phone
  const [pick, setPick] = useState<number | null>(null)
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<{ field: "name" | "email" | null; text: string } | null>(null)
  const [wasTaken, setWasTaken] = useState(false)
  // The banner stands above the times, which may be far up the page from BOOK: bring them into view.
  const times = useRef<HTMLElement>(null)
  useEffect(() => {
    if (wasTaken) times.current?.scrollIntoView({ block: "start" })
  }, [wasTaken])
  // A time that has gone since the times reloaded is no longer picked.
  const picked = pick !== null && slots.some((s) => s.start === pick) ? pick : null
  const submit = async () => {
    if (picked === null) return
    setBusy(true)
    setProblem(null)
    setWasTaken(false)
    try {
      onBooked(await visitorBook(token, { start: picked, name, email, note: note || null }))
    } catch (e) {
      if (taken(e)) {
        // Someone else took it first: say so above the times, which load again without it.
        setWasTaken(true)
        setPick(null)
        onTaken()
      } else {
        const text = capital(message(e))
        setProblem({ field: /email/i.test(text) ? "email" : /name/i.test(text) ? "name" : null, text })
      }
    } finally {
      setBusy(false)
    }
  }
  return (
    <form
      className="flex flex-col gap-8"
      aria-label="Book a time"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <section ref={times} className="flex scroll-mt-4 flex-col gap-4" aria-label="Free times">
        <SectionHeader title="Free times" />
        {wasTaken && <Banner size="compact" tone="critical" body="That time was just taken. Pick another." />}
        <p className="type-caption text-text-secondary">Times are in your time zone ({zoneName()}).</p>
        <Times label="Free times" slots={slots} value={picked} onPick={(s) => setPick(s.start)} />
      </section>
      <section className="flex flex-col gap-4" aria-label="Your details">
        <SectionHeader title="Your details" />
        <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required error={problem?.field === "name" ? problem.text : undefined} />
        <TextField label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required error={problem?.field === "email" ? problem.text : undefined} />
        <TextField multiline minRows={3} label="Note" helper="Optional." value={note} onChange={(e) => setNote(e.target.value)} />
      </section>
      {problem && !problem.field && <Banner size="compact" tone="critical" body={problem.text} />}
      <div className="flex">
        <Button type="submit" block={phone} loading={busy} disabled={picked === null} disabledReason={picked === null ? "Pick a time first." : undefined}>
          {preview ? "Book (preview)" : "Book"}
        </Button>
      </div>
    </form>
  )
}

/**
 * Booked (brief C7): BOOKED, "You're booked.", the booking and its time, the
 * invitation line or the host's-calendar line, then the private link to
 * change or cancel it, with COPY LINK.
 */
function Confirmed({ booked, token, preview, onPeek }: { booked: Booked; token: string; preview: boolean; onPeek: () => void }) {
  const manage = `${location.origin}/book/${token}/b/${booked.code}`
  const { copied, copy } = useCopy({ what: "link", label: "Your booking's link" })
  const phone = useAppFrame().phone
  return (
    <div className="flex flex-col gap-8" data-slot="booking-booked">
      <div className="flex flex-col gap-4" role="status">
        <PageHead overline="Booked" title="You're booked." size="sm" />
        <div className="flex flex-col gap-2">
          <p className="type-body">
            {booked.title} with {booked.host}
          </p>
          <p className="type-body-strong">{when(booked.start, booked.end)}</p>
          <p className="type-body text-text-secondary">{booked.invited ? "A calendar invitation is on its way to your email." : `It's in ${booked.host}'s calendar. They'll be in touch if anything changes.`}</p>
        </div>
      </div>
      <FieldRow
        size={phone ? "stacked" : "default"}
        label="Change or cancel"
        rule="both"
        description={preview ? "The booker gets this link to pick a new time or cancel." : "Keep it. It's only for you."}
        action={
          preview ? (
            <FieldRowAction type="button" onClick={onPeek}>
              See their page
            </FieldRowAction>
          ) : (
            <FieldRowAction type="button" onClick={() => void copy(manage)}>
              {copied ? "Copied" : "Copy link"}
            </FieldRowAction>
          )
        }
      >
        <FieldRowValue truncate="middle" keepEnd={10}>
          {manage}
        </FieldRowValue>
      </FieldRow>
    </div>
  )
}

/**
 * A booking's own page (brief C7, C; ADR-0031), opened by its private code:
 * BOOKING, the title, who it is with, WHEN and BOOKED BY; then PICK A NEW
 * TIME (the link's free times as chips and a primary MOVE) and a text
 * CANCEL BOOKING that asks. No sign-in: the code is the key, and it opens
 * this one booking only.
 */
export function ManageBookingPage({ token, code, preview = false }: { token: string; code: string; preview?: boolean }) {
  const { data, error, isPending, refetch } = useQuery({ queryKey: ["pim", "managed-booking", token, code], queryFn: () => visitorManaged(token, code), retry: false, refetchOnMount: "always" })
  return (
    <Visitor preview={preview}>
      {isPending ? <Loading what="Loading your booking…" /> : error || !data ? <Inactive overline="Booking" /> : <Manage token={token} code={code} data={data} refetch={refetch} />}
    </Visitor>
  )
}

function Manage({ token, code, data, refetch }: { token: string; code: string; data: ManagedBooking; refetch: () => Promise<unknown> }) {
  const phone = useAppFrame().phone
  const confirm = useConfirm()
  const [moving, setMoving] = useState(false)
  const [pick, setPick] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [wasTaken, setWasTaken] = useState(false)
  const [moved, setMoved] = useState<string | null>(null)
  const picked = pick !== null && data.slots.some((s) => s.start === pick) ? pick : null
  const size = phone ? "stacked" : "default"

  const move = async () => {
    if (picked === null) return
    setBusy(true)
    setProblem(null)
    setWasTaken(false)
    try {
      const b = await visitorChange(token, code, { action: "reschedule", start: picked })
      setMoved(`Moved to ${spoken(b.start, b.end)}.`)
      setMoving(false)
      setPick(null)
      await refetch()
    } catch (e) {
      if (taken(e)) {
        setWasTaken(true)
        setPick(null)
      } else setProblem(capital(message(e)))
      void refetch()
    } finally {
      setBusy(false)
    }
  }
  const cancel = () =>
    void confirm.ask({
      title: "Cancel this booking?",
      description: `${data.host} will see it's off their calendar.`,
      confirmLabel: "Cancel booking",
      cancelLabel: "Keep it",
      run: async () => {
        await visitorChange(token, code, { action: "cancel" })
        setMoved(null)
        await refetch()
      },
    })

  let actions: ReactNode
  if (data.cancelled) actions = null
  else if (data.past) actions = <p className="type-body text-text-secondary">This booking has started, so it can't be changed here.</p>
  else if (moving)
    actions = (
      <section className="flex flex-col gap-4" aria-label="New times">
        <SectionHeader title="New times" />
        {wasTaken && <Banner size="compact" tone="critical" body="That time was just taken. Pick another." />}
        {data.slots.length ? (
          <>
            <p className="type-caption text-text-secondary">In your time zone ({zoneName()}).</p>
            <Times label="New times" slots={data.slots} value={picked} onPick={(s) => setPick(s.start)} />
          </>
        ) : (
          <p className="type-body text-text-secondary">No other free times right now.</p>
        )}
        {problem && <Banner size="compact" tone="critical" body={problem} />}
        <div className="flex flex-wrap items-center gap-2">
          <Button block={phone} loading={busy} disabled={picked === null} disabledReason={picked === null && data.slots.length ? "Pick a time first." : undefined} onClick={() => void move()}>
            Move
          </Button>
          <Button variant="ghost" onClick={() => (setMoving(false), setPick(null), setWasTaken(false))} disabled={busy}>
            Keep the current time
          </Button>
        </div>
      </section>
    )
  else
    actions = (
      <div className="flex flex-wrap items-start gap-2" role="group" aria-label="Change this booking">
        <Button variant="secondary" onClick={() => (setMoving(true), setMoved(null))} disabled={data.movesLeft === 0} disabledReason={data.movesLeft === 0 ? `It has moved as often as it can. Write to ${data.host}.` : undefined}>
          Pick a new time
        </Button>
        <Button variant="ghost" onClick={cancel}>
          Cancel booking
        </Button>
      </div>
    )

  return (
    <>
      <div className="flex flex-col gap-4">
        <PageHead overline="Booking" title={data.title} size="sm" />
        <p className="type-body text-text-secondary">With {data.host}</p>
      </div>
      {data.cancelled && (
        <p className="type-body-strong" role="status">
          This booking is canceled.
        </p>
      )}
      {moved && (
        <div role="status">
          <Banner size="compact" tone="success" body={moved} />
        </div>
      )}
      <div className="flex flex-col">
        <FieldRow size={size} label={data.cancelled ? "Was" : "When"} description={`In your time zone (${zoneName(data.start * 1000)})`}>
          {when(data.start, data.end)}
        </FieldRow>
        <FieldRow size={size} label="Booked by" rule="both">
          {data.name}
        </FieldRow>
      </div>
      {actions}
      {confirm.question()}
    </>
  )
}
