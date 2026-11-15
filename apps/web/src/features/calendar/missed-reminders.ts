import { create } from "zustand"

import type { DueReminder } from "@/core/types"

import { clock, folio, fromSecs, sameDay } from "./dates"

/**
 * The reminders that came due while Vale was closed (ADR-0086; brief X5).
 * The reminder watcher fills it once, at start. The list is kept for the
 * session: the toast's SEE opens it, and so does "Missed reminders" in the
 * command menu.
 */
interface MissedState {
  items: DueReminder[]
  /** The session's one notice about them has been raised, so a remount does not raise it again. */
  raised: boolean
  /** The list is open. */
  open: boolean
}

export const useMissedReminders = create<MissedState>(() => ({ items: [], raised: false, open: false }))

/** What the core handed over at start. Each reminder is handed over once, so this is the session's only copy. */
export const setMissedReminders = (items: DueReminder[]) => useMissedReminders.setState({ items })
/** The notice about them is up. */
export const markMissedRaised = () => useMissedReminders.setState({ raised: true })
/** Opens the Missed list. It does nothing when nothing was missed. */
export const openMissed = () => useMissedReminders.setState((s) => (s.items.length ? { open: true } : s))
export const closeMissed = () => useMissedReminders.setState({ open: false })

/** What a reminder is called: the event's or the note's title; "Time to leave: {title}" when its travel time starts. */
export function reminderTitle(r: DueReminder) {
  const title = r.title || (r.noteId ? "New note" : "(no title)")
  return r.leave ? `Time to leave: ${title}` : title
}

/** When a missed one was due, against now: "Started 12 min ago · 16:30"; a day's date before the time once it is older than an hour. */
export function whenLine(r: DueReminder, now: number) {
  if (r.noteId) return "From your notes"
  const minutes = Math.round((r.start - now) / 60)
  const at = clock(r.start)
  // Later today: the time says enough; another day adds its date.
  if (minutes >= 60) return sameDay(fromSecs(r.start), fromSecs(now)) ? `Starts at ${at}` : `Starts ${folio(fromSecs(r.start))} · ${at}`
  if (minutes > 0) return `Starts in ${minutes} min · ${at}`
  if (minutes === 0) return `Starting now · ${at}`
  if (minutes > -60) return `Started ${-minutes} min ago · ${at}`
  return `Started ${folio(fromSecs(r.start))} · ${at}`
}
