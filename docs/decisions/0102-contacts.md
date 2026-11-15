# ADR-0102 · Contacts: the list, smart groups and the person on unicron's parts

- **Status:** Accepted for the build. It cites DC11 (contact rows), recorded as a proposal in ADR-0113 by a1 (mail-search lane), and Q8 (no photo in the list rows, as drawn); the brief's pick stands until Sean answers.
- **Date:** 2026-11-14
- **Builds on:** [ADR-0023](0023-contacts-that-keep-themselves.md) (smart groups), [ADR-0027](0027-faces-and-sources.md) (several address books, source names, copies), [ADR-0037](0037-quick-note.md) (Quick Note), [ADR-0084](0084-places.md) (Contacts' places), [ADR-0085](0085-search-place.md) (`PersonRow`), [ADR-0086](0086-status.md) (section banner, `lib/copy.ts`, `LoadState`), [ADR-0087](0087-forms-and-questions.md) (the form layer).
- **Design:** briefs P1 and P2 of the undrawn-areas design; Figma's Mobile / 11, Mobile / 12 and Desktop / 09.

The list was the old pane: small avatar rows under plain letter headings, pill source badges, a "possible duplicates" card and a Recently deleted card in the list. The person was a centred card of icon-over-word buttons, a rounded box of fields and plain item rows. The brief moves both onto unicron's parts in the frames' layout, in their honest versions.

## Decisions

### The list (`index.tsx`, `person-row.tsx`)

- **Head:** overline `CONTACTS // 08` (the list's real length, two digits) and the title "People"; a label or a smart group by its name: `{GROUP} // 04` and the group's name.
- **Sections are letters:** `SectionHeader variant="index"` per letter with its count (inset on a phone). There is **no Favorites section**: no favorite flag exists (W5).
- **Rows** are `PersonRow list` (an optional prop; search keeps the compact row): `ListRow layout="inline"`, the name; a mono line with the first email, else the first phone, else the company, then `// {book}` when more than one address book shows (ADR-0027); the first label at the right. **No photo** (Q8), as drawn. The list no longer imports `components/list-row.tsx`.
- **Inside a smart group** a single-choice `FilterChipGroup` under the head narrows by label: ALL and each label present, each with its count.
- **States:** three skeleton rows while loading; "No contacts yet." · "Add one, or connect an account that has some."; "No one fits {group} right now." · "People join as their cards change."; a failed read through `LoadState`; an account's `davError` as Contacts' one critical banner "{Account} contacts didn't sync" with OPEN ACCOUNTS. Nothing open: CONTACTS · "Nothing open." · "Pick a contact to see it here."
- The duplicates and Recently deleted cards leave the list: both are places under CLEAN UP (ADR-0084), and a person with duplicates says so on their card.

### The smart group form (`smart-groups.tsx`)

On the form layer. Title as typed, or "New smart group". The line "People join and leave as their cards change. They must match everything you fill in." NAME; HAS ANY OF THESE LABELS as a `ChipField` (its helper names the labels in use); COMPANY; EMAIL DOMAIN ("Subdomains count too."); the `ToggleRow`s Has a phone number and Has a birthday; IN TOUCH WITHIN as a number field of days (empty is any time; the old switch is gone). CREATE GROUP or SAVE; saved, the group opens, with no toast. DELETE (a text button, when editing) does not ask: the code can undo it, so the toast "Deleted {name}" · "Nobody in it was changed" carries UNDO, which saves the same rule again and opens it.

### The person (`contact-detail.tsx`, `share.tsx`)

`ContactDetailPane` keeps its props (`id`, `onDeleted`): search opens it (a7). `Action` and `Activity` keep theirs for the sender panel.

- **Head:** `InitialTile` L with the card's photo; the name (title on a desktop, lead on a phone); a mono line with company and job title, in place of the drawn "Favorite // since 2019", which has no data; labels as `Badge`s. A card with duplicates shows a compact info `Banner` "2 cards look like this person." with REVIEW, which opens Duplicates.
- **Field Rows** (stacked on a phone): one per email, its own label (WORK, HOME) or EMAIL, with COPY through `useCopy` ("Copied" for 2 s, no toast, a polite status line); one per phone with CALL (`tel:`); BIRTHDAY (`Jun 21, 1988`, or `Jun 21`); NOTE; SAVED IN (the account, or "On this device"); ALSO IN per copy in another book, with OPEN.
- **Buttons** (desktop and medium, secondary): WRITE (a menu of addresses when there are several), EDIT, SHARE (a menu: Share… where the device can, Save as vCard file, Show QR code), DELETE (no question; the toast "Deleted {name}" with UNDO, as before).
- **Phone:** the top bar's Edit and More (Share…, Save as vCard file, Show QR code, Quick note, Delete); the bottom row's write mail and, with a phone number, Message (`sms:`).
- **A read-only book:** no EDIT or DELETE, and "This address book is read-only." with the locked icon.
- **Sections, each only with rows:** UPCOMING and MET RECENTLY as `OccurrenceCard`s with the date and the calendar's swatch; RECENT MAIL as `MessageRow`s; then the linked notes (QUICK NOTE, NEW NOTE). A meeting's JOIN is on the event it opens, no longer on the person.
- **The QR code** is unicron's `QrCode` (SVG, no `data:` URL) in an `AdaptiveDialog` of the question size (a sheet on a phone), dark on its light square in both themes, with "Scan with a phone's camera to add this contact." The core's QR call returns a finished SVG; the dialog encodes the core's own vCard export instead, cut to what that QR carries (name, company, title, phones, emails: `scanCard` in `contact-format.ts`). No core change.
- Loading is the tile and a bar; a card that is gone says "That contact is gone."
- `PersonAvatar` is now an `InitialTile` (sizes s, m, l); the contact form's large tile is kept through its old `className`.

## Verification

- `tsc -b`, `oxlint` (no warnings), `build:demo`, `build`, the notes-relay tests: pass (the lane's check). The ratchet, counted by reading: className **90 → 86**, style 1, spread 0, raw buttons 9; `.dsa/baseline.json` lowered. Look-alikes by the estimator: 0.
- `pnpm shots -g contacts` (phone and desktop, graphite and stone) and `--size medium -g contacts`: 68 and 32 pictures. Kept names: `contacts`, `contacts-person`, `contacts-share`, `contacts-smart-group`, `contacts-groups-sheet`, `contacts-duplicates` (now through the person's REVIEW). New: `contacts-list-person`, `contacts-photo`, `contacts-qr`, `contacts-group`, `contacts-readonly`, `contacts-dav-error`, `contacts-loading`, `contacts-smart-group-undo`. `mail-sender` and the search scenes, which use `Activity` and `PersonRow`, pass.
- Asserted: no Favorites and the row's `email // book` line; COPY says "Copied", copies, raises no toast and returns to COPY; a card with a photo, two emails, two phones, two labels, a birthday, a note, UPCOMING, RECENT MAIL and MET RECENTLY renders every row; the share menu's rows (and Quick note and Delete in a phone's More); the QR code and its line; a read-only card offers no Edit or Delete; the sync banner with OPEN ACCOUNTS; a group's chips narrow and ALL restores; a smart group created, opened, deleted (the toast says nobody changed) and brought back by UNDO.
- Demo scenarios in `core/demo-scenarios/contacts.ts`: `contacts-full` (Priya's card changed through the demo's own update, with a drawn portrait), `contacts-readonly`, `contacts-group`, `contacts-loading`.
- Looked at the pictures beside Mobile / 11, Mobile / 12 and Desktop / 09. Letter sections in place of FAVORITES, and company in place of "since 2019", are the planned departures.

## Consequences

- `Action` (four className overrides) stays only for mail-search's sender panel; when that panel stops using it, it can go.
- The linked-notes block is notes-settings' part and still shows "No notes yet." when empty.
