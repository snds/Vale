import { type IconName, toast } from "@unicron/ui"
import { useMailAction } from "@/core/queries"
import type { MessageSummary, SwipeActionId } from "@/core/types"
import { snoozeOptions } from "@/lib/time"

import type { useTriage } from "./actions"
import type { useSenderActions } from "./sender-actions"

/**
 * One action, as a swipe tile shows it and as the row's menu lists it
 * (ADR-0090): unicron's SwipeRow action, with the words the tile sets in
 * capitals. `reversible` actions (they toggle, or toast an Undo) are the only
 * ones a full swipe may run; any other opens the row and stops there.
 */
export interface MailVerb {
  icon: IconName
  /** What the tile says it will do, in sentence case ("Unread", "Inbox"). */
  label: string
  reversible: boolean
  onAction: () => void
}

/**
 * The swipe-able part of the shared mail vocabulary (ADR-0025): what each
 * action is called in Settings, and the key command that does the same
 * thing (ADR-0032), so a gesture is never the only way in.
 */
export const SWIPE_CHOICES: { id: SwipeActionId; label: string; command?: string }[] = [
  { id: "read", label: "Read / unread", command: "mail.unread" },
  { id: "archive", label: "Archive", command: "mail.archive" },
  { id: "star", label: "Star", command: "mail.star" },
  { id: "snooze-tomorrow", label: "Snooze until tomorrow", command: "mail.snooze-tomorrow" },
  { id: "snooze-next-week", label: "Snooze until next week", command: "mail.snooze-next-week" },
  { id: "remind", label: "Remind me in 3 days if nobody replies", command: "mail.remind" },
  { id: "newsletters", label: "Always in Newsletters", command: "mail.newsletters" },
  { id: "none", label: "Nothing" },
]

/**
 * Kept for the settings that still read it. The tiles take their fill from
 * unicron's SwipeRow now (ADR-0090): the outermost and the leading tile
 * primary, the rest raised neutral.
 * @deprecated
 */
export const PRIMARY = "bg-primary text-primary-foreground"

/** 9:00 three days from now, for "remind me if nobody replies". */
const inThreeDays = () => {
  const d = new Date(Date.now() + 3 * 86_400_000)
  d.setHours(9, 0, 0, 0)
  return Math.floor(d.getTime() / 1000)
}

/** Turns an action id into what a swipe on `m`, or its menu item, shows and does. */
export function useMailVerbs(triage: ReturnType<typeof useTriage>, senders: ReturnType<typeof useSenderActions>) {
  const followUp = useMailAction<{ threadId: string; at: number }>((c, a) => c.setFollowUp(a.threadId, a.at))
  return (id: SwipeActionId, m: MessageSummary): MailVerb | null => {
    const snooze = (label: string) => () => {
      const o = snoozeOptions().find((x) => x.label === label)
      if (o) triage.snooze(m, o.until, o.label)
    }
    switch (id) {
      case "none":
        return null
      case "read":
        return { icon: m.seen ? "email--new" : "view", label: m.seen ? "Unread" : "Read", reversible: true, onAction: () => triage.toggleSeen(m) }
      case "archive":
        return { icon: m.archived ? "reset" : "archive", label: m.archived ? "Inbox" : "Archive", reversible: true, onAction: () => triage.toggleArchive(m) }
      case "star":
        // "Star" with the star everywhere (Q7); the drawn tile's FLAG is the same action.
        return { icon: m.flagged ? "star--filled" : "star", label: m.flagged ? "Unstar" : "Star", reversible: true, onAction: () => triage.toggleFlag(m) }
      case "snooze-tomorrow":
        return { icon: "time", label: "Snooze", reversible: true, onAction: snooze("Tomorrow") }
      case "snooze-next-week":
        return { icon: "time", label: "Snooze", reversible: true, onAction: snooze("Next week") }
      case "remind":
        return {
          icon: "notification",
          label: "Remind",
          reversible: false,
          onAction: () =>
            followUp.mutate(
              { threadId: m.threadId, at: inThreeDays() },
              { onSuccess: () => toast("Comes back in 3 days if nobody replies"), onError: (e) => toast.error(e.message) },
            ),
        }
      case "newsletters":
        return { icon: "blog", label: "Newsletters", reversible: false, onAction: () => senders.move(m.from, "newsletters") }
    }
  }
}
