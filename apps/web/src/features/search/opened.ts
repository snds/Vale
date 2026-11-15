import type { MessageSummary } from "@/core/types"

/** A result open beside the results: a conversation, an event, a person or a note. */
export type Opened = { kind: "thread"; row: MessageSummary } | { kind: "event"; id: string; start: number } | { kind: "contact"; id: string } | { kind: "note"; id: string }

/** One key per opened thing, so a row knows it is the one open. */
export const openedKey = (o: Opened) => (o.kind === "thread" ? `thread/${o.row.threadId}` : o.kind === "event" ? `event/${o.id}/${o.start}` : `${o.kind}/${o.id}`)
