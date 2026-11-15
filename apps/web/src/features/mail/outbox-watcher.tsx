import { useEffect, useRef } from "react"
import { toast } from "@unicron/ui"

import { useCore, useOutbox } from "@/core/queries"

import { editFailed, remember, toastId, useShown } from "./outbox"
import { sendName, undoSend, useSending } from "./sending"

/** Focus is where typing has its own undo: a field, a select, an editor. */
const typing = (el: EventTarget | null) => el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))

/**
 * What happens to a send, said once. Mounted at the root.
 *
 * While its undo window is open the send is live, so the status strip and
 * the status line show it (`useSending` in sending.ts, app/status.tsx), not a toast. Here:
 * ⌘Z or Ctrl+Z outside a text field takes back the newest send; when a send
 * goes out, the toast "Sent {subject}"; and a send that failed raises
 * "Not sent: {subject}" with EDIT, which stays until closed, once per item,
 * whether it failed now or while Vale was closed.
 */
export function OutboxWatcher() {
  const { data: core } = useCore()
  const { data: outbox } = useOutbox()
  const sending = useSending()
  const newest = useRef<string | null>(null)
  useEffect(() => {
    newest.current = sending?.newest.id ?? null
  })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "z" || !(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) return
      if (!newest.current || typing(e.target)) return
      e.preventDefault()
      void undoSend(newest.current)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  // Sent: the core emits `outbox:changed` with the id of an item that left the outbox's list.
  useEffect(() => {
    if (!core) return
    return core.on("outbox:changed", async (id) => {
      if (typeof id !== "string") return
      const still = (await core.listOutbox()).find((i) => i.id === id)
      if (still) return
      const sent = sentNames.get(id)
      sentNames.delete(id)
      toast(sent ? `Sent ${sent}` : "Sent message")
    })
  }, [core])

  // Not sent: each failed item the toast has not yet named, from the list itself, so one that failed while Vale was closed is said too.
  useEffect(() => {
    for (const item of outbox ?? []) sentNames.set(item.id, sendName(item))
    const { toasted, seen } = useShown.getState()
    const fresh = (outbox ?? []).filter((i) => i.state === "failed" && !toasted.includes(i.id) && !seen.includes(i.id))
    if (!fresh.length) return
    remember({ toasted: [...toasted, ...fresh.map((i) => i.id)] })
    for (const item of fresh) {
      toast.error(`Not sent: ${sendName(item)}`, {
        id: toastId(item.id),
        description: item.error ?? undefined,
        duration: Infinity,
        action: { label: "Edit", onClick: () => editFailed(item) },
      })
    }
  }, [outbox])
  return null
}

/** The names of messages seen waiting in the outbox, by id, for the toast once each has gone out. */
const sentNames = new Map<string, string>()
