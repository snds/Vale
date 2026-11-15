import { useEffect } from "react"
import { toast } from "@unicron/ui"

import { useUi } from "@/app/ui-store"
import { useCore } from "@/core/queries"
import type { DueReminder } from "@/core/types"

import { clock } from "./dates"
import { markMissedRaised, openMissed, reminderTitle, setMissedReminders, useMissedReminders, whenLine } from "./missed-reminders"

// Taken once per page load, so a remount (or React's dev double-run) can't lose them.
let missedOnce: Promise<DueReminder[]> | null = null

/** A due reminder shows this long (brief X5): it is timed, the one exception to the toast times. */
export const REMINDER_MS = 15_000

/**
 * Reminders as they come due (ADR-0100; brief X5). The desktop shell also
 * raises a system notification, unchanged; this keeps the reminder in the
 * app, and is the only one the web demo has. Mounted once at the root.
 *
 * | Kind | Title | Line | Action |
 * |---|---|---|---|
 * | Event alert | the event's title | "In 30 min · 16:30 · {place}" | OPEN |
 * | Time to leave | "Time to leave: {title}" | "Starts in 30 min · 16:30 · {place}" | OPEN |
 * | A note's reminder | the note's title | "From your notes" | OPEN |
 * | Missed, one | "Missed: {title}" | "Started 12 min ago · 16:30" | OPEN, stays |
 * | Missed, two or more | "{N} reminders came due while Vale was closed" | — | SEE, stays |
 *
 * Due ones show for 15 s; missed ones stay until they are closed. The
 * missed ones are kept for the session (`missed-reminders.ts`), for the
 * Missed list.
 */
export function ReminderWatcher() {
  const { data: core } = useCore()
  const jumpTo = useUi((s) => s.jumpTo)
  useEffect(() => {
    if (!core) return
    const open = (r: DueReminder) => () => (r.noteId ? jumpTo({ kind: "note", id: r.noteId }) : jumpTo({ kind: "event", id: r.eventId, start: r.start }))
    const show = (r: DueReminder, missed = false) => {
      const now = Date.now() / 1000
      const title = reminderTitle(r)
      const line = r.noteId
        ? "From your notes"
        : missed
          ? whenLine(r, now)
          : // Counted from when it fires, as the alert was set: "In 30 min · 16:30 · Studio, room 4".
            [due(r), r.location].filter(Boolean).join(" · ")
      toast(missed ? `Missed: ${title}` : title, {
        id: `reminder-${r.noteId ?? r.eventId}-${r.fireAt}`,
        description: line,
        duration: missed ? Infinity : REMINDER_MS,
        action: { label: "Open", onClick: open(r) },
      })
    }
    let live = true
    // Kept for the session, for the Missed list (ADR-0086): the core hands each over once.
    missedOnce ??= core
      .takeMissedReminders()
      .catch(() => [])
      .then((list) => (setMissedReminders(list), list))
    void missedOnce.then((list) => {
      if (!live || !list.length || useMissedReminders.getState().raised) return
      markMissedRaised()
      // Several missed reminders are one notice and a list, not a pile of toasts (brief X5). It stays until SEE.
      if (list.length === 1) show(list[0]!, true)
      else toast(`${list.length} reminders came due while Vale was closed`, { id: "reminders-missed", duration: Infinity, action: { label: "See", onClick: openMissed } })
    })
    const off = core.on("reminder", (payload) => show(payload as DueReminder))
    return () => {
      live = false
      off()
    }
  }, [core, jumpTo])
  return null
}

/** "In 30 min · 16:30", from when the reminder fires to the start; "Starts in 30 min · 16:30" for time to leave. */
function due(r: DueReminder) {
  const minutes = Math.max(0, Math.round((r.start - r.fireAt) / 60))
  const lead = minutes === 0 ? "Now" : minutes < 60 ? `In ${minutes} min` : minutes % 60 ? `In ${Math.floor(minutes / 60)} h ${minutes % 60} min` : `In ${minutes / 60} h`
  return `${r.leave ? (minutes === 0 ? "Starts now" : `Starts ${lead.toLowerCase()}`) : lead} · ${clock(r.start)}`
}
