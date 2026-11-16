import { useState, type ReactNode } from "react"

import {
  AppFrameInset,
  Badge,
  Button,
  DropdownMenuItem,
  EmptyState,
  Icon,
  ListRow,
  MetaItem,
  MetaList,
  SectionHeader,
  SwipeRow,
  TruncatedText,
  formatListCount,
  useAppFrame,
  type SwipeRowAction,
} from "@unicron/ui"
import { useAccounts, useOutbox } from "@/core/queries"
import type { OutboxItem } from "@/core/types"
import { useNowSecs } from "@/hooks/use-now"

import { LoadingRows } from "./lane-list"
import { SECTIONS, outboxActions, sectionOf, subjectOf, toNames, useOutboxItems, type OutboxSection } from "./outbox"
import { rowTime } from "./row-time"
import { SendLaterMenu } from "./send-later"
import { useSending } from "./sending"

/** The Outbox's empty state, in brief 5.2's words. */
export function OutboxEmpty() {
  return <EmptyState overline="Outbox // 00" title="Nothing waiting to go." body="Use the arrow beside Send to send later." />
}

/**
 * The Outbox (ADR-0095; brief M7; today's Scheduled lane, renamed: Q3, DC9):
 * SENDING, NOT SENT and SCHEDULED, each shown only when it has rows. A row
 * opens the message beside the list (pushed on a phone); its actions are in
 * its menu, and a scheduled row swipes: EDIT inner, DELETE outer.
 */
