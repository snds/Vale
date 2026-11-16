import { useDeferredValue, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react"

import type { SearchScope } from "@/app/places"
import { useScreenFact, useScreenPlace } from "@/app/screen"
import { useUi } from "@/app/ui-store"
import { AppFrameInset, Button, EmptyState, FilterChip, FilterChipGroup, SearchField, SectionHeader, Skeleton, formatNavCount } from "@unicron/ui"
import { LoadState } from "@/components/load-state"
import { MasterDetail } from "@/components/master-detail"
import { isMember } from "@/core/client"
import { useAccounts, useCollections, useMe } from "@/core/queries"
import type { ContactSummary, MessageSummary, NoteSummary, Occurrence } from "@/core/types"
import { OccurrenceCard } from "@/features/calendar/occurrence-card"
import { calendarSwatches, eventSwatch } from "@/lib/swatches"
import { PersonRow } from "@/features/contacts/person-row"
import { LANES } from "@/features/mail/lanes"
import { MessageRow } from "@/features/mail/message-row"
import { NoteRow } from "@/features/notes/note-row"
import { useNowSecs } from "@/hooks/use-now"
import { useSettled } from "@/hooks/use-settled"

import { setSearchField } from "./field"
import { leaveSearch } from "./open"
import { FoundDetail, FoundSide } from "./found-detail"
import { openedKey, type Opened } from "./opened"
import { EVENT_DAYS, useContactResults, useEventResults, useLaneResults, useMailResults, useNoteResults, type Results } from "./use-results"

type Kind = "mail" | "calendar" | "contacts" | "notes"

/** How long typing pauses before the kinds not on screen read the words (Vale 39). */
export const OTHER_KINDS_AFTER_MS = 250

/** Each kind as its chip, its section header and its empty line name it. */
const KINDS: { id: Kind; chip: string; header: string; none: (q: string) => string }[] = [
  { id: "mail", chip: "Mail", header: "Mail // newest first", none: (q) => `No mail has “${q}”.` },
  { id: "calendar", chip: "Calendar", header: `Events // ${EVENT_DAYS.back} days back, ${EVENT_DAYS.ahead} ahead`, none: (q) => `No event from ${EVENT_DAYS.back} days back to ${EVENT_DAYS.ahead} ahead has “${q}”.` },
  { id: "contacts", chip: "Contacts", header: "People", none: (q) => `No one matches “${q}”.` },
  { id: "notes", chip: "Notes", header: "Notes", none: (q) => `No note has “${q}”.` },
]
/** How many rows of each kind All shows before "Show all". */
const PEEK = 3
/** What a result row is to the arrow keys: a row's main control, or an event card. */
const RESULT = '[data-slot="list-row-main"], button:has(> [data-slot="calendar-event-bar"])'

/**
 * Search, as a place of its own (ADR-0085, ADR-0096; brief X2): one field,
 * and chips that say what it looks through, each with its count once every
 * row is in. It stands in the list column in place of the open section,
 * which stays as it was behind it. A result opens beside the list as it
 * would in its own section (a pushed screen on a phone and at medium width),
 * so Back returns to the results with the words kept. ↑ and ↓ move through
 * the results and Enter opens one. Esc closes what is open, then clears the
 * field, then leaves for where you came from.
 */
export function SearchView() {
  const place = useUi((s) => s.search)
  const setQuery = useUi((s) => s.setSearchQuery)
  const setScope = useUi((s) => s.setSearchScope)
  // A team member works the mail and nothing else (ADR-0063): no chips, and never more than mail.
  const member = isMember()
  const asked = place?.scope ?? "all"
  const lane = place?.lane ?? null
  // With no chips to widen it, a team member always looks through all mail.
  const scope: SearchScope = member ? "mail" : asked === "lane" ? (lane ? "lane" : "mail") : asked
  const typed = place?.query ?? ""
  const query = useDeferredValue(typed.trim())
  const on = query !== ""
  // Vale 39: the chosen kind reads as you type; the other kinds read once typing pauses, so each chip
  // still gets its count without a read of every kind on every key. Cleared words clear them at once.
  const paused = useSettled(query, OTHER_KINDS_AFTER_MS)
  const later = query === "" ? "" : paused

  // Mail's account choice narrows mail here as it does there (brief X2).
  const accountId = useUi((s) => s.mailAccount)
  const { data: accounts = [] } = useAccounts()
  const account = accounts.find((a) => a.id === accountId)?.id ?? null
  const me = useMe()
  const now = useNowSecs()
  const { data: calendars = [] } = useCollections("calendar")
  const swatches = calendarSwatches(calendars)

  // Every kind is read once there are words, so each chip can say its count (brief X2). A team member reads mail alone.
  // The kinds on screen read the words as typed; the others wait for the pause (Vale 39).
  const chosen = (k: Kind | "lane") => scope === "all" || scope === k
  const wordsFor = (k: Kind | "lane") => (chosen(k) ? query : later)
  const inLane = useLaneResults(lane, account, me.id, wordsFor("lane"), wordsFor("lane") !== "" && !member)
  const mail = useMailResults(account, wordsFor("mail"), wordsFor("mail") !== "")
  const events = useEventResults(wordsFor("calendar"), now, wordsFor("calendar") !== "" && !member)
  const people = useContactResults(wordsFor("contacts"), wordsFor("contacts") !== "" && !member)
  const notes = useNoteResults(wordsFor("notes"), wordsFor("notes") !== "" && !member)

  // What is open beside the results, or pushed over them. A new search starts with nothing open.
  const [opened, setOpened] = useState<Opened | null>(null)
  const [openedFor, setOpenedFor] = useState(`${scope}/${query}`)
  if (openedFor !== `${scope}/${query}`) {
    setOpenedFor(`${scope}/${query}`)
    if (opened) setOpened(null)
  }
  const openKey = opened ? openedKey(opened) : null
  // A conversation's row as the results have it now (a star, read or not), not as it was when opened.
  const fresh = (o: Opened): Opened => (o.kind === "thread" ? { ...o, row: [...inLane.rows, ...mail.rows].find((m) => m.threadId === o.row.threadId) ?? o.row } : o)
  const open = (o: Opened) => setOpened(o)

  const accountOf = (m: MessageSummary) => (accounts.length > 1 && !account ? accounts.find((a) => a.id === m.accountId)?.displayName : undefined)
  const rows: { [K in Kind]: (limit?: number) => ReactNode } = {
    mail: (limit) =>
      (scope === "lane" ? inLane : mail).rows.slice(0, limit).map((m) => {
        const o: Opened = { kind: "thread", row: m }
        return <MessageRow key={m.threadId} message={m} now={now} account={accountOf(m)} query={query} selected={openKey === openedKey(o)} onOpen={() => open(o)} />
      }),
    calendar: (limit) =>
      events.rows.slice(0, limit).map((ev) => {
        // A birthday is its person's, as on the calendar.
        const o: Opened = ev.contactId ? { kind: "contact", id: ev.contactId } : { kind: "event", id: ev.eventId, start: ev.start }
        return <OccurrenceCard key={`${ev.eventId}/${ev.start}`} occurrence={ev} date swatch={eventSwatch(swatches.get(ev.calendarId))} query={query} selected={openKey === openedKey(o)} onOpen={() => open(o)} />
      }),
    contacts: (limit) =>
      people.rows.slice(0, limit).map((c) => {
        const o: Opened = { kind: "contact", id: c.id }
        return <PersonRow key={c.id} contact={c} query={query} selected={openKey === openedKey(o)} onOpen={() => open(o)} />
      }),
    notes: (limit) =>
      notes.rows.slice(0, limit).map((n) => {
        const o: Opened = { kind: "note", id: n.id }
        return <NoteRow key={n.id} note={n} query={query} selected={openKey === openedKey(o)} onOpen={() => open(o)} />
      }),
  }
  // Each kind's own results, as its chip counts them; in a lane, Mail's rows are the lane's.
  const byKind = { mail, calendar: events, contacts: people, notes }
  const found: { [K in Kind]: Results<MessageSummary | Occurrence | ContactSummary | NoteSummary> } = { mail: scope === "lane" ? inLane : mail, calendar: events, contacts: people, notes }
  const shown: Kind[] = scope === "all" ? ["mail", "calendar", "contacts", "notes"] : [scope === "lane" ? "mail" : scope]
  const pending = shown.some((k) => found[k].pending)
  const failed = shown.filter((k) => found[k].failed)
  const error = shown.map((k) => found[k].error).find((e) => e) ?? null
  const total = shown.reduce((n, k) => n + found[k].rows.length, 0)
  const complete = shown.every((k) => found[k].complete)
  /** A chip's count, once its query has every row (brief X2): none while pages remain. */
  const countOf = (r: Results<unknown>[]) => (on && r.every((x) => x.complete && !x.pending) ? r.reduce((n, x) => n + x.rows.length, 0) : undefined)

  const laneName = lane ? LANES.find((l) => l.id === lane)!.label : null
  const name = scope === "lane" ? laneName! : scope === "all" ? "Everything" : KINDS.find((k) => k.id === scope)!.chip
  // What the shell says (brief X2): SEARCH // MAIL, and the count once every row is in.
  useScreenPlace(name)
  useScreenFact(on && !pending && complete ? `${formatNavCount(total)} ${total === 1 ? "result" : "results"}` : null)

  // Esc from anywhere on the screen but a field: close what is open, then clear the words, then leave. The field does the last two itself.
  const hasOpen = useRef(false)
  useEffect(() => {
    hasOpen.current = !!opened
  })
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return
      const t = e.target as HTMLElement
      if (t.closest("input, textarea, select, [contenteditable=true], [role=dialog], [role=menu]")) return
      const ui = useUi.getState()
      if (!ui.search || ui.settings || ui.composer || ui.paletteOpen || ui.shortcutsOpen) return
      e.preventDefault()
      if (hasOpen.current) setOpened(null)
      else if (ui.search.query) ui.setSearchQuery("")
      else leaveSearch()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  // ↑ and ↓ through the results, from the field and between rows; ↑ from the first row returns to the field (brief X2).
  const list = useRef<HTMLDivElement>(null)
  const fieldRef = useRef<HTMLInputElement | null>(null)
  const step = (e: ReactKeyboardEvent, from: Element | null) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return
    const items = [...(list.current?.querySelectorAll<HTMLElement>(RESULT) ?? [])]
    if (!items.length) return
    const at = from ? items.findIndex((el) => el === from || el.contains(from)) : -1
    const next = e.key === "ArrowDown" ? at + 1 : at - 1
    e.preventDefault()
    if (next < 0) fieldRef.current?.focus()
    else items[Math.min(next, items.length - 1)]!.focus()
  }

  const none = scope === "lane" ? `Nothing in ${laneName} has “${query}”.` : scope === "all" ? `Nothing in Vale has “${query}”.` : KINDS.find((k) => k.id === scope)!.none(query)
  const retry = () => shown.forEach((k) => found[k].error && found[k].again())

  return (
    <MasterDetail
      section="Search"
      pick="Pick a result to see it here."
      onBack={() => setOpened(null)}
      onRoot={() => (setOpened(null), setQuery(""))}
      detail={opened && <FoundDetail key={openKey} opened={fresh(opened)} onClose={() => setOpened(null)} onOpen={open} />}
      side={<FoundSide />}
      header={
        <AppFrameInset>
          <div className="flex flex-col gap-3 pb-4">
            <SearchField
              ref={(el) => {
                setSearchField(el)
                fieldRef.current = el
              }}
              autoFocus
              label={`Search ${name}`}
              value={typed}
              onValueChange={setQuery}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") return step(e, null)
                // With words in it, Esc clears them (the field's own rule); with none, it leaves Search.
                if (e.key !== "Escape" || typed) return
                e.preventDefault()
                leaveSearch()
              }}
            />
            {!member && (
              <FilterChipGroup label="Search in" scroll value={scope} onValueChange={(v) => setScope(v as SearchScope)}>
                {laneName && (
                  <FilterChip value="lane" count={countOf([inLane])}>
                    {laneName}
                  </FilterChip>
                )}
                <FilterChip value="all" count={countOf([mail, events, people, notes])}>
                  All
                </FilterChip>
                {KINDS.map((k) => (
                  <FilterChip key={k.id} value={k.id} count={countOf([byKind[k.id]])}>
                    {k.chip}
                  </FilterChip>
                ))}
              </FilterChipGroup>
            )}
          </div>
        </AppFrameInset>
      }
      list={
        !on ? null : (
          <div ref={list} role="region" aria-label="Results" aria-busy={pending || undefined} className="flex flex-col gap-4 pb-4" onKeyDown={(e) => step(e, e.target as Element)}>
            <LoadState place="results" overline="Search" error={failed.length === shown.length ? error : total > 0 ? error : null} hasData={total > 0} onRetry={retry}>
              {pending && total === 0 ? (
                <AppFrameInset>
                  <div className="flex flex-col gap-5">
                    <Skeleton variant="row" />
                    <Skeleton variant="row" />
                    <Skeleton variant="row" />
                  </div>
                </AppFrameInset>
              ) : total === 0 ? (
                <EmptyState
                  overline="Search // 00"
                  title="Nothing matches."
                  body={none}
                  // The way wider, where there is one: not in All, and not for a team member, who has mail alone.
                  actionLabel={scope === "all" || member ? undefined : "Search everything"}
                  onAction={scope === "all" || member ? undefined : () => setScope("all")}
                />
              ) : scope === "all" ? (
                KINDS.filter((k) => found[k.id].rows.length > 0).map((k) => {
                  const all = found[k.id]
                  return (
                    <section key={k.id} aria-label={k.chip} className="flex flex-col">
                      <AppFrameInset>
                        <SectionHeader
                          title={k.header}
                          count={all.complete ? all.rows.length : undefined}
                          action={
                            all.rows.length > PEEK ? (
                              <Button variant="ghost" size="sm" onClick={() => setScope(k.id)} aria-label={`Show all ${k.chip.toLowerCase()}`}>
                                Show all
                              </Button>
                            ) : undefined
                          }
                        />
                      </AppFrameInset>
                      <Rows kind={k.id}>{rows[k.id](PEEK)}</Rows>
                    </section>
                  )
                })
              ) : (
                <section aria-label={name} className="flex flex-col">
                  <AppFrameInset>
                    <SectionHeader title={shown[0] === "mail" ? "Results // newest first" : shown[0] === "calendar" ? KINDS[1]!.header : "Results"} count={complete ? total : undefined} />
                  </AppFrameInset>
                  <Rows kind={shown[0]!}>{rows[shown[0]!]()}</Rows>
                  {found[shown[0]!].more && <MoreOnView more={found[shown[0]!].more!} />}
                </section>
              )}
            </LoadState>
            {/* Said once the count has settled, politely (brief X2). */}
            <p role="status" className="sr-only">
              {!pending && complete ? `${total} ${total === 1 ? "result" : "results"}` : ""}
            </p>
          </div>
        )
      }
    />
  )
}

/** A kind's rows. Rows run edge to edge; events are cards, so they keep the column's inset and a gap between them. */
function Rows({ kind, children }: { kind: Kind; children: ReactNode }) {
  if (kind !== "calendar") return <div className="flex flex-col">{children}</div>
  return (
    <AppFrameInset>
      <div className="flex flex-col gap-2 pt-2">{children}</div>
    </AppFrameInset>
  )
}

/**
 * The end of a list with more to read (brief X2): reaching it fetches the next
 * page of every lane that has one. The button is the same step by hand, for
 * the keyboard and for a screen that never scrolls it into view.
 */
function MoreOnView({ more }: { more: () => void }) {
  const at = useRef<HTMLDivElement>(null)
  const latest = useRef(more)
  useEffect(() => {
    latest.current = more
  })
  useEffect(() => {
    const el = at.current
    if (!el) return
    const seen = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && latest.current())
    seen.observe(el)
    return () => seen.disconnect()
  }, [])
  return (
    <AppFrameInset>
      <div ref={at} className="pt-4">
        <Button variant="secondary" onClick={more}>
          Show more
        </Button>
      </div>
    </AppFrameInset>
  )
}
