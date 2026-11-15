import { create } from "zustand"

import type { Sketch } from "@/lib/sketch"

/**
 * Which sketch is open, if any: a new one, or one already in the note (by its position). A sketch
 * whose strokes this device can't read (`sketch` null with an `image`) opens to show that image,
 * with "This sketch can't be edited here." (brief N3).
 */
export interface OpenSketch {
  sketch: Sketch | null
  pos: number | null
  /** The saved picture of a sketch that can't be edited here. */
  image?: string
}

export const useSketchSheet = create<{ open: null | OpenSketch; show: (sketch: Sketch | null, pos: number | null, image?: string) => void; close: () => void }>((set) => ({
  open: null,
  show: (sketch, pos, image) => set({ open: { sketch, pos, image } }),
  close: () => set({ open: null }),
}))
