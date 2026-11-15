import { FieldRow, FieldRowAction } from "@unicron/ui"
import { ZonePicker } from "@/components/zone-picker"
import { firstDayOfWeek } from "@/features/calendar/dates"
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

/** The day a week starts on (brief T4): a fact from the device's region, the one the calendar's weeks use. No action. */
export function WeekStartsRow() {
  // Any Sunday, moved on to the week's first day, named in the device's language.
  const day = new Date(2026, 10, 15 + firstDayOfWeek()).toLocaleDateString(undefined, { weekday: "long" })
  return (
    <FieldRow size={useRowSize()} label="Week starts" description="From your device's region.">
      {day}
    </FieldRow>
  )
}
