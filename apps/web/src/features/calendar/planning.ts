import { create } from "zustand"
import { formatNavCount } from "@unicron/ui"

import { useNoteTasks } from "@/core/queries"
import type { NoteTask } from "@/core/types"
import { leaveThen } from "@/lib/leave-guard"

/** The open checklist items across your notes (ADR-0028): Tasks lists them, and its head counts them. */
export const useOpenTasks = () => useNoteTasks()

/** Tasks' overline (brief C6): `TASKS // 07`, the open items in two digits. */
export const tasksOverline = (n: number | undefined) => `Tasks // ${formatNavCount(n ?? 0)}`

/**
 * The task being planned, if any (ADR-0100; brief C6). On a desktop its form
 * stands in the detail column (`TaskPlanPane`, which the calendar view
 * places); on a phone and at medium width, in the form layer.
 */
export const usePlanning = create<{ task: NoteTask | null }>(() => ({ task: null }))

/** Plans a task. A move away from a plan with changes asks first (brief X6); `then` runs with it (the view closes an open event). */
export const planTask = (task: NoteTask, then?: () => void) =>
  leaveThen(() => {
    then?.()
    usePlanning.setState({ task })
  })

export const stopPlanning = () => usePlanning.setState({ task: null })
