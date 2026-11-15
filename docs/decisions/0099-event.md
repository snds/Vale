# ADR-0099 · The event, the event form, and quick add in the form's title

- **Status:** Accepted for the build. **Two choices are proposals for Sean,** cited from the undrawn-areas design: Q2 (an event opened from the Week or the Month on a desktop is a review dialog) and Q5 (quick add moves into the new event's title). Delete asks first, as DC10 says (recorded as a proposal in [ADR-0087](0087-forms-and-questions.md)).
- **Date:** 2026-11-14
- **Builds on:** [ADR-0083](0083-shell.md) (the frame's columns, `usePushedChrome`), [ADR-0086](0086-status.md) (`lib/copy.ts`), [ADR-0087](0087-forms-and-questions.md) (the form layer, the leave guard, `useConfirm`), [ADR-0088](0088-date-parts.md) (`DatePicker`, `ZonePicker`, the swatches), [ADR-0089](0089-writing-parts.md) (the recipient field), [ADR-0098](0098-calendar-views.md) (the views and where an event opens).
- **Design:** briefs C2, C3 and C4 of the undrawn-areas design, as Desktop / 07 (Calendar — Event), Mobile / 09 (Calendar — Event), Desktop / 08 and Mobile / 10 (Calendar — New event) draw them.

The event pane was a column of icon rows with the call's controls in a strip, and its delete ran at once with no way back. The form was a list of label-and-select rows. Figma draws the event as a page head over Field Rows with EDIT and DELETE, and the form as six fields in Text Field boxes. The code holds much more than the frames draw: the call's ID, passcode and numbers, a booking tool's links, guests and their answers, travel, another time zone, a link, notes linked to the event, repeat scopes, alerts, the calendar, and find a time. Briefs C2 and C3 keep all of it, in the frames' parts and order.

## Decisions

### The event (`event-detail.tsx`, `meeting-panel.tsx`, `join-button.tsx`, `meeting.ts`)

- **Where it opens** (Q2). Upcoming and the Day's cards on a desktop: the detail column, as Desktop / 07. The Week, the Month and the Day's hours on a desktop: `EventReview`, a unicron `Dialog` of the review size (560), in place of ADR-0098's peek. A phone and medium width: a pushed screen. The content is the same in all three. `EventDetailPane` keeps its props (`eventId`, `start`, `calendars`, `onDeleted`), so search can open it.
- **Order** (brief C2): `AppFramePageHead` with `EVENT // THU 11.12` and the title ("(no title)" when empty); the call; the Field Rows that have a value; GUESTS; NOTES; the linked notes (notes-settings' `LinkedNotes`, imported); EDIT and DELETE.
- **The call** (`MeetingPanel`): JOIN, the one primary (it opens the service's app when Settings › Calendar says so), and the text action OPEN IN BROWSER beside it when JOIN opens an app. Then Field Rows VIDEO CALL, MEETING ID and PASSCODE with COPY, and CALL IN (one row a number, its place as the description, CALL as a `tel:` link). COPY goes through `lib/copy.ts`: "Copied" in its place for 2 s, no toast. A booking tool's event adds BOOKING, "Booked with Calendly", with RESCHEDULE and CANCEL BOOKING. `MeetingPanel` keeps its props for mail's invitation card and adds an optional `join`.
- **Field Rows,** each only with a value: WHEN (`12:30 – 13:30`, "All day", or the days a span covers, by the clock as the frames write it); REPEATS; WHERE with MAP; TRAVEL (`20 min // leave by 11:40`); TIME ZONE (`New York time: 15:00 – 16:00 EST`, only when it is not yours); ALERT (the alerts, joined); CALENDAR (its 8 px swatch square, the name, the account after `//` in label ink, or `// not synced`); LINK (cut in the middle, OPEN). Default size from medium up, stacked on a phone.
- **MAP** is a map search for the place in the browser, on OpenStreetMap (no account, any device). It is left out where the place is the call ("Microsoft Teams Meeting", a link).
- **GUESTS** with a count: unicron `ListRow`s, compact, with an Initial Tile S, the name, an ORGANIZER badge, and the answer as the row's status (GOING, MAYBE, NOT GOING, NO REPLY).
- **EDIT and DELETE** are secondary buttons, as drawn. A repeating event's EDIT is an `AdaptiveMenu` (a menu, a sheet on a phone): This event, This and following, All events. **DELETE asks** (DC10) with `useConfirm`: "Delete {title}?" and DELETE; a series adds three `RadioRow`s: "This event" ("Only Thu 11.12."), "This and following" ("Thu 11.12 and every one after it."), "All events" ("The whole series."). Focus starts on Cancel. After the delete the pane or dialog closes with the toast "Deleted {title}".
- **In the dialog** EDIT and DELETE stand at the left of the footer, JOIN at its right. EDIT closes the dialog before the form opens, so one layer stands at a time.
- **A read-only calendar:** no EDIT or DELETE; one caption with a lock, "{Calendar} is read-only."
- **A phone** (Mobile / 09): the top bar holds Edit and Delete as float buttons (Edit a menu for a series); the detail bottom row's start is the place button (the map search), its end the one primary, Join call (`video`), when there is a call. JOIN then does not stand in the content too; OPEN IN BROWSER does. `useJoin` (in `meeting.ts`) gives the float button the same destination as the JOIN link.
- **States:** loading is a title bar and three lines (`Skeleton`, sized by plain boxes); a gone event is `EmptyState` "That event is gone."; nothing open stays the frame's `CALENDAR` · "Nothing open." · "Pick an event to see it here."; a birthday still opens the person.

### The form (`event-editor.tsx`, `find-a-time.tsx`)

- **The layer** is ADR-0087's: a 640 dialog on a desktop, the whole screen on a phone. Header `NEW EVENT // PERSONAL` or `EDIT EVENT // WORK`, then the title as typed. Footer CANCEL and SAVE EVENT; on a phone the top row's checkmark, named "Save event".
- **Fields, in order:** TITLE (`TextField`, first focus); the All day `ToggleRow` ("Shows across the top of each day.", as drawn); STARTS and ENDS; FIND A TIME; LOCATION; INVITE; a `SectionHeader` MORE; REPEAT, ALERT, CALENDAR, TRAVEL and TIME ZONE as Field Rows; NOTES (a multi-line `TextField` of four lines).
- **STARTS and ENDS** are each a date field and a time field. The date field is a read-only `TextField` showing `Thu 11.12`, whose trailing calendar button (named "Start date, Thursday, November 12, 2026") and the box itself open ADR-0088's `DatePicker`; the time field is the platform's time input in a `TextField`. A desktop sets the four on one line, a phone STARTS over ENDS; the choice reads the frame's width class, not a media query. Moving the start keeps the length.
- **FIND A TIME** (under ENDS; not for all day, not as a guest): free slots over two weeks as a single-choice `FilterChipGroup` named "Free times" ("Thu 11.12 13:00"); picking one sets both times. None: "No free time like that in the next two weeks." A failed search is one critical line beside it, not a toast.
- **LOCATION:** ADD VIDEO CALL in the trailing slot (a Jitsi room, as before); when a call link is in the place or the notes, the helper "Zoom call. Join shows on the event."
- **INVITE** is ADR-0089's recipient field with one of three real helpers under it: "Your calendar server sends the invitations.", "Invitations go out from {account} when you save.", "Invitations need a calendar on a mail account."
- **MORE** (Field Rows with the hairline under each): REPEAT with CHANGE (an `AdaptiveMenu` radio group; "Custom (kept as is)" for a rule Vale does not edit); ALERT with a `Chip` per alert, each with remove, and ADD (`REMINDER_PRESETS`); CALENDAR with its swatch square and CHANGE (grouped by account, writable calendars only); TRAVEL with CHANGE (none, 5 to 120 minutes) and, once set, "Blocked before it starts. You get a "time to leave" alert at 11:40."; TIME ZONE `Yours // Los Angeles (PST)` with CHANGE (ADR-0088's `ZonePicker`) and, once different, "That is Thu 11.12, 12:00 – 13:00 your time." Five or more choices open a menu, as decisions §5 says.
- **Notices:** one compact info `Banner` at the top. One event of a series: "Changes apply to this event only." (REPEAT, CALENDAR and INVITE are hidden); "Changes apply to this and following events."; "Changes apply to every event in this series." Someone else's event: "{Name} organizes this event. Your changes stay on your calendar." (INVITE hidden).
- **Errors:** no title is the TITLE field's error, "Give the event a title."; no calendar to write to is a compact critical banner, "No calendar you can write to.", with OPEN ACCOUNTS; the server's refusal is the form layer's compact critical banner, in its words.
- **Toasts:** "Added {title}", "Updated {title}". Closing with changes asks (ADR-0087).

### Quick add (`event-editor.tsx`, `quick-add.ts`, `calendar-nav.tsx`, `quick-add-field.tsx`) (Q5)

- In a new event's TITLE, while `parseQuickAdd` finds a date or a time, the helper says what it read, "Lunch with Ana // Tomorrow 13:00 // Bricks Cafe", with the text action USE THIS. USE THIS fills STARTS, ENDS (and All day) and LOCATION and trims the title to "Lunch with Ana". Reading stops once a time is changed by hand (a field, the date picker, or a free time).
- Enter in a one-line field does not save; ⌘ or Ctrl + Enter does.
- The separate Quick add field leaves the calendars list (ADR-0098 had moved it there). The menu-bar window keeps its own field and one-step add (brief C8).

### Ratchet

- `className` on unicron parts **114 → 105** (the old pane's and form's rows, selects and the meeting strip's buttons). Style 1, spread 0, plain `<button>`s 9: unchanged. Look-alikes by the estimator: 0 (the review dialog's component is `EventReview`, not a name in unicron's families). `.dsa/baseline.json` is lowered.

## Verification

- `tsc -b`, `oxlint` (no warnings), `pnpm --filter web build:demo`, `pnpm build`, the notes-relay tests: pass (the lane's `check.sh`). The ratchet, counted by reading the source: 105 / 1 / 0 / 9.
- `pnpm shots -g calendar-event -g calendar-find -g calendar-quick -g calendar-delete`, phone 390 × 844 and desktop 1440 × 900 in graphite and stone, and `--size medium -g calendar-event`. Kept names: `calendar-event`, `calendar-event-new`, `calendar-find-time`, `calendar-quick-add`. New: `calendar-event-dialog`, `calendar-event-call` (scenario `event-call`), `calendar-event-readonly`, `calendar-event-edit-series`, `calendar-delete-series`, `calendar-delete-one`.
- They assert: the drawn rows and no empty ones; on a phone Edit and Delete in the top bar and the place button below; an event with a call shows every row (VIDEO CALL, MEETING ID and PASSCODE with COPY, CALL IN with CALL, WHEN, WHERE, TRAVEL, TIME ZONE, ALERT, CALENDAR, GUESTS 03 with ORGANIZER and three answers), one JOIN with OPEN IN BROWSER on a desktop and Join call on a phone; COPY says "Copied" and raises no toast; the review dialog is 560 wide with EDIT, DELETE, JOIN in its footer; a read-only event offers neither; editing one event of a series shows the notice and hides REPEAT, CALENDAR and INVITE; deleting a series asks with three scopes, the first picked, focus on Cancel; deleting closes the pane with "Deleted Lunch with Ana"; the form's parts and its four time fields on one line on a desktop; Enter in TITLE does not save and an empty title says so; FIND A TIME's chips set the start; USE THIS fills the times, the day and the place and trims the title, and reading stops after a time is changed by hand.
- Compared by eye with Desktop / 07, Mobile / 09, Desktop / 08 and Mobile / 10, graphite and stone.

## Consequences

- The `calendar-calendars` scene now asserts that Quick add is not in the calendars list.
- Mail's invitation card shows the call as Field Rows too, through `MeetingPanel`.
- `colors.ts` is unused by the event now; the menu-bar window still reads it.
