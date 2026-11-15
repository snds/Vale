import { useState } from "react"

import {
  AdaptiveDialog,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverline,
  DialogTitle,
  AdaptiveMenu,
  AdaptiveMenuRadioGroup,
  AdaptiveMenuRadioItem,
  Button,
  FieldRow,
  FieldRowAction,
  FieldRowValue,
  SectionHeader,
  Skeleton,
  ToggleRow,
  useAdaptiveSheet,
} from "@unicron/ui"
import { useInterestingCalendars, usePimAction } from "@/core/queries"
import type { InterestingCalendar } from "@/core/types"

import { closeAddCalendars, useAddCalendars } from "./open-add-calendars"

/** The country this device's language points at ("en-GB" → GB), if any. */
const homeCountry = () => {
  try {
    return new Intl.Locale(navigator.language).maximize().region ?? null
  } catch {
    return null
  }
}

/** "the Netherlands" → "Netherlands": a region's name as a value, not inside a sentence. */
const asValue = (name: string) => name.replace(/^the /, "").replace(/^./, (x) => x.toUpperCase())
/** "DE" → "Germany", in the device's language. */
const countryName = (code: string) => {
  try {
    return new Intl.DisplayNames([navigator.language], { type: "region" }).of(code) ?? code
  } catch {
    return code
  }
}
const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

/**
 * Add calendars (ADR-0024; brief C5): holidays by country and region, and
 * the moon's phases, worked out on this device. Nothing to sign in to, no
 * feed to fetch. The form layer's size, with no primary: each change saves at
 * once, and DONE closes it. Your own country comes first.
 *
 * A change that fails puts the switch or the region back and says why on one
 * critical line under the row, in the core's words (decisions §9).
 */
export function AddCalendarsDialog() {
  // Opened by its intent (ADR-0084): the calendars list's "Add calendars", and the command menu.
  const open = useAddCalendars((s) => s.open)
  const sheet = useAdaptiveSheet()
  const caption = "Worked out on this device. Nothing is fetched."
  const done = (
    <Button variant="secondary" onClick={closeAddCalendars}>
      Done
    </Button>
  )
  if (sheet)
    return (
      <AdaptiveDialog open={open} onOpenChange={(o) => !o && closeAddCalendars()} height="full" overline="Calendars" title="Add calendars" description={caption} footer={done}>
        {open && <Catalog />}
      </AdaptiveDialog>
    )
  // A desktop's dialog keeps DONE in view under the long list of countries (AdaptiveDialog's footer scrolls away).
  return (
    <Dialog open={open} onOpenChange={(o) => !o && closeAddCalendars()}>
      <DialogContent size="form">
        <DialogHeader>
          <DialogOverline>Calendars</DialogOverline>
          <DialogTitle>Add calendars</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="flex flex-col gap-6 pb-4">
            <DialogDescription size="body">{caption}</DialogDescription>
            {open && <Catalog />}
          </div>
        </DialogBody>
        <DialogFooter sticky>{done}</DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Catalog() {
  const { data: all = [], isPending } = useInterestingCalendars()
  const home = homeCountry()
  const holidays = all.filter((c) => c.group === "holidays").sort((a, b) => Number(b.country === home) - Number(a.country === home))
  const sky = all.filter((c) => c.group === "sky")
  return (
    <div className="flex flex-col gap-8" data-slot="add-calendars">
      <section aria-labelledby="add-calendars-holidays" className="flex flex-col gap-2">
        <SectionHeader id="add-calendars-holidays" title="Holidays" level={3} />
        {/* Sized by a plain box: the library owns the bar's look. */}
        {isPending &&
          [0, 1, 2].map((i) => (
            <div key={i} className="grid h-12">
              <Skeleton />
            </div>
          ))}
        <div className="flex flex-col">
          {holidays.map((c) => (
            <Calendar key={c.id} calendar={c} home={c.country !== null && c.country === home} />
          ))}
        </div>
      </section>
      <section aria-labelledby="add-calendars-sky" className="flex flex-col gap-2">
        <SectionHeader id="add-calendars-sky" title="Sky" level={3} />
        <div className="flex flex-col">
          {sky.map((c) => (
            <Calendar key={c.id} calendar={c} />
          ))}
        </div>
      </section>
    </div>
  )
}

/** One calendar's switch; under a country that is on and has regions, its REGION row. */
function Calendar({ calendar: c, home = false }: { calendar: InterestingCalendar; home?: boolean }) {
  const add = usePimAction((core, id: string) => core.addInterestingCalendar(id))
  const remove = usePimAction((core, id: string) => core.removeInterestingCalendar(id))
  const setRegion = usePimAction((core, a: { id: string; region: string | null }) => core.setHolidayRegion(a.id, a.region))
  const [error, setError] = useState<string | null>(null)
  const [regionError, setRegionError] = useState<string | null>(null)
  // The switch shows the change at once; a failure puts it back.
  const [pending, setPending] = useState<boolean | null>(null)
  const on = pending ?? c.subscribed
  const turn = (next: boolean) => {
    setError(null)
    setPending(next)
    ;(next ? add : remove).mutate(c.id, {
      onError: (e) => setError(message(e)),
      onSettled: () => setPending(null),
    })
  }
  const pick = (value: string) => {
    setRegionError(null)
    setRegion.mutate({ id: c.id, region: value || null }, { onError: (e) => setRegionError(message(e)) })
  }
  const region = c.regions.find((r) => r.code === c.region)
  return (
    <div className="flex flex-col">
      {/* Renamed for its region ("Holidays in Bavaria"): the country stays in view, so the list still reads. */}
      <ToggleRow label={c.name} description={[home ? "Your country" : null, c.region && c.country ? countryName(c.country) : null].filter(Boolean).join(" · ") || undefined} checked={on} onCheckedChange={turn} />
      {error && (
        <p className="type-caption text-critical-text pb-2" role="alert">
          {error}
        </p>
      )}
      {/* Regional days only once the country is on, so the list stays short. */}
      {c.subscribed && c.regions.length > 0 && (
        <FieldRow
          label="Region"
          action={
            <AdaptiveMenu title={`Region for ${c.name}`} height="full" align="end" trigger={<FieldRowAction aria-label={`Change region for ${c.name}`}>Change</FieldRowAction>}>
              <AdaptiveMenuRadioGroup value={c.region ?? ""} onValueChange={pick}>
                <AdaptiveMenuRadioItem value="">Nationwide only</AdaptiveMenuRadioItem>
                {c.regions.map((r) => (
                  <AdaptiveMenuRadioItem key={r.code} value={r.code}>
                    {asValue(r.name)}
                  </AdaptiveMenuRadioItem>
                ))}
              </AdaptiveMenuRadioGroup>
            </AdaptiveMenu>
          }
        >
          {/* A name, not an address: cut at its end. */}
          <FieldRowValue truncate="end">{region ? asValue(region.name) : "Nationwide only"}</FieldRowValue>
        </FieldRow>
      )}
      {regionError && (
        <p className="type-caption text-critical-text pb-2" role="alert">
          {regionError}
        </p>
      )}
    </div>
  )
}
