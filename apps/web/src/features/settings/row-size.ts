import { useAppFrame } from "@unicron/ui"

/** Rows are stacked on a phone and side by side elsewhere, as every settings row is (ADR-0104). */
export function useRowSize(): "stacked" | "default" {
  return useAppFrame().phone ? "stacked" : "default"
}
