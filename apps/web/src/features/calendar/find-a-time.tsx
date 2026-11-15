import { useState } from "react"

import { Button, FilterChip, FilterChipGroup, Icon } from "@unicron/ui"
import { getCoreClient } from "@/core/client"
import type { TimeSlot } from "@/core/types"

import { clock, folio, fromInputs, fromSecs, secs } from "./dates"

// Working hours for suggestions: 9 to 6, weekdays.
const DAY_START = 9 * 60
const DAY_END = 18 * 60

/**
 * FIND A TIME (brief C3): free times in your own calendars for an event this
 * long, from the chosen day over the next two weeks, as single-choice chips
 * ("Wed 11.18 10:00"). Picking one sets the start and the end. They stay
 * chips though they can be more than four: found results, not a fixed list.
 */
export function FindATime({ date, minutes, onPick }: { date: string; minutes: number; onPick: (start: Date, end: Date) => void }) {
  const [slots, setSlots] = useState<TimeSlot[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [picked, setPicked] = useState<string | null>(null)
  const length = minutes >= 60 ? `${+(minutes / 60).toFixed(1)} h` : `${minutes} min`
  const find = async () => {
    setBusy(true)
    setError(null)
    setPicked(null)
    try {
      // From the chosen day's start; the core never suggests the past.
      setSlots(await (await getCoreClient()).findTimes({ from: secs(fromInputs(date)), minutes: Math.max(15, minutes), dayStart: DAY_START, dayEnd: DAY_END, weekdaysOnly: true, limit: 6 }))
    } catch (e) {
      // A failed action: one critical line beside the control, in the server's words (decisions §9).
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex flex-col gap-2" data-slot="find-a-time">
      <div className="flex flex-wrap items-center gap-x-2">
        <Button type="button" variant="ghost" size="sm" loading={busy} onClick={() => void find()}>
          <Icon name="event--schedule" /> {slots ? "Find again" : "Find a time"}
        </Button>
        <span className="type-caption text-text-secondary">{`Free ${length}, weekdays 09:00 – 18:00`}</span>
      </div>
      {error && (
        <p className="type-caption text-critical-text" role="alert">
          {error}
        </p>
      )}
      {slots && slots.length === 0 && <p className="type-caption text-text-secondary">No free time like that in the next two weeks.</p>}
      {slots && slots.length > 0 && (
        <FilterChipGroup
          type="single"
          label="Free times"
          value={picked}
          onValueChange={(v) => {
            const s = slots.find((x) => String(x.start) === v)
            if (!s) return
            setPicked(v)
            onPick(fromSecs(s.start), fromSecs(s.end))
          }}
        >
          {slots.map((s) => (
            <FilterChip key={s.start} value={String(s.start)}>
              {`${folio(fromSecs(s.start))} ${clock(s.start)}`}
            </FilterChip>
          ))}
        </FilterChipGroup>
      )}
    </div>
  )
}
