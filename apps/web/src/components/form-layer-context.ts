import { createContext, useContext } from "react"

/** What a form inside the form layer (ADR-0087, `editor-frame.tsx`) knows of the layer it stands in. */
export interface Layer {
  phone: boolean
  /** Close, asking first when the form holds writing. */
  close: () => void
  overlineId: string
  titleId: string
}
export const LayerContext = createContext<Layer | null>(null)

/**
 * Close the form layer this stands in, asking first when the form holds writing: for a control
 * that leaves the form for another place (Open accounts, Signatures and templates…).
 */
export function useFormLayerClose() {
  const layer = useContext(LayerContext)
  if (!layer) throw new Error("useFormLayerClose must be inside a FormLayer.")
  return layer.close
}
