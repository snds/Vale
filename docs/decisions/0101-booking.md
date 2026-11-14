# ADR-0101 · Booking links and the public booking pages on unicron's parts

- **Status:** Accepted for the build. It builds on one recorded proposal for Sean, DC7 (Tasks and Booking links are places of Calendar), recorded in [ADR-0084](0084-places.md); the brief's pick stands until he answers (Q13).
- **Date:** 2026-11-14
- **Builds on:** [ADR-0026](0026-scheduling-links.md) (scheduling links and their public page), [ADR-0031](0031-change-a-booking.md) (the booker's own page to move or cancel), [ADR-0084](0084-places.md) (Booking links as a place), [ADR-0086](0086-status.md) (`lib/copy.ts`), [ADR-0087](0087-forms-and-questions.md) (the form layer, the leave guard, `useConfirm`), [ADR-0100](0100-calendar-extras.md) (Tasks, the place beside it).
- **Design:** brief C7 of the undrawn-areas design. Figma draws none of these screens.

Booking links still wore the old look. On the owner's side they were small rows in a panel, a dialog of labels and plain inputs, a preview with a grey line of text over it, and "Link copied" toasts. The public pages drew their own heads, rounded grey cards, outline buttons for every time and a two-step "Yes, cancel it" inline. The brief moves both onto unicron's parts and Vale's patterns, keeping every rule of ADR-0026 and ADR-0031.

## Decisions

### The owner's side (`booking-links.tsx`, `booking-store.ts`; hosted by `index.tsx`)

- **The list** (Booking links is a place, ADR-0084): page head overline `BOOKING LINKS // 02` (two digits), title "Booking links", and one head action, the text button NEW LINK. Each link is a `ListRow layout="inline"`: its title over the mono line `30 MIN // WEEKDAYS // 09:00 – 17:00` (or `EVERY DAY`; lengths of an hour or more read `1 H`, `1 H 30 MIN`). Pressing a row opens the link.
- **States:** loading is two rows of two skeleton bars; none is `BOOKING LINKS // 00` · "No booking links." · "Create one and send it to someone." with NEW LINK; a failed read with nothing to show is the critical empty state with TRY AGAIN; the empty detail column says "Pick a booking link to see it here."
- **The link** stands in the detail column on a desktop and is pushed at medium width and on a phone. Page head `BOOKING LINK // 30 MIN` and its title, then Field Rows: LINK (the page's address, cut in the middle, with COPY LINK through `useCopy`, which says "Copied" for 2 s and raises no toast), LENGTH, HOURS (with "Weekdays only" or "Every day, weekends too" under it), DAYS AHEAD, CALENDAR (its swatch square and name) and NOTE. Then PREVIEW, EDIT and DELETE as secondary buttons. A phone has EDIT and MORE (PREVIEW, DELETE) in its top bar instead; the rows stack.
- **Where a link can be shared** (ADR-0026, kept): only a gateway has an address other people can reach. Elsewhere COPY LINK stays in the row, disabled with its reason as a visible line: "Only a gateway can share a page. Preview shows it here." The desktop and phone apps show the place as `EmptyState` "Booking pages need the gateway." · "Set them up where your gateway runs.", with no NEW LINK.
- **DELETE asks** (brief X6: the page's address can't be brought back, so it cannot be undone): "Delete this link?" · "Its page stops working now." · DELETE, focus on CANCEL. Done: the toast "Deleted {title}".
- **The form** is on the form layer (ADR-0087): overline NEW BOOKING LINK or EDIT BOOKING LINK, the title as typed. One line ("People pick one of your free times, and it lands in your calendar. Nothing else about your calendar shows."), then TITLE; LENGTH as a Field Row with CHANGE opening a radio menu (five lengths, so a menu, decisions §5); FROM and TO as time fields (an end before the start is TO's error); the `ToggleRow` "Weekdays only"; DAYS AHEAD as single-choice chips (3, 7 or 14 days: three short choices, so chips); CALENDAR as a Field Row with CHANGE and the helper "A calendar on a mail account also emails the booker."; NOTE, optional. CREATE LINK or SAVE. A failed save stays open with the core's words in the layer's critical banner. Leaving with changes asks "Discard changes?". Done: "Created {title}" or "Saved {title}", and the link opens.
- **The preview** is `AdaptiveDialog` at the viewer size (960; a full-height sheet on a phone, and the whole screen where 960 does not fit), overline PREVIEW and the link's title. A compact info `Banner` "Preview: what visitors see. Booking here adds a real event." stands above the real page, whose button reads BOOK (PREVIEW). On the booked screen, CHANGE OR CANCEL offers SEE THEIR PAGE, which opens the booker's page in place (ADR-0031).
- What is open (the link, the form, the preview) lives in one small store, `booking-store.ts`, so the list, the pane and the phone's top bar ask for the same things. Leaving the place closes them.

### The visitor's page (`features/booking/page.tsx`, `/book/<token>`)

- It renders its own `AppFrame` with `AppFrameFocus` (432, the App Lockup at the top), in Vale's theme following the visitor's system setting, with no account. App.tsx keeps its wrapper and its `Toaster`; the page raises no toast.
- `PageHead` overline `BOOK // 30 MIN`, the link's title; "With {host}" and the owner's note.
- `SectionHeader` FREE TIMES, the caption "Times are in your time zone (PST)." (the visitor's own zone, short), then **one** single-choice `FilterChipGroup` across all days: a mono day label (`THU 11.12`) over each day's times (`11:30`). The arrow keys run through every time; each time's name says its day in full ("Thursday, November 12, 11:30 – 12:00"). Days stand 16 apart, times 8.
- `SectionHeader` YOUR DETAILS: NAME, EMAIL and NOTE ("Optional."). The core's answer about a name or an email shows as that field's error; anything else as a compact critical banner.
- One primary BOOK, full width on a phone. Until a time is picked it is disabled with the visible reason "Pick a time first." and stays in the tab order (#37).
- **Booked:** `BOOKED`, "You're booked.", "{title} with {host}", the time (`Thu 11.12 // 11:30 – 12:00`), then "A calendar invitation is on its way to your email." when the core sent one, or "It's in {host}'s calendar. They'll be in touch if anything changes." Then the Field Row CHANGE OR CANCEL with the private link (cut in the middle) and COPY LINK, captioned "Keep it. It's only for you."

### The change page (`/book/<token>/b/<code>`)

- The same frame. `PageHead` overline `BOOKING`, the title, "With {host}". Field Rows WHEN (the time, "In your time zone (PST)") and BOOKED BY.
- PICK A NEW TIME (secondary) shows `SectionHeader` NEW TIMES with the same chip group, a primary MOVE (disabled with "Pick a time first." until one is picked) and KEEP THE CURRENT TIME. Moved: a compact success banner "Moved to {time}." and WHEN changes.
- CANCEL BOOKING (a text button) asks through `useConfirm`: "Cancel this booking?" · "{host} will see it's off their calendar." · CANCEL BOOKING, with focus on KEEP IT.

### Every state of the brief's table, on both pages

| State | Shows |
|---|---|
| Loading | chip-sized skeleton bars; "Loading free times…" (or "Loading your booking…") in a polite status for a screen reader |
| The link is off or wrong | `EmptyState tone="critical"` "This link isn't active." · "Ask whoever sent it for a new one." (one answer for an unknown link, a deleted one and a wrong code, as the gateway gives) |
| No free times | `EmptyState` `FREE TIMES // 00` · "No free times right now." · "Check back later, or reply to whoever sent the link."; no BOOK |
| The time was just taken | a compact critical banner "That time was just taken. Pick another." above the times, which load again without it; the page scrolls them into view and no time stays picked |
| Canceled | "This booking is canceled." and WAS with the time it was; no actions |
| Already started | "This booking has started, so it can't be changed here." |
| Moved five times | PICK A NEW TIME disabled with the reason "It has moved as often as it can. Write to {host}."; CANCEL BOOKING still works |

### Kept from ADR-0026 and ADR-0031

The page reads only the link's free times and writes one booking; times in the visitor's zone and named; no Copy where there is no public address; Preview everywhere, with the warning; editing keeps the address and deleting stops the page at once; the private code opens one booking only; five moves at most; no change after it starts; the owner's preview opens the booker's page in place. No core, gateway or route changed.

## Verification

- `tsc -b`, `oxlint` (no warnings), `pnpm --filter web build:demo`, `pnpm build`, the notes-relay tests: pass (the lane's `check.sh`). The ratchet, counted by reading the source: className **98 → 90**, style 1, spread 0, raw buttons 9. `.dsa/baseline.json` is lowered. Look-alikes by the estimator: 0.
- `pnpm shots -g booking -g places-booking`, phone 390 × 844 and desktop 1440 × 900 in graphite and stone, with medium for the list and the link, and `--size medium -g booking`. Kept names: `places-booking-links`, `calendar-booking-link`, `calendar-booking-page`. New: `booking-link-form`, `booking-preview`, `booking-flow`, `booking-booked`, `booking-change`, `booking-change-new-times`, `booking-link-off`, `booking-no-times`, `booking-just-taken`, `booking-loading`, `booking-canceled`, `booking-started`, `booking-moved-out`, `booking-desktop-app`.
- Demo scenarios added in `core/demo-scenarios/calendar.ts`: `booking-links` (two links through the demo's own save, as the gateway's owner, at fixed addresses), `booking-booked`, `booking-canceled`, `booking-moved-out`, `booking-started`, `booking-no-times`, `booking-just-taken` (someone else books the picked time first, through the demo's own booking), `booking-loading` and `booking-desktop`.
- They assert: the head reads `BOOKING LINKS // 02` and Booking links is the one current place; the rows' mono line; the link's six rows, the address in LINK and COPY LINK on a gateway; EDIT and MORE in a phone's top bar, PREVIEW, EDIT and DELETE elsewhere; the form through the form layer's checks (its parts, Esc, "Discard changes?", Ctrl+Enter) with its rows, Weekdays only on and 7 days picked; the preview's banner, BOOK (PREVIEW) and 960 on a desktop; a link created from the empty state, previewed, booked, moved through SEE THEIR PAGE (WHEN changes), and canceled, with the question's focus on KEEP IT; the visitor's column at 432 (the screen's width on a phone), its head, the zone line, one chip group, the three fields and one BOOK; booked with COPY LINK and the warning; the change page's rows and actions; a just-taken answer showing the banner and reloading without that time; the off link, no times, loading, canceled, started, moved out, and the desktop app's empty state.
- Looked at each picture by eye in both grounds; there are no frames to compare with.

## Consequences

- `index.tsx` hosts the place: the head's overline and NEW LINK, the link in the detail column, "Pick a booking link to see it here.", and Back and the section's root close the open link.
- The old look's "Link copied" and "Updated" toasts with full stops are gone; the toasts name the link.
- In the demo the host is the core's "Me", so the pages read "With Me" and "It's in Me's calendar." A gateway names the owner.
