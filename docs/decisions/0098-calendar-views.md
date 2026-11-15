# ADR-0098 · Calendar views: Upcoming, Day with the week strip, card Week, Month, and Hours on the time grid

- **Status:** Accepted for the build. **Two choices are proposals for Sean,** cited from the undrawn-areas design: Q1 (cards by default, with an Hours switch) and Q6 (a calendar's color as an edge and a square).
- **Date:** 2026-11-14
- **Builds on:** [ADR-0083](0083-shell.md) (the frame's columns, `useScreenFact`), [ADR-0084](0084-places.md) (the calendars list, `view-prefs.ts`), [ADR-0085](0085-search-place.md) (`OccurrenceCard` on unicron's `CalendarEvent`), [ADR-0086](0086-status.md) (the section banner), [ADR-0088](0088-date-parts.md) (the month grid, the swatches).
- **Design:** brief C1 of the undrawn-areas design, as Mobile / 08 (Calendar — Day) and Desktop / 06 (Calendar — Week) draw it, with the list of Desktop / 07 (Upcoming; its detail column is the event's ADR).

The calendar had four views drawn the old way: an agenda of plain buttons, a time grid of tinted chips for the day and the week, and a month of tinted chips. Figma draws a Day of cards under a week strip and a Week of card columns, with no hours. The code's time grid keeps real things the frames do not draw: travel time, a second time zone, overlaps, press to create. Brief C1 keeps both: cards by default, and one switch, Hours, that turns the Day and the Week into the time grid.

## Decisions

### Ranges and paging (`index.tsx`, `view-prefs.ts`)

- **Four ranges as chips:** UPCOMING · DAY · WEEK · MONTH, unicron's single-choice `FilterChipGroup` named "View" (the code's `agenda`, `day`, `week`, `month`). On a phone: DAY · WEEK · MONTH; Upcoming is the lower half of its Day, and a saved Upcoming opens the Day there.
- **Where the chips stand.** Week and Month on a desktop: in the page head's actions, as Desktop / 06 draws them, UPCOMING first. Upcoming and the Day's cards (the 432 px list column) and every range at medium width: the first row under the head. A phone: a row under the title, with TODAY, previous and next at its right.
- **The paging row** under the head from medium width up: TODAY (secondary S, only while today is out of view), previous, next, **Go to date** (a `calendar` icon; the shared month grid in an `AdaptivePopover`, with a square on each day that has events; it replaces the month that stood at the top of the list column), and **Hours** (unicron's `Toggle` through `IconButton`, tooltip "Hours"; Day and Week only). Upcoming has no paging; MORE at its end adds 30 days. Steps are a day, a week or a month.
- **Hours on a phone** is a `ToggleRow` in the Calendars sheet's MORE group (`calendar-nav.tsx`), and applies to the Day only.
- **Kept per device** (`view-prefs.ts`): the range and Hours. With nothing chosen, a phone opens on the Day and a desktop on the Week, as cards (Q1). Hours survives a reload.
- **The head:** overline `CALENDAR // NOVEMBER 2026` (the month in view; for a week, the month of its middle). Titles: the weekday with `11.12` as meta; "Week 46" (the ISO week of the week's Thursday, whatever day the locale starts on); "November" with `2026`; "Coming up" under `UPCOMING // 30 DAYS`.
- **The status line:** the range in mono (`NOV 08 – NOV 14`, `THU 11.12`, `NOV 01 – NOV 30`), the place as the breadcrumb (`CALENDAR // WEEK 46`).

### The views, on `OccurrenceCard` (`agenda.tsx`, `month-grid.tsx`, `time-grid.tsx`, `week-strip.tsx`)

- **Upcoming:** from today for 30 days, grouped by day under section headers (`TODAY // THURSDAY 03`), the date in each card's mono line; the open event in the detail column.
- **The Day** (phone, and the list column on a desktop): the week strip; the day's cards under `TODAY // THURSDAY`; then COMING UP, the next 30 days after the picked day with MORE.
- **The week strip** (new, app-level as contract 5.1a says): seven plain cells, a mono weekday over the date; the picked day is the `primary-fill` block, today has `edge-b` when another day is picked. A radio group: one cell in the tab order, the arrows move the pick (on into the next week), Home and End.
- **The Week as cards** (desktop): seven day columns, a mono weekday over the date in the index role, today's head on the `primary-fill` block; cards all-day first; "Nothing planned" under a free day. Under 720 px of content (measured, so the medium width follows its own room) and on a phone, the days stand as sections: `THU 12 // TODAY`, then cards.
- **The Month** on a desktop: six weeks of cells, the date in mono at the top left (today's block), up to three compact events, then a text button "+2 more" that opens that day; days outside the month in `text-faint`. On a phone: ADR-0088's grid with up to three 8 px swatch squares and the picked day's list under it.
- **Hours on: the time grid,** restyled. A day header row like the card week's, an ALL DAY row of compact events, an hour gutter in the meta role (`09:00`), one hairline an hour, 48 px an hour. Events are compact `CalendarEvent`s stretched to their length (24 px at least: `layout.ts`'s floor is now 30 minutes), title first, then the start; overlaps side by side. Now is a 2 px `primary-fill` rule across today with a square at the gutter. Travel before an event is a 1 px dashed `line-rule` box, "30 min travel" when a line fits. A second time zone adds its gutter in label ink and the header names both zones. It opens scrolled to the working day. Pressing an empty hour starts a new event on that hour (medium and desktop). On a desktop the Day's hours are one column across the full width; on a phone the grid stands under the week strip with no day header, its hours scrolling in a box of ten.
- **Where an event opens.** Upcoming and the Day's cards on a desktop: the detail column. The full-width views (Week, Month, the Day's hours): `AppFramePeek`, over the right of the content, until the event's review dialog (brief C2) replaces it. Medium and phone: a pushed screen, always.
- **Quick add** leaves the top of the calendar for the end of the calendars list (sidebar, popover and sheet), as a Text Field, until the event form reads a sentence itself (brief C4, Q5). The menu-bar window keeps its field.

### Emphasis (`card-context.ts`)

One rule for every view. `primary-soft` with the `primary-fill` bar means **selected** where a detail column stands (Upcoming and the Day on a desktop), as Desktop / 07 draws it. Where nothing can be selected (a phone's Day, the Week, the Month, the time grid) it marks **the next event** (`next-up.ts`), as Mobile / 08 and Desktop / 06 draw it. In a view that selects, the next event is a neutral card whose last line says `Next // in 1 h 18 min`. The two never look alike in one view. Every other card's bar is its calendar's swatch (Q6); the primary look keeps its own bar.

### States

- **Loading:** three skeleton cards for a day (unicron's `Skeleton`, sized by a plain box), or the empty grid with its hour lines.
- **Every calendar hidden:** `EmptyState` CALENDAR, "Every calendar is hidden.", SHOW CALENDARS, which opens the calendars where the page head is the switcher and goes to the first calendar in the sidebar where it lists them.
- **A calendar that did not sync:** ADR-0086's section banner, "{Account} calendars didn't sync", the server's words, OPEN ACCOUNTS (scenario `dav-error`). The lines at the top of the calendar are gone. `NavSection` has no tone, so the account's calendar rows take `tone="critical"` ("didn't sync") instead of its overline.

### Keys and names

- The person's keys for today, the four ranges, previous and next, as before (`aria-keyshortcuts` on the chips and TODAY).
- In the Week, the Month and the time grid the arrows move between events: up and down within a day, left and right to the nearest event of the next day that has one. Enter opens.
- Each event is named "Ferry to the cabin, 08:15 to 09:00, 30 min travel before". The Month is a grid named for its month; each cell carries its full date and its count ("Thursday, November 12, today, 3 events").
- No `md:` or `sm:` switch is left in the views rebuilt here; the frame's width class and the measured week decide.

### Ratchet

- `className` on unicron parts **117 → 114** (the agenda's, the time grid's and the month's old chips, and the calendars list's skeleton). Plain `<button>`s **14 → 9**: the week strip's cells are plain radio cells, and the buttons of the agenda (1), the time grid (1) and the desktop Month (3) are gone. Style 1, spread 0. `.dsa/baseline.json` is lowered.

## Verification

- `tsc -b`, `oxlint` (no warnings), `pnpm --filter web build:demo`, `pnpm build`, the notes-relay tests: pass (the lane's `check.sh`).
- The ratchet, counted by reading the source: 114 / 1 / 0 / 9. Look-alikes by the estimator: 0.
- `pnpm shots -g calendar`: every calendar scene at desktop 1440 × 900 and phone 390 × 844 in graphite and stone, medium 768 × 1024 for the Week, Upcoming, Go to date and the calendars list. New scenes: `calendar-week-hours`, `calendar-day-hours`, `calendar-week-phone`, `calendar-go-to-date`, `calendar-all-hidden`, `calendar-dav-error`, `calendar-loading`. They assert: TODAY hides while today shows and previous and next step by the range (Day, Week, Month); Hours survives a reload; the selected and the next event never look alike (Upcoming with an event open, the Day, the Week, the Month, the hours); pressing an empty hour opens a new event at that hour on that day; the arrows move between events; the phone's Week keeps its sections with Hours on; every calendar hidden says so and SHOW CALENDARS reaches the list.
- Compared by eye with Mobile / 08 and Desktop / 06 (graphite and stone): the week strip's picked block, the TODAY section, the next event's primary card, COMING UP; seven day columns, today's block, the chips at the right of the head.

## Consequences

- `settings-second-zone` (Settings' scene file) presses the old "View" group's Day button and expects hours; with cards the default it must turn Hours on. The lane hand-off carries the two-line change for that file's owner.
- `lib/keys.ts` still names the `calendar.agenda` key "Agenda"; the chip says Upcoming.
- The event's detail column and its review dialog are brief C2's; the full-width views open an event in a peek until then.
- `colors.ts`' `eventStyle` and `.event-dot` stay for the menu-bar window (brief C8); `.event-chip` and `.travel-band` are gone.
