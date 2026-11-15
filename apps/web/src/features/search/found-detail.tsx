import { useAccounts, useThread } from "@/core/queries"
import type { MessageSummary } from "@/core/types"
import { EventDetailPane } from "@/features/calendar/event-detail"
import { useCalendars } from "@/features/calendar/use-calendars"
import { ContactDetailPane } from "@/features/contacts/contact-detail"
import { useTriage } from "@/features/mail/actions"
import { ConversationView } from "@/features/mail/conversation-view"
import { SenderPanelSlot } from "@/features/mail/sender-profile"
import { useMarkRead } from "@/features/mail/use-mark-read"
import { NoteDetailPane } from "@/features/notes/note-detail"

import type { Opened } from "./opened"

/**
 * A result, as its own section shows it (ADR-0096; brief X2): the
 * conversation, the event, the person or the note, each in its owner's own
 * pane with the props it already takes. Closing it (an archive, a delete)
 * returns to the results.
 */
export function FoundDetail({ opened, onClose, onOpen }: { opened: Opened; onClose: () => void; onOpen: (o: Opened) => void }) {
  if (opened.kind === "thread") return <FoundConversation row={opened.row} onClose={onClose} onOpenThread={(row) => onOpen({ kind: "thread", row })} />
  if (opened.kind === "event") return <FoundEvent id={opened.id} start={opened.start} onClose={onClose} />
  if (opened.kind === "contact") return <ContactDetailPane id={opened.id} onDeleted={onClose} />
  return <NoteDetailPane id={opened.id} fresh={false} onClosed={onClose} />
}

/** The sender panel beside a conversation found here, as Mail puts it beside its own. */
export const FoundSide = SenderPanelSlot

function FoundConversation({ row, onClose, onOpenThread }: { row: MessageSummary; onClose: () => void; onOpenThread: (row: MessageSummary) => void }) {
  const { data: thread } = useThread(row.threadId)
  const { data: accounts = [] } = useAccounts()
  const triage = useTriage(onClose)
  // Opening a conversation here reads it, as it does in Mail (ADR-0055).
  useMarkRead(row, thread, triage.markSeen)
  return <ConversationView row={row} thread={thread} account={accounts.find((a) => a.id === row.accountId)} showAccount={accounts.length > 1} triage={triage} onLeave={onClose} onOpenThread={onOpenThread} />
}

function FoundEvent({ id, start, onClose }: { id: string; start: number; onClose: () => void }) {
  const calendars = useCalendars()
  return <EventDetailPane eventId={id} start={start} calendars={calendars} onDeleted={onClose} />
}
