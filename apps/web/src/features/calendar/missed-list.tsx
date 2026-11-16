import { useMemo } from "react"

import { AdaptiveDialog, ListRow, formatNavCount } from "@unicron/ui"
import { useUi } from "@/app/ui-store"
import { useOccurrences } from "@/core/queries"
import type { DueReminder, Occurrence } from "@/core/types"
import { useNowSecs } from "@/hooks/use-now"
import { calendarSwatches, eventSwatch } from "@/lib/swatches"

import { closeMissed, reminderTitle, useMissedReminders, whenLine } from "./missed-reminders"
import { OccurrenceCard } from "./occurrence-card"
import { useCalendars } from "./use-calendars"

/**
 * "Missed" (ADR-0100; brief X5): the reminders that came due while Vale was
 * closed. A question-size dialog on a desktop, a sheet on a phone. Each
 * event is its card, as the calendar draws it, with when it was due in the
 * place's line; a note's reminder is a row. Pressing one opens it and closes
 * the list. The list is kept for the session (`missed-reminders.ts`); the
 * toast's SEE opens it, and so does `openMissed()` (the command menu).
 */
export function MissedList() {
  const open = useMissedReminders((s) => s.open)
  const items = useMissedReminders((s) => s.items)
  return (
    <AdaptiveDialog
      open={open}
      onOpenChange={(o) => !o && closeMissed()}
      size="question"
      overline={`Reminders // ${formatNavCount(items.length)}`}
      title="Missed"
      description="These came due while Vale was closed."
    >
      {open && <Items items={items} />}
    </AdaptiveDialog>
  )
}

function Items({ items }: { items: DueReminder[] }) {
  const jumpTo = useUi((s) => s.jumpTo)
  const now = useNowSecs()
  const calendars = useCalendars()
  const swatches = useMemo(() => calendarSwatches(calendars.values()), [calendars])
  // The events' own occurrences, for their cards: the hours, the calendar's swatch.
  const starts = items.filter((r) => !r.noteId).map((r) => r.start)
  const { data: occurrences = [] } = useOccurrences(starts.length ? Math.min(...starts) - 1 : 0, starts.length ? Math.max(...starts) + 1 : 0)
  const go = (r: DueReminder) => {
    closeMissed()
    if (r.noteId) jumpTo({ kind: "note", id: r.noteId })
    else jumpTo({ kind: "event", id: r.eventId, start: r.start })
  }
  return (
    <ul aria-label="Missed reminders" className="flex flex-col gap-2">
      {items.map((r) => {
        const o: Occurrence | undefined = r.noteId ? undefined : occurrences.find((x) => x.eventId === r.eventId && x.start === r.start)
        return (
          <li key={`${r.noteId ?? r.eventId}-${r.fireAt}`}>
            {o ? (
              <OccurrenceCard occurrence={{ ...o, title: reminderTitle(r) }} swatch={eventSwatch(swatches.get(o.calendarId))} note={whenLine(r, now)} onOpen={() => go(r)} />
            ) : (
              // A note's reminder, or an event the list can't read now: a row with its title and when.
              <ListRow size="compact" onClick={() => go(r)} title={reminderTitle(r)} meta={whenLine(r, now)} metaStyle="plain" />
            )}
          </li>
        )
      })}
    </ul>
  )
}
