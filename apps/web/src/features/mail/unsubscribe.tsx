import { useEffect, useRef, useState } from "react"

import { Button, toast } from "@unicron/ui"
import { useMailAction } from "@/core/queries"
import type { MessageDetail, Unsubscribe, UnsubscribeMethod } from "@/core/types"
import { useConfirm } from "@/lib/confirm"

import { displayName } from "./format"

/** What will happen, said before it happens: one request, a message, or a web page (brief M5). */
function plan(u: Unsubscribe): string {
  if (u.oneClick) return "Vale asks the sender to remove you, in one request. Nothing opens and no message is sent."
  if (u.mailto) return `Vale sends an unsubscribe message to ${u.mailto.replace(/^mailto:/i, "").split("?")[0]} from this account.`
  return "The sender's unsubscribe page opens in your browser."
}

/** The toast for what was done, by method. */
const DONE: Record<UnsubscribeMethod, string> = {
  one_click: "Unsubscribed",
  mail: "Unsubscribe request sent",
  web: "Opened the sender's unsubscribe page",
}

/**
 * Leaving a mailing list that says how (List-Unsubscribe; ADR-0093, brief M5):
 * one question, "Unsubscribe from {sender}?", whose body says what the method
 * will do, with focus on Cancel (f6's `useConfirm`); then a toast for what was
 * done, with ARCHIVE. A failed request keeps the question open with the
 * server's words.
 *
 * The question can also be opened from elsewhere (the message head, the
 * conversation's More menu): pass `open` and `onOpenChange`, and
 * `button={false}` where the button stands somewhere else.
 */
export function UnsubscribeAction({
  message,
  onArchive,
  open: openProp,
  onOpenChange,
  button = true,
}: {
  message: MessageDetail
  onArchive: () => void
  open?: boolean
  onOpenChange?: (open: boolean) => void
  button?: boolean
}) {
  const [own, setOwn] = useState(false)
  const open = openProp ?? own
  const setOpen = (next: boolean) => (onOpenChange ? onOpenChange(next) : setOwn(next))
  const unsubscribe = useMailAction<string>((c, id) => c.unsubscribe(id))
  const confirm = useConfirm()
  const u = message.unsubscribe
  const sender = displayName(message.from)
  // Asked once per opening: the question's own answer closes it again.
  const asking = useRef(false)
  useEffect(() => {
    if (!open || !u || asking.current) return
    asking.current = true
    let method: UnsubscribeMethod | null = null
    void confirm
      .ask({
        title: `Unsubscribe from ${sender}?`,
        description: plan(u),
        confirmLabel: "Unsubscribe",
        tone: "default",
        run: async () => {
          method = (await unsubscribe.mutateAsync(message.id)) as UnsubscribeMethod
        },
      })
      .then((yes) => {
        asking.current = false
        setOpen(false)
        if (yes && method) toast(DONE[method] ?? "Unsubscribed", { action: { label: "Archive", onClick: onArchive } })
      })
    // The question is asked when `open` turns true; what it says is read then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
  if (!u) return null
  return (
    <>
      {button && (
        <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
          Unsubscribe
        </Button>
      )}
      {confirm.question()}
    </>
  )
}
