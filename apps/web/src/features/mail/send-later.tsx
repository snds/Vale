import { useState, type ReactElement } from "react"

import {
  AdaptiveMenu,
  AdaptiveMenuGroup,
  AdaptiveMenuItem,
  AdaptiveMenuSeparator,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  Icon,
  useAdaptiveSheet,
} from "@unicron/ui"
import { DateTimePicker } from "@/components/date-picker"
import { sendLaterOptions } from "@/lib/time"

import { rowTime } from "./row-time"

/** "09:00 for Priya": a time on a recipient's own clock, and when that is here (ADR-0041). */
export interface TheirMorning {
  at: number
  /** "9:00 AM for Priya". */
  label: string
}

/** The picker's words for a time to send at (brief M7). */
const SEND_LATER_PICKER = {
  title: "Send later",
  note: "If the desktop app is closed then, it sends when it next opens. A gateway sends on time.",
  action: "Schedule",
} as const

/** A menu that another menu opens stands by an anchor of its own: it takes no press and no focus. */
const anchor = <span aria-hidden="true" tabIndex={-1} className="pointer-events-none absolute top-full right-0 size-0" />

/** A row's words and its time in mono, as the times read in rows. */
const Choice = ({ label, at }: { label: string; at: number }) => (
  <>
    <span className="flex-1">{label}</span>
    <span className="ps-4 type-meta text-muted-foreground">{rowTime(at)}</span>
  </>
)

/**
 * Send later as the rows of the SplitButton's own menu (ADR-0095; brief M7):
 * the mono label SEND LATER, `sendLaterOptions` with their times in mono, a
 * THEIR TIME group when a recipient lives in another zone, then "Pick date
 * and time…", which the host opens (`onCustom`) as the shared picker.
 */
export function SendLaterItems({ theirs = [], onPick, onCustom }: { theirs?: TheirMorning[]; onPick: (at: number) => void; onCustom: () => void }) {
  return (
    <>
      <DropdownMenuGroup>
        <DropdownMenuLabel>Send later</DropdownMenuLabel>
        {sendLaterOptions().map((o) => (
          <DropdownMenuItem key={o.label} onClick={() => onPick(o.until)}>
            <Icon name="time" />
            <Choice label={o.label} at={o.until} />
          </DropdownMenuItem>
        ))}
      </DropdownMenuGroup>
      {theirs.length > 0 && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel>Their time</DropdownMenuLabel>
            {theirs.map((t) => (
              <DropdownMenuItem key={t.label} onClick={() => onPick(t.at)}>
                <Icon name="earth" />
                <Choice label={t.label} at={t.at} />
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        </>
      )}
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={onCustom}>
        <Icon name="calendar" />
        Pick date and time…
      </DropdownMenuItem>
    </>
  )
}

/**
 * The same choices as a menu of their own (unicron's AdaptiveMenu: a menu on
 * a desktop, a sheet on a phone), with the picker behind "Pick date and
 * time…": for a phone's composer (More, or a long press on Send) and the
 * Outbox's CHANGE TIME. Opened by its trigger, or by another menu (`open`).
 */
export function SendLaterMenu({
  open,
  onOpenChange,
  trigger,
  theirs = [],
  value,
  onPick,
}: {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  trigger?: ReactElement<Record<string, unknown>>
  theirs?: TheirMorning[]
  /** The time already set: the picker opens on it. */
  value?: number | null
  onPick: (at: number) => void
}) {
  const [picking, setPicking] = useState(false)
  // The mono label: the menu's first line on a desktop; a phone's sheet says it as its title.
  const sheet = useAdaptiveSheet()
  return (
    <>
      <AdaptiveMenu title="Send later" overline={sheet ? undefined : "Send later"} align="end" open={open} onOpenChange={onOpenChange} trigger={trigger ?? anchor}>
        {sendLaterOptions().map((o) => (
          <AdaptiveMenuItem key={o.label} icon="time" onSelect={() => onPick(o.until)}>
            <Choice label={o.label} at={o.until} />
          </AdaptiveMenuItem>
        ))}
        {theirs.length > 0 && (
          <AdaptiveMenuGroup label="Their time">
            {theirs.map((t) => (
              <AdaptiveMenuItem key={t.label} icon="earth" onSelect={() => onPick(t.at)}>
                <Choice label={t.label} at={t.at} />
              </AdaptiveMenuItem>
            ))}
          </AdaptiveMenuGroup>
        )}
        <AdaptiveMenuSeparator />
        <AdaptiveMenuItem icon="calendar" onSelect={() => setPicking(true)}>
          Pick date and time…
        </AdaptiveMenuItem>
      </AdaptiveMenu>
      {picking && <SendLaterPicker value={value} onClose={() => setPicking(false)} onPick={onPick} />}
    </>
  )
}

/** The shared picker titled Send later, with its line and SCHEDULE (brief M7). It stands by its own anchor. */
export function SendLaterPicker({ value, onClose, onPick }: { value?: number | null; onClose: () => void; onPick: (at: number) => void }) {
  return <DateTimePicker open onOpenChange={(o) => !o && onClose()} trigger={anchor} {...SEND_LATER_PICKER} value={value} onPick={onPick} />
}
