import { FieldRow, FieldRowAction, FilterChip, FilterChipGroup } from "@unicron/ui"
import { ZonePicker } from "@/components/zone-picker"
import { firstDayOfWeek, setWeekStarts, useWeekStarts } from "@/features/calendar/dates"
import { setSecondZone, useSecondZone, zoneLabel } from "@/features/calendar/zones"

import { useRowSize } from "./row-size"

/**
 * The calendar's second time zone (brief T4; ADR-0088): a second column of
 * hours beside the first in the day and the week. This device's choice. The
 * row shows the zone, and CHANGE opens the searchable list, "None" first.
 */
export function SecondZoneRow() {
  const zone = useSecondZone()
  return (
    <FieldRow
      size={useRowSize()}
      label="Second time zone"
      description="A second column of hours in Day and Week."
      action={<ZonePicker title="Second time zone" value={zone} onPick={setSecondZone} none trigger={<FieldRowAction>Change</FieldRowAction>} />}
    >
      {zone ? zoneLabel(zone) : "None"}
    </FieldRow>
  )
}

/** A day's name in the device's language: any Sunday, moved on by `day`. */
const dayName = (day: number) => new Date(2026, 10, 15 + day).toLocaleDateString(undefined, { weekday: "long" })

/**
 * WEEK STARTS (Vale 46; the W4 preference): Sunday or Monday as chips, kept on this device. Until
 * it is changed the region's day is the one picked. The chip shows the fact, so the row has no
 * description. Every week and month follows at once.
 */
export function WeekStartsRow() {
  useWeekStarts((s) => s.day)
  const day = firstDayOfWeek()
  return (
    <FieldRow size={useRowSize()} label="Week starts">
      <FilterChipGroup label="Week starts" value={day === 0 || day === 1 ? String(day) : undefined} onValueChange={(v) => setWeekStarts(v === "1" ? 1 : 0)}>
        <FilterChip value="0">{dayName(0)}</FilterChip>
        <FilterChip value="1">{dayName(1)}</FilterChip>
      </FilterChipGroup>
    </FieldRow>
  )
}
