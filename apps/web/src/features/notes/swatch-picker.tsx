import { useId } from "react"

import { RadioGroup, RadioGroupItem } from "@unicron/ui"
import { NOTE_COLORS, type NoteColor } from "@/core/types"
import { noteSwatch, swatchSquare } from "@/lib/swatches"

import { NOTE_COLOR_LABEL } from "./note-color"

/** A smart folder's color rule: none set, any color at all, or one of the ten. */
export type SwatchChoiceValue = NoteColor | "any" | null

const NONE = "none"

/**
 * The swatch picker (briefs N1, N2, 1.4; app-level, built from unicron's
 * RadioGroup): each of the ten note colors as its 8 px swatch square beside
 * its name. A smart folder's rule (`kind="rule"`) starts with "It doesn't
 * matter" and "Any color"; a note's own color (`kind="note"`) with "No
 * color". One Tab stop; the arrow keys choose. Named after its job, so it
 * reads as no unicron part.
 */
export function SwatchChoice({
  label,
  value,
  onValueChange,
  kind = "rule",
  showLabel = true,
}: {
  label: string
  value: SwatchChoiceValue
  onValueChange: (value: SwatchChoiceValue) => void
  kind?: "rule" | "note"
  /** The overline over the choices. A layer whose header already says it leaves it out; the label still names the group. */
  showLabel?: boolean
}) {
  const heading = useId()
  return (
    <div className="flex flex-col gap-2">
      <span id={heading} className="type-overline text-muted-foreground" hidden={!showLabel}>
        {label}
      </span>
      <RadioGroup aria-labelledby={heading} value={value ?? NONE} onValueChange={(v) => onValueChange(v === NONE ? null : (v as SwatchChoiceValue))}>
        {/* One flow: the rules first, then the colors, as many to a line as fit. */}
        <div className={kind === "note" ? "grid grid-cols-2 gap-x-6" : "flex flex-wrap gap-x-6"}>
          {kind === "note" ? (
            <Choice value={NONE}>No color</Choice>
          ) : (
            <>
              <Choice value={NONE}>It doesn't matter</Choice>
              <Choice value="any">Any color</Choice>
            </>
          )}
          {NOTE_COLORS.map((c) => (
            <Choice key={c} value={c} square={swatchSquare(noteSwatch(c))}>
              {NOTE_COLOR_LABEL[c]}
            </Choice>
          ))}
        </div>
      </RadioGroup>
    </div>
  )
}

function Choice({ value, square, children }: { value: string; square?: string | null; children: string }) {
  return (
    <label className="flex min-h-touch-min cursor-pointer items-center gap-2 type-ui">
      <RadioGroupItem value={value} />
      {square && <span aria-hidden className={square} />}
      {children}
    </label>
  )
}
