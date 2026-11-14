import { useMemo } from "react"

import { useNoteTasks } from "@/core/queries"
import type { NoteSummary } from "@/core/types"

/**
 * What a note's row, card and map square say about it (brief N1): when it
 * was edited, how many checklist items it holds, and the one tag at its end.
 */

const WEEKDAY = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"]
const MONTH = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]
const two = (n: number) => String(n).padStart(2, "0")

/**
 * When, as the frames write it in a row (Mobile / 14): the clock today
 * (`08:40`), the day within a week (`WED`), the date this year (`NOV 02`), and
 * the year before that (`NOV 02 2025`).
 */
export function rowTime(secs: number, now = new Date()) {
  const at = new Date(secs * 1000)
  if (at.toDateString() === now.toDateString()) return `${two(at.getHours())}:${two(at.getMinutes())}`
  const days = (new Date(now.toDateString()).getTime() - new Date(at.toDateString()).getTime()) / 86_400_000
  // A week either way: the past for an edit, the coming days for a reminder.
  if (Math.abs(days) < 7) return WEEKDAY[at.getDay()]!
  const date = `${MONTH[at.getMonth()]} ${two(at.getDate())}`
  return at.getFullYear() === now.getFullYear() ? date : `${date} ${at.getFullYear()}`
}

export const editedLabel = (n: NoteSummary, now?: Date) => `Edited ${rowTime(n.updated, now)}`

const shared = (n: NoteSummary) => !!n.share && !n.share.revoked

/** The one tag at a row's or a card's end: the first that applies. Null when none does. */
export function noteTag(n: NoteSummary, due: boolean): string | null {
  if (due) return "Due"
  if (n.pinned) return "Pinned"
  if (n.locked) return "Locked"
  if (shared(n)) return "Shared"
  return n.tags[0] ? `#${n.tags[0]}` : null
}

/**
 * Checklist items per note, done ones included, from the core's task list
 * (`noteTasks(true)`). The core leaves out archived and locked notes, so
 * those never show a count.
 */
export function useNoteItemCounts() {
  const { data: tasks } = useNoteTasks(true)
  return useMemo(() => {
    const out = new Map<string, number>()
    for (const t of tasks ?? []) out.set(t.noteId, (out.get(t.noteId) ?? 0) + 1)
    return out
  }, [tasks])
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/**
 * The detail after "Edited …" in a row, at most one: the checklist's items,
 * what it links to, or the reminder (given back as a time for the caller to
 * draw beside its icon). A locked note says nothing more.
 */
export function noteDetail(n: NoteSummary, items: number | undefined): { text: string } | { reminder: number } | null {
  if (n.locked) return null
  if (items && !n.archived) return { text: plural(items, "item", "items") }
  if (n.links.length) return { text: `${n.links.length} linked` }
  if (n.remindAt) return { reminder: n.remindAt }
  return null
}
