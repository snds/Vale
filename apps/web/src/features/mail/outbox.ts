import { useMemo } from "react"
import { create } from "zustand"
import { toast } from "@unicron/ui"

import { useUi } from "@/app/ui-store"
import { getCoreClient } from "@/core/client"
import { useOutbox } from "@/core/queries"
import type { Draft, OutboxItem } from "@/core/types"

import { displayName } from "./format"
import { longTime } from "@/lib/time"
import { sendName, undoSend } from "./sending"

// ── Failed sends, said once (ADR-0095; brief M7) ─────────────────────────

/**
 * The failed sends this device has said something about, by id: `toasted`
 * had their toast, `seen` were looked at (the Outbox opened, or EDIT
 * pressed). The banner and the Outbox's critical tone stand until an item is
 * seen; the toast is raised once. Kept on the device, so a reload does not
 * say it again; it can come back empty, and then each is said once more.
 */
interface Shown {
  toasted: string[]
  seen: string[]
}
const KEY = "vale.outbox.shown"
/** Enough for every failed send the core still lists; the oldest ids go first. */
const KEEP = 200
function readShown(): Shown {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<Shown> | null
    return { toasted: Array.isArray(v?.toasted) ? v.toasted : [], seen: Array.isArray(v?.seen) ? v.seen : [] }
  } catch {
    return { toasted: [], seen: [] }
  }
}
export const useShown = create<Shown>(readShown)
export function remember(next: Partial<Shown>) {
  const s = { ...useShown.getState(), ...next }
  const kept = { toasted: s.toasted.slice(-KEEP), seen: s.seen.slice(-KEEP) }
  useShown.setState(kept)
  try {
    localStorage.setItem(KEY, JSON.stringify(kept))
  } catch {
    // No storage on this device: the ids last for the session.
  }
}
export const toastId = (id: string) => `not-sent-${id}`

/** Failed sends count as seen: the Outbox was opened, or EDIT pressed. Their toasts go. */
export function markFailedSeen(ids: string[]) {
  const { seen, toasted } = useShown.getState()
  const fresh = ids.filter((id) => !seen.includes(id))
  for (const id of ids) toast.dismiss(toastId(id))
  if (fresh.length) remember({ seen: [...seen, ...fresh], toasted: [...toasted, ...fresh.filter((id) => !toasted.includes(id))] })
}

/**
 * EDIT on a failed send (brief M7, W9): a copy of its message opens, and the
 * failed item stays listed until DELETE clears it (Vale 35).
 */
export function editFailed(item: OutboxItem) {
  markFailedSeen([item.id])
  useUi.getState().openComposer(structuredClone(item.draft))
}

/** The failed sends the core lists, and those not yet seen: the banner's, and the Outbox's critical tone. */
export function useFailedSends() {
  const { data: outbox } = useOutbox()
  const seen = useShown((s) => s.seen)
  const failed = (outbox ?? []).filter((i) => i.state === "failed")
  return { failed, unseen: failed.filter((i) => !seen.includes(i.id)) }
}

/** Where an Outbox item is (brief M7): in its undo window, failed, or sent later on purpose. */
export type OutboxSection = "sending" | "failed" | "scheduled"

export const sectionOf = (item: OutboxItem): OutboxSection | null =>
  item.state === "failed" ? "failed" : item.state === "queued" ? (item.scheduled ? "scheduled" : "sending") : null

/** The section heads, in the order they stand, each shown only with rows. */
export const SECTIONS: { id: OutboxSection; title: string }[] = [
  { id: "sending", title: "Sending" },
  { id: "failed", title: "Not sent" },
  { id: "scheduled", title: "Scheduled" },
]

/** "To Priya Raman, Marcus Lee": who a message goes to, as its row and its detail say it. */
export const toNames = (draft: Draft) => [...draft.to, ...draft.cc].map(displayName).join(", ") || "no one"
export const subjectOf = (draft: Draft) => draft.subject.trim() || "(no subject)"
const fail = (e: unknown) => toast.error(e instanceof Error ? e.message : String(e))

