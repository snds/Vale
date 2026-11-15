import { useQueryClient } from "@tanstack/react-query"
import { create } from "zustand"

import { showSection } from "@/app/places"
import { toast } from "@unicron/ui"
import { getCoreClient } from "@/core/client"
import { useCalendarSets, usePimAction } from "@/core/queries"
import type { CalendarSet, Collection } from "@/core/types"

const fail = (e: unknown) => toast.error(e instanceof Error ? e.message : String(e))

/**
 * Saved combinations of calendars ("Work", "Personal"): one tap shows exactly
 * that set (ADR-0021; Fantastical's calendar sets). The rows are in the
 * calendars list (`calendar-nav.tsx`, brief X1); this file holds what they do.
 *
 * Picking a set says so ("Showing Work"). Deleting one can be taken back
 * (brief C5, X6): UNDO saves the kept set again with the calls that made it.
 */
export function useSets(calendars: Map<string, Collection>) {
  const { data: sets = [] } = useCalendarSets()
  const qc = useQueryClient()
  const apply = usePimAction((c, id: string) => c.applyCalendarSet(id))
  const remove = usePimAction((c, id: string) => c.deleteCalendarSet(id))
  const showing = [...calendars.values()].filter((c) => !c.hidden).map((c) => c.id)
  const restore = async (set: CalendarSet) => {
    try {
      await saveSetAgain(set)
    } catch (e) {
      fail(e)
    } finally {
      await qc.invalidateQueries({ queryKey: ["pim"] })
    }
  }
  return {
    sets,
    /** The set that is exactly what shows now, if any. */
    active: sets.find((s) => s.calendarIds.length === showing.length && s.calendarIds.every((id) => showing.includes(id)))?.id ?? null,
    apply: (set: CalendarSet) => apply.mutate(set.id, { onError: fail, onSuccess: () => void toast(`Showing ${set.name}`) }),
    remove: (set: CalendarSet) =>
      remove.mutate(set.id, {
        onError: fail,
        onSuccess: () => void toast(`Deleted ${set.name}`, { action: { label: "Undo", onClick: () => void restore(set) } }),
      }),
  }
}

/**
 * Saves a deleted set again (UNDO). The core saves "what shows now" under a
 * name, so when other calendars show, the set's own are shown for the save,
 * and what showed before is put back right after.
 */
async function saveSetAgain(set: CalendarSet) {
  const core = await getCoreClient()
  const all = await core.listCollections("calendar")
  const wanted = new Set(set.calendarIds.filter((id) => all.some((c) => c.id === id)))
  const differs = all.filter((c) => !c.hidden !== wanted.has(c.id))
  for (const c of differs) await core.setCollectionHidden(c.id, !wanted.has(c.id))
  try {
    await core.saveCalendarSet(set.name)
  } finally {
    for (const c of differs) await core.setCollectionHidden(c.id, c.hidden)
  }
}

/** "Save as set…": the form that names what is showing. The calendar view mounts it; the list's row opens it. */
export const useSavingSet = create<{ open: boolean }>(() => ({ open: false }))
export function openSaveSet() {
  // From the sidebar while Settings is open: the calendar, which holds the form, comes back first.
  showSection("calendar")
  useSavingSet.setState({ open: true })
}
