import { useNavPicked } from "@/app/places"
import { useUi } from "@/app/ui-store"
import { IconButton, NavItem, NavSection, SectionHeader, Skeleton, ToggleRow, useAppFrame } from "@unicron/ui"
import { useAccounts, useCollections, usePimAction } from "@/core/queries"
import type { Collection } from "@/core/types"

import { calendarSwatches } from "@/lib/swatches"
import { openAddCalendars } from "./open-add-calendars"
import { useCalendars } from "./use-calendars"
import { openSaveSet, useSets } from "./use-sets"
import { setCalendarHours, useCalendarViewPrefs } from "./view-prefs"

/**
 * Calendar's second level (ADR-0084; brief X1): the calendars to show, one
 * group per account, then this device's and the added holidays; saved sets;
 * and the two tools, Tasks and Booking links, which are places. `standalone`
 * (the page head's sheet and popover, where APPS is not beside it) adds the
 * calendar itself as the first place, so there is a row to return by.
 * On a phone's sheet a last group, MORE, holds the Hours switch (brief C1).
 * Quick add left the list for the event form's title (ADR-0099; brief C4, Q5).
 */
export function CalendarNav({ standalone = false }: { standalone?: boolean }) {
  const calendars = useCalendars()
  const { isPending } = useCollections("calendar")
  const { data: accounts = [] } = useAccounts()
  const place = useUi((s) => s.calendarPlace)
  // Settings or Search stands in the section's place: then none of its rows is the current one.
  const settings = useUi((s) => !!s.settings || !!s.search)
  const picked = useNavPicked()
  const toggle = usePimAction((c, { id, hidden }: { id: string; hidden: boolean }) => c.setCollectionHidden(id, hidden))
  const { sets, active, apply, remove } = useSets(calendars)
  const all = [...calendars.values()]
  const swatches = calendarSwatches(all)
  // Added holidays and moon phases get their own group, after the rest.
  const groupOf = (c: Collection) => (c.id.startsWith("interesting:") ? "interesting" : c.accountId)
  const groups = [...new Set(all.map(groupOf))].sort((a, b) => Number(a === "interesting") - Number(b === "interesting"))
  // An account whose calendars did not sync: its rows say so (brief C5). NavSection has no critical tone of its own.
  const failing = new Set(accounts.filter((a) => a.davError).map((a) => a.id))
  const hours = useCalendarViewPrefs().hours
  const phoneSheet = useAppFrame().phone && standalone
  const name = (id: string | null) => (id === "interesting" ? "Holidays and more" : id ? (accounts.find((a) => a.id === id)?.displayName ?? "Account") : "On this device")
  const add = (
    <IconButton
      label="Add calendars"
      icon="add"
      size="icon-xs"
      onClick={() => {
        picked()
        openAddCalendars()
      }}
    />
  )
  const go = (to: "calendar" | "tasks" | "booking") => {
    useUi.getState().setCalendarPlace(to)
    picked()
  }
  return (
    <>
      {groups.length === 0 && (
        <NavSection title="Calendars" action={add} aria-busy={isPending || undefined}>
          {/* Sized by a plain box: the library owns the bar's look (brief X1: three skeleton rows). */}
          {isPending &&
            [0, 1, 2].map((i) => (
              <div key={i} className="grid h-9">
                <Skeleton />
              </div>
            ))}
        </NavSection>
      )}
      {groups.map((g, i) => (
        <NavSection key={g ?? "local"} title={name(g)} checkable="multiple" action={i === 0 ? add : undefined}>
          {all
            .filter((c) => groupOf(c) === g)
            .map((c) => (
              <NavItem
                key={c.id}
                label={c.name}
                swatch={swatches.get(c.id)}
                checked={!c.hidden}
                // Toggling a calendar keeps the list open: it is a filter, and more than one may change.
                onCheckedChange={(on) => toggle.mutate({ id: c.id, hidden: !on })}
                // Read-only as a mark on the one line, its words in the row's name (Vale 53), not a second line.
                // Unicron's NavItem has no trailing icon mark yet, so it is the neutral square; the lock asked for
                // is a Unicron gap (hand-off), and swaps in here when NavItem takes `mark={{ icon, label }}`.
                mark={c.writable ? undefined : { square: true, label: "Read-only" }}
                tone={g && failing.has(g) ? "critical" : undefined}
                toneLabel={g && failing.has(g) ? "didn't sync" : undefined}
              />
            ))}
        </NavSection>
      ))}
      <div className="flex flex-col gap-1">
        <NavSection title="Sets" count={sets.length || undefined} checkable={sets.length > 0 ? "single" : undefined}>
          {sets.map((s) => (
            <NavItem
              key={s.id}
              label={s.name}
              checked={active === s.id}
              // Picking a set shows exactly its calendars, and says so: "Showing Work" (brief C5).
              onCheckedChange={() => apply(s)}
              // Deleting it can be taken back: the toast's UNDO saves it again (brief X6).
              action={<IconButton label={`Delete set ${s.name}`} icon="close" size="icon-xs" onClick={() => remove(s)} />}
            />
          ))}
          {sets.length === 0 && <SaveAsSet onPick={picked} />}
        </NavSection>
        {sets.length > 0 && <SaveAsSet onPick={picked} />}
      </div>
      <NavSection title="Plan">
        {standalone && <NavItem label="Calendar" icon="calendar" current={!settings && place === "calendar"} onClick={() => go("calendar")} />}
        <NavItem label="Tasks" icon="task" current={!settings && place === "tasks"} onClick={() => go("tasks")} />
        <NavItem label="Booking links" icon="link" current={!settings && place === "booking"} onClick={() => go("booking")} />
      </NavSection>
      {phoneSheet ? (
        <section className="flex flex-col gap-4" aria-label="More">
          <SectionHeader title="More" />
          {/* Hours on a phone turns the Day into the time grid; the Week keeps its day sections (brief C1). */}
          <ToggleRow label="Hours" description="The Day as a grid of hours." checked={hours} onCheckedChange={setCalendarHours} />
        </section>
      ) : null}
    </>
  )
}

/** Outside the sets' radio group when there are sets: it opens a form, it is not one of them. */
function SaveAsSet({ onPick }: { onPick: () => void }) {
  return (
    <NavItem
      label="Save as set…"
      icon="add"
      onClick={() => {
        onPick()
        openSaveSet()
      }}
    />
  )
}