/**
 * What waits to go out (ADR-0095; brief M7), from the core's outbox: the
 * sends in their undo window, the ones that failed, and the ones sent later
 * on purpose, soonest first. One account's, when one is chosen.
 */
export function useOutboxItems(accountId: string | null) {
  const { data, isPending, error, refetch, isRefetching } = useOutbox()
  return useMemo(() => {
    const items = (data ?? []).filter((i) => sectionOf(i) !== null && (!accountId || i.draft.accountId === accountId))
    const by = (s: OutboxSection) => items.filter((i) => sectionOf(i) === s).sort((a, b) => (s === "sending" ? b.sendAt - a.sendAt : a.sendAt - b.sendAt))
    return { items, sending: by("sending"), failed: by("failed"), scheduled: by("scheduled"), isPending, error, refetch, isRefetching }
  }, [data, accountId, isPending, error, refetch, isRefetching])
}

/**
 * EDIT on a message that waits or failed, closing it unchanged, and the
 * rest of what the Outbox does to an item. Each says what it did in a toast
 * that names the message.
 */
export const outboxActions = {
  /** A send in its undo window: taken back, and the message reopens as it was. */
  undo: (item: OutboxItem) => void undoSend(item.id),
  /** A scheduled message goes now: it waits out no undo window, as Send now has always done. */
  sendNow: async (item: OutboxItem) => {
    try {
      await (await getCoreClient()).rescheduleSend(item.id, null)
    } catch (e) {
      fail(e)
    }
  },
  changeTime: async (item: OutboxItem, at: number) => {
    try {
      const moved = await (await getCoreClient()).rescheduleSend(item.id, at)
      // A toast is a sentence: the device's own format, not the row's (Vale 35).
      toast(`Moved ${sendName(item)} to ${longTime(moved.sendAt)}`)
    } catch (e) {
      fail(e)
    }
  },
  /** Taken out of the Outbox and reopened with its time; closed unchanged, it goes back (`backToOutbox`). */
  edit: async (item: OutboxItem) => {
    try {
      const draft = await (await getCoreClient()).cancelSend(item.id)
      useUi.getState().openComposer({ ...draft, sendAt: item.sendAt, outbox: { draft, sendAt: item.sendAt } })
    } catch (e) {
      fail(e)
    }
  },
  /** Taken out; UNDO queues it again with its time. */
  remove: async (item: OutboxItem) => {
    try {
      const client = await getCoreClient()
      const kept = await client.cancelSend(item.id)
      toast(`Deleted ${sendName(item)}`, {
        action: { label: "Undo", onClick: () => void client.queueSend(kept, 0, item.sendAt).catch(fail) },
      })
    } catch (e) {
      fail(e)
    }
  },
  editFailed,
  /** DELETE on a failed send (W9, Vale 35): out of the Outbox; UNDO puts it back as it was. */
  removeFailed: async (item: OutboxItem) => {
    try {
      const client = await getCoreClient()
      markFailedSeen([item.id])
      await client.clearFailedSend(item.id)
      toast(`Deleted ${sendName(item)}`, {
        action: { label: "Undo", onClick: () => void client.restoreFailedSend(item.id).catch(fail) },
      })
    } catch (e) {
      fail(e)
    }
  },
}

/**
 * A message EDIT took out of the Outbox, closed without sending: back at its
 * time, as it was (brief M7, X6), with "Back in Outbox for Tue 09:00". A time
 * that has come while it was open can't be kept, so the toast says why and
 * EDIT opens it again.
 */
export async function backToOutbox({ draft, sendAt }: { draft: Draft; sendAt: number }) {
  try {
    const item = await (await getCoreClient()).queueSend(draft, 0, sendAt)
    toast(`Back in Outbox for ${longTime(item.sendAt)}`)
  } catch (e) {
    toast.error(`Not back in Outbox: ${draft.subject.trim() || "message"}`, {
      description: e instanceof Error ? e.message : String(e),
      duration: Infinity,
      action: { label: "Edit", onClick: () => useUi.getState().openComposer({ ...draft, sendAt: null }) },
    })
  }
}

