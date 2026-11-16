import type { ReactNode } from "react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@unicron/ui"

import { relativeAge } from "./row-time"

/** A row's clock time with its relative age in a tooltip (cross-app settlement: rows use clock time). */
export function RowTimeTip({ at, now, children }: { at: number; now?: Date; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger render={<span data-role="row-time" />}>{children}</TooltipTrigger>
      <TooltipContent>{relativeAge(at, now)}</TooltipContent>
    </Tooltip>
  )
}
