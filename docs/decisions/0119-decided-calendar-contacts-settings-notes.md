# ADR-0119 · Decided changes: Calendar, booking, Contacts, Settings, Notes and first run

- **Status:** Accepted. Decided on Sean's behalf on 2026-11-16 (`rebuild-questions-decided.md`, Vale 3, 8, 20, 36, 45, 46, 48, 50, 52, 53, 54, 56, 57, 59, 60, 61, 68).
- **Date:** 2026-11-16
- **Builds on:** [ADR-0098](0098-calendar-views.md), [ADR-0099](0099-event.md), [ADR-0100](0100-calendar-extras.md), [ADR-0101](0101-booking.md), [ADR-0102](0102-contacts.md), [ADR-0103](0103-contact-edit-and-clean-up.md), [ADR-0104](0104-settings-frame.md), [ADR-0107](0107-first-run.md), [ADR-0112](0112-gateway-and-about.md), [ADR-0117](0117-theme-and-calendar-event.md).

## Decisions

### Calendar and booking

- **GUESTS (Vale 36):** the event form's INVITE is GUESTS. Code in the format bar and CC beside To stay.
- **Upcoming (Vale 45):** one list with no day headers, as Desktop / 07 draws it; each card's line carries its day. A free today says "Nothing planned today". Scene `calendar-agenda`.
- **WEEK STARTS (Vale 46, the W4 preference):** Settings › Calendar has chips Sunday and Monday, kept on this device (`vale.calendar.weekStarts`); the region's day is picked until changed, and the row has no description. Every week and month follows at once. Scenes `settings-calendar`, `settings-week-starts`, `calendar-week-starts-monday`.
- **MAP (Vale 48):** the system's maps app (`maps://`) on Apple devices, OpenStreetMap elsewhere (`lib/maps.ts`). Unit test `maps.test.mjs`; scene `calendar-event`.
- **SHOW CALENDARS (Vale 50):** turns every calendar back on, with "Showing every calendar" and UNDO. Scenes `calendar-all-hidden`, `calendar-show-calendars`.
- **Menu-bar window (Vale 52):** NEXT UP's event is left out of the day list. Scene `mini-calendar`.
- **Read-only calendars (Vale 53):** one line, with the read-only state as a mark and "Read-only" in the row's name. Unicron's `NavItem` has no trailing icon mark yet, so the mark is the neutral square, not the lock the decision asks for (a Unicron gap). Scene `calendar-calendars`.
- **Past days (Vale 54):** the date-and-time picker cannot pick a past day: it is faint, a press does nothing, and the keys stop at today. Earlier today stays pickable, and a time already gone is the field's error. Scene `picker-keys`.
- **The visitor's page (Vale 56):** it leads with the owner's name, not Vale's lockup; a phone shows the first three days of times, then MORE DAYS. COPY LINK disabled with its reason stays. Scene `calendar-booking-page`.

### Contacts

- **Letter headers (Vale 57):** the drawn overline header with its three-digit count, not the large letter. Scene `contacts`.
- **PASTE A SIGNATURE on existing cards (Vale 59):** an existing card fills only its empty fields and adds emails and phones it lacks. What it filled is a compact info line at the top of the form with UNDO, which puts the form back; a toast would stand under a phone's full-screen form, out of reach. A new card works as before (the toast "Filled in …"). Scene `contacts-edit-paste-signature`.
- **Names keep their case (Vale 8):** a label chip (a name someone wrote) passes Unicron 1.1's `keepCase`; recipients were already `Chip`s, which keep case. Scene `contacts-group`.

### Settings, About and first run

- **Short section names (Vale 3):** "Signatures" and "AI"; their descriptions carry templates, summaries and replies, and both keep their old words as keywords. Scene `settings-signatures`.
- **The server's update mark (Vale 20):** for the gateway's owner, a newer gateway image marks the way into Settings and About, the one signal for every update. A team member gets no mark. Scenes `settings-server-update-mark`, `settings-server-update-member`.
- **REMOVE ACCOUNT in the web demo (Vale 60):** disabled with "Not in the demo" as its described reason; the question stays wherever removing works. Scenes `settings-manage-account`, `settings-remove-account` (played as the desktop app).
- **The first run's folio (Vale 61):** written in capitals, "STEP 01 // 02". Scenes in `outside.mjs`.

### Notes

- **HERE ALREADY (Vale 68):** the Quick Note lists three linked notes, then MORE, which saves what was typed and opens the item, where the full list lives. Scene `notes-quick-note-more`.

## Consequences

- Figma redraws for Sean: INVITE → GUESTS on the event form (Mobile / 10, Desktop / 08), Upcoming without day headers is already as drawn, the booking page without the lockup, the read-only lock in the calendars list, the folio in capitals, the letter headers as overlines.
- Unicron gap: a trailing icon mark on `NavItem` (`mark={{ icon, label }}`) for the read-only lock.
