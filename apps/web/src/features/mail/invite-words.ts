import { useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { create } from "zustand"

import { toast, useAppFrame } from "@unicron/ui"
import { useCollections, useMailAction } from "@/core/queries"
import type { Invite, InviteResponse } from "@/core/types"

import { fromSecs } from "../calendar/dates"

/**
 * What the invitation parts share (ADR-0093; brief M5): the time as the
 * frames write it, the words for an answer, and answering itself, from
 * wherever it is asked.
 */

/** A failed action in the server's words. */
export const fail = (e: unknown) => (e instanceof Error ? e.message : String(e))

const two = (n: number) => String(n).padStart(2, "0")
export const clock = (s: number) => {
  const d = fromSecs(s)
  return `${two(d.getHours())}:${two(d.getMinutes())}`
}
/** A day as the frames write it in a mono line: `Wed 11.18`. */
export const folio = (s: number) => {
  const d = fromSecs(s)
  return `${d.toLocaleDateString(undefined, { weekday: "short" })} ${two(d.getMonth() + 1)}.${two(d.getDate())}`
}
/** When, as the frames write it: `Wed 11.18 // 16:30 – 17:15`; without the day, the hours alone. */
export const inviteTime = (start: number, end: number, allDay: boolean, day = true) => {
  const hours = allDay ? "All day" : `${clock(start)} – ${clock(end)}`
  return day ? `${folio(start)} // ${hours}` : hours
}


/** Field Rows stack their label over the value on a phone (brief 4.0). */
export const useRowSize = () => (useAppFrame().phone ? "stacked" : "default")

/** Words for an answer, as YOUR ANSWER says it and as CHANGE offers it. */
export const ANSWERS: { value: InviteResponse; label: string; verb: string }[] = [
  { value: "accepted", label: "Going", verb: "Accept" },
  { value: "tentative", label: "Maybe", verb: "Maybe" },
  { value: "declined", label: "Not going", verb: "Decline" },
]

/** The calendar each invitation will go into, by message, while it is not in your calendar: CALENDAR's CHANGE sets it, ACCEPT reads it. */
const useChosenCalendar = create<Record<string, string>>(() => ({}))


/**
 * Answering an invitation, from wherever the answer is asked: the needs-you
 * block, a WAITING ON YOU row, YOUR ANSWER's CHANGE. One calendar choice and
 * one set of toasts for all of them; a failed answer says so in the server's
 * words beside the control that asked (cross-app decisions §9).
 */
export function useInviteAnswer(invite: Invite, messageId: string, accountId: string) {
  const { data: calendars = [] } = useCollections("calendar")
  const qc = useQueryClient()
  const writable = calendars.filter((c) => c.writable)
  const fallback = writable.find((c) => c.accountId === accountId) ?? writable[0]
  const chosen = useChosenCalendar((s) => s[messageId])
  const target = chosen && writable.some((c) => c.id === chosen) ? chosen : (fallback?.id ?? "")
  const [error, setError] = useState<string | null>(null)
  const respond = useMailAction((c, r: InviteResponse) => c.respondToInvite(messageId, r, invite.eventId ? null : target))
  const title = invite.title || "(no title)"
  const answer = async (r: InviteResponse) => {
    setError(null)
    try {
      await respond.mutateAsync(r)
      void qc.invalidateQueries({ queryKey: ["pim"] })
      const added = !invite.eventId && r !== "declined" ? writable.find((c) => c.id === target)?.name : undefined
      toast(r === "accepted" ? `Accepted ${title}${added ? ` · added to ${added}` : ""}` : r === "tentative" ? `Replied maybe to ${title}` : `Declined ${title}`)
    } catch (e) {
      setError(fail(e))
    }
  }
  return {
    answer,
    pending: respond.isPending,
    error,
    writable,
    target,
    choose: (id: string) => useChosenCalendar.setState({ [messageId]: id }),
  }
}

/** An invitation that still waits for your answer: it earns the needs-you block (brief M5). */
export const waitsForAnswer = (invite: Invite | null | undefined): invite is Invite =>
  !!invite && invite.method === "request" && !invite.outdated && (!invite.myStatus || invite.myStatus === "needs-action")

/** The block's body: "{title}, 16:30 – 17:15, {location}". */
export function inviteLine(invite: Invite) {
  const hours = invite.start != null && invite.end != null ? inviteTime(invite.start, invite.end, invite.allDay, false) : null
  return [invite.title || "(no title)", hours, invite.location].filter(Boolean).join(", ")
}
