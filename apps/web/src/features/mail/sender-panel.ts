import { create } from "zustand"

import type { Address, MessageSummary } from "@/core/types"

/** Who the open conversation's sender panel is about, and whether it shows (brief M5; DC5). */
interface SenderPanelState {
  from: Address | null
  threadId: string | null
  onOpenThread?: (row: MessageSummary) => void
  open: boolean
}
export const useSenderPanel = create<SenderPanelState>(() => ({ from: null, threadId: null, open: false }))

/** The open conversation tells the panel whom it is about; it shows when asked (FROM, More › About). */
export const setSenderPanel = (from: Address | null, threadId: string | null, onOpenThread?: (row: MessageSummary) => void) =>
  useSenderPanel.setState({ from, threadId, onOpenThread })
export const openSenderPanel = () => useSenderPanel.setState({ open: true })
