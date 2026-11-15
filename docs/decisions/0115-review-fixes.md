# ADR-0115 · After the review: the leave guard on every new contact, accounts in sight, phone forms as drawn, and a browser gate in CI

- **Status:** Accepted for the build. Two changes to decisions on record, each a proposal for Sean: a failed send no longer toasts while Mail is open (it was [ADR-0095](0095-outbox.md)'s toast plus Banner, brief M7), and the accounts filter loses its "All" row (it was [ADR-0084](0084-places.md)'s radio group of All and each account).
- **Date:** 2026-11-15
- **Builds on:** [ADR-0083](0083-shell.md) (the shell), [ADR-0084](0084-places.md) (places and the sidebar's groups), [ADR-0087](0087-forms-and-questions.md) (the form layer and the leave guard), [ADR-0088](0088-date-parts.md) (the date parts), [ADR-0103](0103-contact-edit-and-clean-up.md) (contacts edited in the pane), [ADR-0104](0104-settings-frame.md) (Settings on the frame).
- **Design:** the Figma frames Desktop / 01, 05, 10, 12 and Mobile / 03, 05, 10, 13, 16; cross-app decisions §1, §9, §13; the undrawn-areas briefs X6 and X7.

A review of the merged rebuild found 27 things. This records the fixes that change what the app does or how it is tested. Each finding's outcome, and what stays open, is in the hand-off (`vale-fixes.md`).

## Decisions

### Every new contact form asks first (brief X6)

`openContactEditor` in the places store makes its change through `leaveThen`. A contact being edited in the pane with changes now asks "Discard changes?" before NEW CONTACT, ⌘K › New contact, quick create, the sender panel's Add to contacts or a signature's Fill from signature replaces it. Before, only a row change asked. The scene `contacts-leave-guard` presses NEW CONTACT and ⌘K › New contact with typed changes and expects the question with focus on KEEP EDITING (it fails without the fix).

### Mail's sidebar: the accounts before Team, in sight when one is broken (Desktop / 01, 05)

- Mail's groups are FOLDERS, ACCOUNTS, then TEAM. Team is the brief's addition and the frames do not draw it.
- No "All" row, as Mobile / 05 and Desktop / 01 draw the accounts. No account chosen means all of them. Pressing the chosen account again goes back to all; the page head's overline says ALL ACCOUNTS. The page head's arrows still step through all accounts.
- Each account has the `user--avatar` glyph, as drawn.
- An account that stopped syncing scrolls the sidebar's middle so its row is in sight, by whole groups so no row is cut at the top. The scene `mail-sync-error` checks the row "Work, sync problem" is inside the middle at 1440 × 900.

### Phone forms (Mobile / 03, 10, 13)

- `FormLayerForm phoneKind`: the phone's top row names the form ("New message", "New event", "Edit contact"), the first part of the overline. The typed name stays the desktop dialog's title and stays in the layer's accessible name. The composer, the event form and the contact form pass it; other forms (a signature, an invitation) keep their title, which names something not shown elsewhere.
- A hairline under the top row, inside the 16 px edges.

### Birthday (Mobile / 13, Desktop / 10)

The browser's date field is gone. BIRTHDAY shows the day in the app's date style ("Mar 04") and opens the shared `DatePicker` from its calendar button; YEAR, beside it once there is a day, is optional and typed. A birthday with no year is saved as `--MM-DD`, as other apps save it, so a yearless birthday can now be made, not only kept. Scene: `contacts-edit-birthday`.

### Settings

- Desktop / 12: while Settings is open the sidebar shows Search, APPS and Settings; the section's own groups step aside.
- Mobile / 16: the phone's top row says "Settings" (an `h1`) and the large page head is left out on a phone.

### One channel for a failed send (cross-app decisions §1)

In Mail a failed send is the Mail Banner (with EDIT), the NOT SENT row and the Outbox's critical tone. The sticky "Not sent" toast is raised only while another place is open, and goes once Mail opens. This reverses brief M7's toast plus Banner, which the decisions override (contract §4a). Question for Sean.

### Smaller

- The desktop status line's CHECK AGAIN is named "Synced // 09:16. Check again", so the words on it lead its name (WCAG 2.5.3).
- ADD PHOTO is one button that opens a hidden file input out of the tab order (it was a `label role=button` around a focusable input: two Tab stops).
- Keyboard shortcuts on a desktop is a `Dialog` with a sticky footer, so CHANGE KEYS AND SWIPES stays in sight; a phone keeps the `AdaptiveDialog` sheet. `AdaptiveDialog` cannot pin its footer on a desktop: a unicron gap.
- Month: events in a cell sit 4 apart (were 2). Days of another month are in secondary ink (were faint at 2.81:1), in the Month and in the month grid; a day that cannot be picked stays faint.
- Search: a note's row says when it was edited as the Notes list does (`04:16`, `WED`), in the mono meta.
- The Notes block in a conversation, a person, an event and the sender panel is a `SectionHeader` with its count and actions, compact `ListRow`s, and "NOTES // 00" in its heading when empty.
- Removed, with no readers: `components/list-row.tsx` (`EntryRow`), `features/notes/shared-note-card.tsx` (`SharedNoteCards`) with `SharedPreview`, and `PRIMARY` in `features/mail/vocabulary.ts`. Raw elements **4 → 3** in `.dsa/baseline.json`.
- Every create flow from anywhere (the command menu's CREATE group: New message, New event, New contact, New note) is one move away from a form in the pane: its whole body runs through `leaveThen`, so the form opens, or the note is made, only after DISCARD. Before, the section change waited for the question but the form opened at once, over it. `contacts-leave-guard` presses ⌘K › New message, New event and New note with typed changes.

### The browser test gate

CI gains a `browser` job: install, Playwright's Chromium, then `pnpm shots` for the scenes that carry asserts on safety and flow (swipes, the discard question, the form layer, the leave guard, merge, row menus, deletes, a failed send, sync errors, the folders sheet, navigation, keys, the command menu), dark theme, at each scene's sizes. Any FAIL fails the job. Four undrawn scenes also run at medium width now, with width-aware asserts: `mail-attachment-preview`, `mail-screener-notice`, `calendar-dav-error`, `places-recently-deleted-restore`.

## Unicron gaps found here

`Sheet height="full"` as a full-screen form (ground surface, no grabber); `NavSection checkable="single"` drawn as the nav item's soft tile instead of a square; a scroll-edge fade on the sidebar's middle; `SettingsFrame`'s list wrapping a long name to two lines; `Skeleton variant="row"` with the row's text inset while its hairline runs edge to edge; a quick-create menu width; `Checkbox` done as a primary fill; `AppFrameFocus` and centred dialogs keeping the 4 px grid; `AdaptiveDialog` with a sticky footer; muted ink on `primary-soft` in stone (4.16:1); `CalendarEvent`'s inner lines 2 apart.
