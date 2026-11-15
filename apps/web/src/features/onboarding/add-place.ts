import { createContext, useContext } from "react"

import { useAppFrame } from "@unicron/ui"

/**
 * Where step 2 of adding an account stands (brief X8; ADR-0107): first run's
 * focus frame, or Settings › Accounts' column (brief T1). The provider forms
 * in `accounts.tsx` and `oauth-sign-in.tsx` are the same in both; only their
 * head and their end change, and these two parts draw them.
 */
export type AddPlace = "focus" | "settings"

export interface AddContextValue {
  where: AddPlace
  /** Back to the providers: step 1, or the Accounts list. */
  onBack: () => void
}

export const AddContext = createContext<AddContextValue>({ where: "settings", onBack: () => {} })

/**
 * The place, and how the form's primary is drawn there: full width in the
 * focus frame's column and on a phone, where it stands at the foot.
 */
export function useAddPlace() {
  const place = useContext(AddContext)
  const phone = useAppFrame().phone
  return { ...place, phone, block: phone || place.where === "focus" }
}

