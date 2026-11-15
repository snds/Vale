import { useState, type ReactElement } from "react"

import { AdaptiveMenu, AdaptiveMenuItem, AdaptiveMenuSeparator, useAdaptiveSheet } from "@unicron/ui"
import { DateTimePicker } from "@/components/date-picker"
import { snoozeOptions } from "@/lib/time"

import { rowTime } from "./row-time"

/** A menu that another menu opens stands by an anchor of its own: it takes no press and no focus. */
const anchor = <span aria-hidden="true" tabIndex={-1} className="pointer-events-none absolute top-full right-0 size-0" />

/** What each list is for (brief M8): its mono label, the picker's title and primary, and the line under the picker. */
const KINDS = {
  snooze: { title: "Snooze until", picker: "Snooze", action: "Snooze", note: undefined },
  remind: {
    title: "Remind me if no reply",
    picker: "Remind me if no reply",
    action: "Set reminder",
    note: "If nobody has replied by then, the conversation comes back to the top of your inbox.",
  },
} as const

/**
 * A time to bring a conversation back (ADR-0095; brief M8): Snooze, and
 * Remind me if no reply on a thread with your mail in it. One list for both:
 * the mono label, `snoozeOptions` each with its time in mono, then "Pick date
 * and time…", the shared picker titled for the job. A menu on a desktop, a
 * sheet on a phone (unicron's AdaptiveMenu). Opened by its trigger, or by
 * another menu (`open`), when it stands by an anchor of its own.
 *
 * `onPick` gets the time and how a toast says it: a preset's name in lower
 * case ("tomorrow"), or a picked time as rows write it ("Fri 11:00").
 */
export function LaterMenu({
  kind,
  open,
  onOpenChange,
  trigger,
  onPick,
}: {
  kind: keyof typeof KINDS
  open?: boolean
  onOpenChange?: (open: boolean) => void
  trigger?: ReactElement<Record<string, unknown>>
  onPick: (at: number, label: string) => void
}) {
  const words = KINDS[kind]
  const [picking, setPicking] = useState(false)
  // The mono label: the menu's first line on a desktop; a phone's sheet says it as its title.
  const sheet = useAdaptiveSheet()
  return (
    <>
      <AdaptiveMenu title={words.title} overline={sheet ? undefined : words.title} align="end" open={open} onOpenChange={onOpenChange} trigger={trigger ?? anchor}>
        {snoozeOptions().map((o) => (
          <AdaptiveMenuItem key={o.label} icon={kind === "snooze" ? "time" : "notification"} onSelect={() => onPick(o.until, o.label.toLowerCase())}>
            <span className="flex-1">{o.label}</span>
            <span className="ps-4 type-meta text-muted-foreground">{rowTime(o.until)}</span>
          </AdaptiveMenuItem>
        ))}
        <AdaptiveMenuSeparator />
        <AdaptiveMenuItem icon="calendar" onSelect={() => setPicking(true)}>
          Pick date and time…
        </AdaptiveMenuItem>
      </AdaptiveMenu>
      {picking && (
        <DateTimePicker
          open
          onOpenChange={(o) => !o && setPicking(false)}
          trigger={anchor}
          title={words.picker}
          action={words.action}
          note={words.note}
          onPick={(at) => onPick(at, rowTime(at))}
        />
      )}
    </>
  )
}
