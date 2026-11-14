import { useState } from "react"

import { Icon, TextField, toast } from "@unicron/ui"
import { usePimAction } from "@/core/queries"
import type { Collection } from "@/core/types"

import { clock, fmt, fromSecs, secs } from "./dates"
import { parseQuickAdd, quickToInput } from "./quick-add"

/**
 * Natural-language add: "Lunch with Ana tomorrow 1pm at Café". One field,
 * Enter adds the event to the first calendar that takes new events, and the
 * helper line says what it read. It stands in the calendars list (ADR-0098)
 * and the menu-bar window, until the event form reads a sentence itself
 * (brief C4, Q5).
 */
export function QuickAdd({ calendars }: { calendars: Map<string, Collection> }) {
  const [text, setText] = useState("")
  const create = usePimAction((c, input: Parameters<typeof c.createEvent>[0]) => c.createEvent(input))
  const target = [...calendars.values()].find((c) => c.writable && !c.hidden) ?? [...calendars.values()].find((c) => c.writable)
  const parsed = parseQuickAdd(text)
  const submit = async () => {
    if (!parsed || !target) return
    try {
      const e = await create.mutateAsync(quickToInput(parsed, target.id))
      setText("")
      toast.success(`Added ${e.title}`, { description: `${fmt.dayLong(fromSecs(e.start))}${e.allDay ? "" : `, ${clock(e.start)}`} // ${target.name}`, duration: 4000 })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }
  // What it read, as a card's mono line would say it: "Lunch with Ana // Tomorrow 13:00 // Café".
  const read =
    parsed &&
    [parsed.title, parsed.allDay ? fmt.dayLong(parsed.start) : `${fmt.dayLong(parsed.start)} ${clock(secs(parsed.start))}`, parsed.location, parsed.dated ? null : "add a day, like “fri 3pm”"]
      .filter(Boolean)
      .join(" // ")
  return (
    <form onSubmit={(e) => (e.preventDefault(), void submit())} data-slot="quick-add">
      <TextField
        label="Quick add event"
        placeholder="Lunch Friday 1pm"
        leading={<Icon name="add" />}
        value={text}
        onChange={(e) => setText(e.target.value)}
        enterKeyHint="done"
        helper={read || undefined}
      />
    </form>
  )
}
