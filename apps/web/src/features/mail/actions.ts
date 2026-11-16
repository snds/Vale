import { toast } from "@unicron/ui"

import { useMailAction } from "@/core/queries"
import type { MessageSummary } from "@/core/types"

/**
 * Conversation triage shared by the toolbar, keyboard shortcuts, and swipe
 * gestures. Anything that moves mail out of view toasts with Undo
 * (principle: reversibility).
 */
/** A conversation as a toast names it: its subject. */
const name = (m: MessageSummary) => m.subject || "(no subject)"

export function useTriage(onLeave: () => void) {
  const seen = useMailAction<{ threadId: string; seen: boolean }>((c, a) => c.setThreadSeen(a.threadId, a.seen))
  const flag = useMailAction<{ threadId: string; flagged: boolean }>((c, a) => c.setThreadFlagged(a.threadId, a.flagged))
  const archive = useMailAction<{ threadId: string; archived: boolean }>((c, a) => c.setThreadArchived(a.threadId, a.archived))
  const snooze = useMailAction<{ threadId: string; until: number }>((c, a) => c.snoozeThread(a.threadId, a.until))
  const unsnooze = useMailAction<{ threadId: string }>((c, a) => c.unsnoozeThread(a.threadId))
  // Archiving a conversation a reminder brought back dismisses the reminder (DONE does just that), so its
  // UNDO puts both back: the conversation, then the reminder at its own time (Vale 33).
  const unarchive = useMailAction<{ threadId: string; reminder: number | null }>(async (c, a) => {
    // A conversation of only your own mail has nothing to un-archive: the reminder is all there is to put back.
    await c.setThreadArchived(a.threadId, false).catch((e) => {
      if (a.reminder === null) throw e
    })
    if (a.reminder !== null) await c.restoreFollowUp(a.threadId, a.reminder)
  })

  const fail = (e: unknown) => toast.error(String(e instanceof Error ? e.message : e))

  return {
    markSeen: (m: MessageSummary, value: boolean) => seen.mutate({ threadId: m.threadId, seen: value }, { onError: fail }),
    toggleSeen: (m: MessageSummary) => seen.mutate({ threadId: m.threadId, seen: !m.seen }, { onError: fail }),
    toggleFlag: (m: MessageSummary) => flag.mutate({ threadId: m.threadId, flagged: !m.flagged }, { onError: fail }),
    toggleArchive: (m: MessageSummary) => {
      const archived = !m.archived
      const reminder = archived && m.followUpAt != null && m.followUpAt <= Date.now() / 1000 ? m.followUpAt : null
      archive.mutate(
        { threadId: m.threadId, archived },
        {
          onError: fail,
          onSuccess: () => {
            onLeave()
            // Toasts name the thing (cross-app decisions §12).
            toast(archived ? `Archived ${name(m)}` : `Moved ${name(m)} to Inbox`, {
              action: {
                label: "Undo",
                onClick: () =>
                  archived ? unarchive.mutate({ threadId: m.threadId, reminder }, { onError: fail }) : archive.mutate({ threadId: m.threadId, archived: true }, { onError: fail }),
              },
            })
          },
        },
      )
    },
    snooze: (m: MessageSummary, until: number, label: string) =>
      snooze.mutate(
        { threadId: m.threadId, until },
        {
          onError: fail,
          onSuccess: () => {
            onLeave()
            // A preset's name reads in lower case ("tomorrow"); a picked date and time keeps its capitals ("Fri, Nov 13, 11:00 AM").
            toast(`Snoozed ${name(m)} until ${/\d/.test(label) ? label : label.toLowerCase()}`, {
              action: { label: "Undo", onClick: () => unsnooze.mutate({ threadId: m.threadId }) },
            })
          },
        },
      ),
    unsnooze: (m: MessageSummary) => unsnooze.mutate({ threadId: m.threadId }, { onError: fail }),
  }
}
