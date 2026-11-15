import { create } from "zustand"

import { useTeamThreads } from "@/core/queries"

/** OPEN A LINK…, from the page head and from the empty lane: one form, wherever it is asked for. */
export const useLinkForm = create<{ open: boolean }>(() => ({ open: false }))
export const openTeamLinkForm = () => useLinkForm.setState({ open: true })

/** How many shared conversations the lane holds, for its overline `TEAM // 04`; null while it loads. */
export function useTeamCount() {
  const { data } = useTeamThreads()
  return data ? data.length : null
}