export function OutboxList({ accountId, selectedId, onOpen }: { accountId: string | null; selectedId: string | null; onOpen: (id: string) => void }) {
  const outbox = useOutboxItems(accountId)
  // While a send waits out its window, its seconds count down in its row.
  useSending()
  if (outbox.isPending) return <LoadingRows count={5} label="Loading Outbox" />
  if (outbox.error && !outbox.items.length)
    return <EmptyState tone="critical" overline="Outbox" title="Couldn't load Outbox." body={outbox.error.message} actionLabel="Try again" onAction={() => void outbox.refetch()} />
  if (!outbox.items.length) return <OutboxEmpty />
  return (
    <div className="flex flex-col">
      {SECTIONS.map(({ id, title }) => {
        const rows = outbox[id]
        if (!rows.length) return null
        return (
          <section key={id} aria-label={title} className="flex flex-col">
            <AppFrameInset>
              <SectionHeader title={title} count={rows.length} />
            </AppFrameInset>
            <ul aria-label={title} className="flex flex-col">
              {rows.map((item) => (
                <li key={item.id}>
                  <OutboxRow item={item} section={id} selected={item.id === selectedId} onOpen={() => onOpen(item.id)} />
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

/** "08 S": the seconds a send has left in its window (decisions §13). */
const secondsLeft = (item: OutboxItem) => `${String(Math.max(1, Math.ceil(item.sendAt - Date.now() / 1000))).padStart(2, "0")} S`

function OutboxRow({ item, section, selected, onOpen }: { item: OutboxItem; section: OutboxSection; selected: boolean; onOpen: () => void }) {
  const [moving, setMoving] = useState(false)
  const { draft } = item
  const preview = section === "failed" ? (item.error ?? undefined) : draft.body.trim().replace(/\s+/g, " ") || undefined
  const row = (menu: ReactNode, action?: ReactNode) => (
    <ListRow
      layout="message"
      selected={selected}
      onClick={onOpen}
      sender={`To ${toNames(draft)}`}
      tag={section === "failed" ? <Badge tone="critical">Not sent</Badge> : undefined}
      time={
        section === "sending" ? (
          secondsLeft(item)
        ) : section === "scheduled" ? (
          <span className="inline-flex items-center gap-1 align-bottom">
            <Icon name="send--alt" size="sm" label="Sends" />
            {rowTime(item.sendAt)}
          </span>
        ) : undefined
      }
      subject={<TruncatedText>{subjectOf(draft)}</TruncatedText>}
      preview={preview}
      action={action}
      menu={menu}
    />
  )
  if (section === "sending")
    return row(
      <DropdownMenuItem onClick={() => outboxActions.undo(item)}>
        <Icon name="undo" />
        Undo send
      </DropdownMenuItem>,
      <Button variant="secondary" size="sm" onClick={() => outboxActions.undo(item)}>
        Undo
      </Button>,
    )
  // A failed send: EDIT opens a copy, DELETE clears it with UNDO (W9, Vale 35). DELETE also runs on a full
  // swipe, since its toast's UNDO puts it back.
  if (section === "failed") {
    const failedActions: SwipeRowAction[] = [
      { icon: "edit", label: "Edit", tone: "neutral", onAction: () => outboxActions.editFailed(item) },
      { icon: "trash-can", label: "Delete", tone: "primary", reversible: true, onAction: () => void outboxActions.removeFailed(item) },
    ]
    return (
      <SwipeRow trailing={failedActions}>
        {row(
          <>
            <DropdownMenuItem onClick={() => outboxActions.editFailed(item)}>
              <Icon name="edit" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => void outboxActions.removeFailed(item)}>
              <Icon name="trash-can" />
              Delete
            </DropdownMenuItem>
          </>,
        )}
      </SwipeRow>
    )
  }
  // Scheduled: EDIT inner, DELETE outer. Only DELETE runs on a full swipe, because its toast's UNDO queues it again.
  const trailing: SwipeRowAction[] = [
    { icon: "edit", label: "Edit", tone: "neutral", onAction: () => void outboxActions.edit(item) },
    { icon: "trash-can", label: "Delete", tone: "primary", reversible: true, onAction: () => void outboxActions.remove(item) },
  ]
  return (
    <div className="relative">
      <SwipeRow trailing={trailing}>
        {row(
          <>
            <DropdownMenuItem onClick={() => void outboxActions.sendNow(item)}>
              <Icon name="send--alt" />
              Send now
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setMoving(true)}>
              <Icon name="time" />
              Change time…
            </DropdownMenuItem>
          </>,
        )}
      </SwipeRow>
      {/* The row's menu is gone once a row in it is picked, so the times stand at the row's top right. */}
      <SendLaterMenu open={moving} onOpenChange={setMoving} value={item.sendAt} onPick={(at) => void outboxActions.changeTime(item, at)} />
    </div>
  )
}

/**
 * An Outbox message, read-only, in the detail column (pushed on a phone):
 * TO, FROM, SENDS or FAILED; the subject; the body; then its section's
 * actions as secondary buttons.
 */
export function OutboxMessage({ id, onGone }: { id: string; onGone: () => void }) {
  const { data: outbox, isPending } = useOutbox()
  const { data: accounts = [] } = useAccounts()
  const phone = useAppFrame().phone
  const now = useNowSecs()
  useSending()
  const [moving, setMoving] = useState(false)
  const item = outbox?.find((i) => i.id === id)
  const section = item ? sectionOf(item) : null
  if (!item || !section) {
    if (isPending) return null
    // Sent, taken back or deleted while open: the list has moved on.
    return <EmptyState size="sm" overline="Outbox" title="That message has left the Outbox." actionLabel="Close" onAction={onGone} />
  }
  const { draft } = item
  const account = accounts.find((a) => a.id === draft.accountId)
  const then = (run: () => unknown) => () => {
    onGone()
    void run()
  }
  return (
    <div className={phone ? "flex flex-col gap-6 px-4" : "flex flex-col gap-6"}>
      <article aria-label={subjectOf(draft)} className="flex flex-col gap-6">
        <MetaList>
          <MetaItem label="To">{toNames(draft)}</MetaItem>
          <MetaItem label="From">{account ? `${account.displayName} // ${account.address}` : "—"}</MetaItem>
          {section === "failed" ? (
            <MetaItem label="Failed">{rowTime(item.sendAt, new Date(now * 1000))}</MetaItem>
          ) : (
            <MetaItem label="Sends">{section === "sending" ? secondsLeft(item) : rowTime(item.sendAt, new Date(now * 1000))}</MetaItem>
          )}
          {(draft.attachments?.length ?? 0) > 0 && <MetaItem label="Attached">{formatListCount(draft.attachments!.length)}</MetaItem>}
        </MetaList>
        <div className="flex flex-col gap-2">
          {section === "failed" && (
            <div>
              <Badge tone="critical">Not sent</Badge>
            </div>
          )}
          <h2 className="type-title break-words text-foreground">{subjectOf(draft)}</h2>
          {section === "failed" && item.error && <p className="type-body text-critical-text">{item.error}</p>}
        </div>
        <p className="type-body whitespace-pre-wrap break-words text-foreground">{draft.body.trim() || "(no text)"}</p>
      </article>
      <div className="relative flex flex-wrap gap-2">
        {section === "sending" && (
          <Button variant="secondary" onClick={then(() => outboxActions.undo(item))}>
            <Icon name="undo" data-icon="inline-start" /> Undo
          </Button>
        )}
        {section === "failed" && (
          <>
            <Button variant="secondary" onClick={then(() => outboxActions.editFailed(item))}>
              <Icon name="edit" data-icon="inline-start" /> Edit
            </Button>
            <Button variant="secondary" onClick={then(() => outboxActions.removeFailed(item))}>
              <Icon name="trash-can" data-icon="inline-start" /> Delete
            </Button>
          </>
        )}
        {section === "scheduled" && (
          <>
            <Button variant="secondary" onClick={then(() => outboxActions.sendNow(item))}>
              <Icon name="send--alt" data-icon="inline-start" /> Send now
            </Button>
            <SendLaterMenu
              open={moving}
              onOpenChange={setMoving}
              value={item.sendAt}
              onPick={(at) => void outboxActions.changeTime(item, at)}
              trigger={
                <Button variant="secondary">
                  <Icon name="time" data-icon="inline-start" /> Change time
                </Button>
              }
            />
            <Button variant="secondary" onClick={then(() => outboxActions.edit(item))}>
              <Icon name="edit" data-icon="inline-start" /> Edit
            </Button>
            <Button variant="secondary" onClick={then(() => outboxActions.remove(item))}>
              <Icon name="trash-can" data-icon="inline-start" /> Delete
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
