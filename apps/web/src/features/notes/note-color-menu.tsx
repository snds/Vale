import { type ReactElement } from "react"

import { AdaptivePopover } from "@unicron/ui"
import type { NoteColor } from "@/core/types"

import { SwatchChoice } from "./swatch-picker"

/**
 * A note's color (brief N2): a popover on a desktop, a sheet on a phone, with
 * the swatch picker (brief 1.4): "No color", then the ten colors, each its
 * 8 px square and its name. A pick closes it. The color shows as the row's
 * square, the card's edge and the map square's edge; it no longer tints the
 * note (DC3, ADR-0105).
 */
export function NoteColorMenu({
  value,
  onChange,
  trigger,
  open,
  onOpenChange,
}: {
  value: NoteColor | null
  onChange: (c: NoteColor | null) => void
  /** The control that opens it: the note's toolbar button. A phone opens it from the note's More sheet and passes a hidden one. */
  trigger: ReactElement<Record<string, unknown>>
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  return (
    <AdaptivePopover open={open} onOpenChange={onOpenChange} trigger={trigger} title="Color" align="end">
      <SwatchChoice
        kind="note"
        label="Note color"
        showLabel={false}
        value={value}
        onValueChange={(c) => {
          onOpenChange?.(false)
          onChange(c === "any" ? null : c)
        }}
      />
    </AdaptivePopover>
  )
}
