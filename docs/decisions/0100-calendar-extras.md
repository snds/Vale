# ADR-0100 · Calendars and sets, reminders and Missed, Tasks, and the menu-bar calendar

- **Status:** Accepted for the build. It builds on one recorded proposal for Sean, DC7 (sets join the calendars list; Tasks and Booking links are places), recorded in [ADR-0084](0084-places.md); the brief's pick stands until he answers (Q13).
- **Date:** 2026-11-14
- **Builds on:** [ADR-0021](0021-calendar-planning.md) (calendar sets), [ADR-0024](0024-interesting-calendars.md) (holidays and the moon, worked out on the device), [ADR-0028](0028-tasks-on-the-calendar.md) (tasks from notes), [ADR-0029](0029-travel-and-time-zones.md) (time to leave), [ADR-0039](0039-note-reminders.md) (a note's reminder), [ADR-0054](0054-menu-bar-calendar.md) (the menu-bar window), [ADR-0084](0084-places.md) (the calendars list, Tasks as a place, `openAddCalendars()`), [ADR-0086](0086-status.md) (toasts, `missed-reminders.ts`, `openMissed()`), [ADR-0087](0087-forms-and-questions.md) (the form layer, the leave guard), [ADR-0088](0088-date-parts.md) (the month grid, `DatePicker`, the swatches), [ADR-0098](0098-calendar-views.md) (`OccurrenceCard` in the views), [ADR-0099](0099-event.md) (the date field, quick add).
- **Design:** briefs C5, X5, C6 and C8 of the undrawn-areas design. Figma draws none of these screens.

Four corners of the calendar still wore the old look. Add calendars was a dialog of labels and selects with a toast for every switch. Save as set was a question-size dialog, and deleting a set could not be taken back. Reminders said the same things in two shapes, and a missed event's toast offered "Dismiss", which did nothing else. Tasks was a panel of small rows with an icon button and a dialog of plain inputs. The menu-bar window drew its own cards with a dot of the calendar's raw color. The briefs move each onto unicron's parts and the patterns the rest of Vale now uses, keeping every feature.

## Decisions

### Calendars and sets (`calendar-nav.tsx`, `use-sets.ts`, `calendar-sets.tsx`, `interesting.tsx`)

- **Showing and hiding** stays f3's checkbox `NavItem` per calendar with its swatch (ADR-0084).
- **Picking a set** shows exactly its calendars and toasts "Showing {set}".
- **Deleting a set** toasts "Deleted {set}" with UNDO (brief X6: the code can undo it, so it does not ask). The core saves "what shows now" under a name, so UNDO shows the set's own calendars for the save, saves it, and puts back what showed before. What shows does not change.
- **Save as set** is a form on the form layer (ADR-0087): `NEW SET`, the name as typed, one line ("The calendars showing now, under one name. Picking the set shows exactly those again."), SET NAME, then SAVE SET; Esc with a name typed asks "Discard changes?". A failed save is the layer's critical banner, in the core's words. Saved: "Saved {set}".
- **Add calendars** (`openAddCalendars()`): the form size on a desktop (a 640 dialog whose DONE stays pinned under the long list), a full-height sheet on a phone. Overline CALENDARS, title "Add calendars", the caption "Worked out on this device. Nothing is fetched." `SectionHeader` HOLIDAYS: a `ToggleRow` per country, your own first, described "Your country". Under a country that is on and has regions, a Field Row REGION with "Nationwide only" or the region, and CHANGE opening an `AdaptiveMenu` of radios. A country renamed for its region ("Holidays in Bavaria") keeps the country as its description. `SectionHeader` SKY: "Moon phases". **No primary**; DONE is a secondary; each change saves at once and silently. A change that fails puts the switch back and shows one critical line under the row in the core's words (decisions §9).
- **A calendar that did not sync:** its rows say so in the critical tone (ADR-0098). The account's overline in `critical-text` waits on unicron (`NavSection` has no tone).

### Reminders (`reminder-watcher.tsx`, `missed-reminders.ts`, `missed-list.tsx`)

| Kind | Toast title | Line | Action | Time |
|---|---|---|---|---|
| Event alert | the event's title | "In 30 min · 16:30 · {place}" | OPEN | 15 s |
| Time to leave | "Time to leave: {title}" | "Starts in 30 min · 16:30 · {place}" | OPEN | 15 s |
| A note's reminder | the note's title | "From your notes" | OPEN | 15 s |
| Missed, one | "Missed: {title}" | "Started 12 min ago · 16:30" | OPEN | until closed |
| Missed, two or more | "{N} reminders came due while Vale was closed" | — | SEE | until SEE or closed |

- Due reminders are the one stated exception to the toast times (cross-app decisions §1): they are timed, so they show for 15 s. OPEN jumps to the event or the note (`jumpTo`). A missed event's toast now offers OPEN, not "Dismiss".
- The line counts from when the alert fires to the start, as the alert was set; a missed one counts from now ("Started 12 min ago", "Starts in 14 min").
- **Missed** (SEE, and `openMissed()` for a7's command menu): a question-size dialog on a desktop, a sheet on a phone, overline `REMINDERS // 02`, title "Missed". Each event is its `OccurrenceCard` (its hours, its calendar's swatch on the bar) with when it was due in the place's line; a note's reminder, or an event that can no longer be read, is a compact `ListRow`. Pressing one opens it and closes the list. The list stays for the session in `missed-reminders.ts`, which now also holds the shared words (`reminderTitle`, `whenLine`).
- The desktop shell's system notification is unchanged.

### Tasks (`tasks.tsx`, `planning.ts`; hosted by `index.tsx`)

- **The list** (Tasks is a place, ADR-0084): page head overline `TASKS // 03` (the open items, two digits), title "Tasks". Rows are `ListRow layout="inline"` with a leading `Checkbox` ("Done: {words}"), the task's words as the title, a mono line with the note's title and, once planned, `PLANNED THU 11.12 16:30` as a link that opens the event, and a trailing text button PLAN or PLAN AGAIN. A long list shows five rows and SHOW ALL. Checking a row ticks the item in its note: "Done: {words}" with UNDO.
- **States:** loading is three rows of two skeleton bars; nothing is `TASKS // 00` · "No tasks." · "Checklist items in your notes show up here."; a failed read with nothing to show is the critical empty state with TRY AGAIN. An empty detail column says "Plan a task to block time for it here."
- **Plan** is a form, in the detail column on a desktop (`TaskPlanPane`) and on the form layer on a phone and at medium width. Overline `PLAN // {NOTE TITLE}`, the task's words as the title, "Block time for it. The task stays in its note." Then DAY (ADR-0099's date field over ADR-0088's `DatePicker`), STARTS and ENDS (time fields; an end before the start is ENDS' error), FIND A FREE TIME, and CALENDAR as a Field Row with its swatch square and CHANGE. FIND A FREE TIME lists free slots of the plan's length between 8 AM and 8 PM as single-choice chips; none: "Nothing free soon between 8 AM and 8 PM."; a failed search is one critical line. PLAN is the one primary; OPEN NOTE a secondary; CANCEL a text button in the pane. ⌘ or Ctrl + Enter plans. Done: "Planned {words}" with SHOW, and the event links back from its note as before.
- **Leaving a changed plan asks** (brief X6): in the pane through the leave guard (a place change, a jump, another row's PLAN, the planned link, Esc, CANCEL), on the layer as the layer does, and OPEN NOTE asks there too. The task being planned is the selected row, with `aria-current` on the row.
- Length is no longer a separate select: STARTS and ENDS say it, as the event form does.

### The menu-bar calendar (`mini-calendar.tsx`, `quick-add-field.tsx`, `styles/calendar.css`)

- 320 wide, no shell, `surface-ground`, one hairline frame (`.mini-calendar`; a wider browser shows it as a centred column). Top line: today's date in `type-subtitle` ("November 12") and the icon button "Open Vale".
- `SectionHeader` NEXT UP: one `OccurrenceCard` in the next look with "Now" or "In 25 min", and JOIN, the window's one primary, when it has a call. Otherwise "Nothing else in the next 12 hours."
- ADR-0088's compact month grid, a 4 px square under busy days; pressing a day picks it.
- A `SectionHeader` for the picked day (TODAY, TOMORROW, or the date) with its count; its events as compact `OccurrenceCard`s in their calendars' swatches, each with a secondary JOIN while its call has not ended; "Nothing planned".
- Quick add (ADR-0054): one field, placeholder "Add an event, like "lunch fri 1pm"", Enter adds the event and picks its day, so it appears in the list.
- The window's two hand-built buttons (`Item` drawn as a `<button>`) and the raw-color dot are gone; `colors.ts` and the `.event-dot` rule, used only there, are deleted.

### Ratchet

- `className` on unicron parts **105 → 98** (the tasks panel's rows, buttons and selects, the holidays dialog's select). Style 1, spread 0, plain `<button>`s 9: unchanged. Look-alikes by the estimator: 0. `.dsa/baseline.json` is lowered.

## Verification

- `tsc -b`, `oxlint` (no warnings), `pnpm --filter web build:demo`, `pnpm build`, the notes-relay tests: pass (the lane's `check.sh`). The ratchet, counted by reading the source: 98 / 1 / 0 / 9.
- `pnpm shots -g calendar-calendars -g calendar-add -g calendar-set -g calendar-reminder -g calendar-missed -g calendar-plan -g places-tasks -g mini`, phone 390 × 844 and desktop 1440 × 900 in graphite and stone, medium for the sets, the plan and Tasks, and the window at 320 × 760. Kept names: `calendar-calendars`, `calendar-add-calendars`, `calendar-plan-task`, `places-tasks`, `mini-calendar`. New: `calendar-set-save`, `calendar-set-delete-undo`, `calendar-reminder-toast` (scenario `reminder-due`), `calendar-missed` (scenario `missed`), `calendar-plan-form`, `mini-calendar-window`, `mini-calendar-quick-add`. Demo scenarios added: `reminder-due`, `reminder-leave`.
- They assert: a calendar hides and shows again with the list open; Add calendars has the caption, your country first, a country that turns on and takes a region (and its name), Moon phases, DONE and no primary; a set is saved through the form layer's checks (Esc, "Discard changes?", Ctrl+Enter) and is picked; a set picked says "Showing …" and hides what it leaves out; a set deleted says "Deleted …", and UNDO brings back the same set without changing what shows; a due reminder reads "In 30 min · {time} · {place}" with OPEN and is still there after 7 s; two missed reminders make one toast, and SEE opens Missed with both as cards that say when they were due; Tasks' head reads `TASKS // NN`, Tasks is the one current place and Back returns to the calendar; checking a task removes it with "Done: …" and UNDO brings it back; the plan opens in the detail column on a desktop (PLAN the primary, OPEN NOTE, the row selected) and on the layer elsewhere, with its fields; free times are chips, another row's PLAN asks "Discard changes?", PLAN says "Planned Board games" with SHOW, the row then says PLAN AGAIN and its PLANNED link opens the event; the menu-bar window's parts, its 320 width, and quick add putting "Pick up the bikes" in tomorrow's list with tomorrow picked.
- Looked at each picture by eye in both grounds; there are no frames to compare with.

## Consequences

- The shell's `status-missed` scene still finds the Missed list by its names ("Missed", "Missed reminders").
- `DateField` is exported from `event-editor.tsx` for the plan.
- ⌘K → "Missed reminders" is a7's; it calls `openMissed()`.
