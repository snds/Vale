import { useState, type ReactElement } from "react"

import {
  AdaptiveMenu,
  AdaptiveMenuGroup,
  AdaptiveMenuItem,
  AdaptiveMenuSeparator,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Icon,
} from "@unicron/ui"
import { DateTimePicker, MenuAnchor } from "@/components/date-picker"
import { snoozeOptions } from "@/lib/time"

const PICK = "Pick a date and time…"
const NOTE = "The note comes back at this time, with a notification."

interface RemindProps {
  /** When the note comes back, in the core's seconds, or null. */
  value: number | null
  /** A time, or null to remove the reminder. */
  onPick: (at: number | null) => void
}

/**
 * "Remind me" on a desktop (brief N2, ADR-0039): a menu headed REMIND ME
 * with the snooze presets (each with its exact time, so "Tomorrow" is never
 * vague), "Pick a date and time…" (the shared picker, ADR-0088, which stands
 * where the menu did) and "Remove reminder". `trigger` is the note toolbar's
 * button.
 */
export function RemindMenu({ value, onPick, trigger }: RemindProps & { trigger: ReactElement<Record<string, unknown>> }) {
  const [custom, setCustom] = useState(false)
  return (
    <DropdownMenu>
      {/* The picker stands where the menu did: both open from the one button (ADR-0088). */}
      <DateTimePicker
        open={custom}
        onOpenChange={(open) => !open && setCustom(false)}
        trigger={<MenuAnchor menu={<DropdownMenuTrigger render={trigger} />} />}
        title="Remind me"
        value={value}
        note={NOTE}
        action="Set reminder"
        onPick={(at) => onPick(at)}
      />
      <DropdownMenuContent align="end" width="auto">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Remind me</DropdownMenuLabel>
          {snoozeOptions().map((o) => (
            <DropdownMenuItem key={o.label} onClick={() => onPick(o.until)}>
              <Icon name="time" />
              <span className="flex-1">{o.label}</span>
              <span className="type-meta text-muted-foreground">{o.detail}</span>
            </DropdownMenuItem>
          ))}
          <DropdownMenuItem onClick={() => setCustom(true)}>
            <Icon name="event--schedule" /> {PICK}
          </DropdownMenuItem>
        </DropdownMenuGroup>
        {value && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onPick(null)}>
              <Icon name="notification--off" /> Remove reminder
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * The same choices on a phone: a sheet headed REMIND ME, opened from the
 * note's More sheet, so it has no button of its own (`anchor` is a hidden
 * one, for focus to fall back to the More button). "Pick a date and time…"
 * opens the picker's sheet in its place.
 */
export function RemindSheet({ value, onPick, open, onOpenChange, anchor }: RemindProps & { open: boolean; onOpenChange: (open: boolean) => void; anchor: () => ReactElement<Record<string, unknown>> }) {
  const [custom, setCustom] = useState(false)
  return (
    <>
      <AdaptiveMenu open={open} onOpenChange={onOpenChange} presentation="sheet" trigger={anchor()} overline="Note" title="Remind me">
        <AdaptiveMenuGroup>
          {snoozeOptions().map((o) => (
            <AdaptiveMenuItem key={o.label} icon="time" onSelect={() => onPick(o.until)}>
              <span className="flex-1">{o.label}</span>
              <span className="type-meta text-muted-foreground">{o.detail}</span>
            </AdaptiveMenuItem>
          ))}
          <AdaptiveMenuItem icon="event--schedule" onSelect={() => setCustom(true)}>
            {PICK}
          </AdaptiveMenuItem>
        </AdaptiveMenuGroup>
        {value && (
          <>
            <AdaptiveMenuSeparator />
            <AdaptiveMenuItem icon="notification--off" onSelect={() => onPick(null)}>
              Remove reminder
            </AdaptiveMenuItem>
          </>
        )}
      </AdaptiveMenu>
      <DateTimePicker
        open={custom}
        onOpenChange={(next) => !next && setCustom(false)}
        trigger={anchor()}
        title="Remind me"
        value={value}
        note={NOTE}
        action="Set reminder"
        onPick={(at) => onPick(at)}
      />
    </>
  )
}
