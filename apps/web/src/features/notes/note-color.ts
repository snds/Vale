import type { NoteColor } from "@/core/types"

export const NOTE_COLOR_LABEL: Record<NoteColor, string> = {
  red: "Red",
  orange: "Orange",
  yellow: "Yellow",
  green: "Green",
  teal: "Teal",
  blue: "Blue",
  purple: "Purple",
  pink: "Pink",
  brown: "Brown",
  gray: "Gray",
}

/** The note's color button's name: what it does, and the color the note has. */
export const colorLabel = (value: NoteColor | null) => (value ? `Color: ${NOTE_COLOR_LABEL[value]}` : "Color")
