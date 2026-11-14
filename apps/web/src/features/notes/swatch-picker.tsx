import { useId } from "react"

import { RadioGroup, RadioGroupItem } from "@unicron/ui"
import { NOTE_COLORS, type NoteColor } from "@/core/types"
import { noteSwatch, swatchSquare } from "@/lib/swatches"

import { NOTE_COLOR_LABEL } from "./note-color"

/** A smart folder's color rule: none set, any color at all, or one of the ten. */
export type SwatchChoiceValue = NoteColor | "any" | null

const NONE = "none"

/**
 * The swatch picker (brief N1, 1.4; app-level, built from unicron's
 * RadioGroup): "It doesn't matter", "Any color", then the ten note colors,
 * each as its 8 px swatch square beside its name. One Tab stop; the arrow
 * keys choose. Named after its job, so it reads as no unicron part.
 */
export function SwatchChoice({ label, value, onValueChange }: { label: string; value: SwatchChoiceValue; onValueChange: (value: SwatchChoiceValue) => void }) {
  const heading = useId()
  return (
    <div className="flex flex-col gap-2">
      <span id={heading} className="type-overline text-muted-foreground">
        {label}
      </span>
      <RadioGroup aria-labelledby={heading} value={value ?? NONE} onValueChange={(v) => onValueChange(v === NONE ? null : (v as SwatchChoiceValue))}>
        {/* One flow: the two rules first, then the colors, as many to a line as fit. */}
        <div className="flex flex-wrap gap-x-6">
          <Choice value={NONE}>It doesn't matter</Choice>
          <Choice value="any">Any color</Choice>
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
