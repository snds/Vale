# ADR-0105 · Note lists: rows, cards, the map and smart folders

- **Status:** Accepted for the list, cards, map and smart folder form. **Proposed** for one part: DC3 of the undrawn-areas design, a note's color as an edge and a square instead of a tinted pane (it replaces [ADR-0038](0038-note-cards.md)'s tinted cards and pane). The question for Sean is at the end.
- **Date:** 2026-11-14
- **Builds on:** [ADR-0038](0038-note-cards.md) (cards and colors), [ADR-0039](0039-note-reminders.md) (due notes), [ADR-0042](0042-smart-folders.md) (smart folders), [ADR-0053](0053-map-of-notes.md) (the map), [ADR-0084](0084-places.md) (folders and tags as places), [ADR-0085](0085-search-place.md) (the row adapter), [ADR-0086](0086-status.md) (the section banner, the load state), [ADR-0087](0087-forms-and-questions.md) (the form layer), [ADR-0088](0088-date-parts.md) (the swatches).
- **Design:** Mobile / 14 Notes — List (`34:1139`) and Desktop / 11's list column (`36:2571`); brief N1 of the undrawn-areas design, with 1.3, 1.4, 5.2 and X1; cross-app decisions §1, §9, §12 and §13.

The notes list was the old shared row (`components/list-row.tsx`) with a pin, a round color dot, a snippet and a time, under small "Pinned" and "Others" headings; cards were Keep-style tinted, rounded cards; the map drew circles with a frosted, rounded zoom capsule; the smart folder form was plain inputs and round color buttons. Each moves onto unicron's parts, in the direction's grammar.

## Decisions

### The page head and the status line

- Overline `NOTES // 04`, `{FOLDER} // 06` or `{FOLDER} // #TAG // 01`; title "Notes", the folder's name, "Pinned" or "Archive". While the list reads, or when it failed, the count is left out.
- **From medium width up the head's actions are LIST · CARDS · MAP** (a single-choice `FilterChipGroup` named "View") and the More menu. On a phone the same choice is the Folders sheet's last group (ADR-0084), and the head keeps More.
- **The status line's fact is the relay's state, then the last edit:** `SYNCED`, `SYNC OFF`, `CONNECTING` or `NOT SYNCED`, then `// EDITED 07:16`. It is plain text: the line's fact cannot be a button in a lane's own code (`app/status.tsx` is the shell's). The sync set-up opens from the More menu and from the banner below; making the fact open it is asked of the shell's owner.
- **A relay error is the section's banner** (channel 4): "Notes didn't sync", the relay's words, OPEN SYNC (`openSyncSetup()`).

### The list (`NoteRow` with `list`)

- **Sections DUE, PINNED, RECENT,** each a `SectionHeader` with its count; a section with no notes is left out. DUE is a reminder that has passed (ADR-0039), above everything; the Archive has none.
- **A row is `ListRow` inline with plain meta, as Mobile / 14 draws it:** the title; `Edited 08:40` (the clock today, the day within a week, the date this year, the date and year before), then at most one of `// 6 items` (checklist items, done ones too, from `noteTasks(true)` grouped by note; the core leaves out locked and archived notes), `// 3 linked`, or a time glyph and the reminder's time; at the end one tag, the first that applies: DUE, PINNED, LOCKED, SHARED, or the note's first tag. A locked note says nothing after "Edited". **Rows carry no snippet**; cards and Search do.
- **A note's color is an 8 px swatch square after its title** (lib/swatches, ADR-0088), and its name is said after the title ("Cabin packing list, Green"). The brief puts the square in the row's leading slot; that slot is the 40 px index column, and a square there sets colored titles 48 px in from the rest, so it stands in `marks` instead (a unicron gap).
- `NoteRow` keeps Search's compact row, with snippet and marks, when `list` is not passed: the adapter's props are unchanged.
- The list no longer imports `components/list-row.tsx`.

### Cards (`NotesPrefs.grid`)

- **`Tile`s in 2, 3 or 4 even columns:** a phone or beside an open note, medium width, a desktop. Each: a 4 px top edge in the note's swatch (none without a color), the cover image, the title, up to six caption lines of the snippet (none for a locked note), a mono foot `Edited WED` and the same single tag.
- The list takes the full width until a note opens; then list and detail stand side by side with Back (unchanged from ADR-0038).

### The map (`NotesPrefs.graph`)

- **Notes are small squares,** growing a little with their links; **links are 1 px hairlines** in the faint ink; events, people and conversations are outlined squares with their glyph, dashed when they are not on this device. A note's color is its square's 2 px edge.
- **The open note is a 2 px primary-fill outline around a primary-soft square, never a solid fill.** Keyboard focus adds an ink ring outside it.
- **Bottom right, unicron's `Toolbar` "Map":** Zoom in, Zoom out, Fit, and the toggle Unlinked notes, on the raised surface with a hairline. The frosted capsule is gone.
- The kinds of linked items stay switchable, as the map's legend at the top left: a multiple `FilterChipGroup` with each kind's count.
- **One Tab stop;** the arrow keys go to the nearest square that way among the ones it links to first, then any; Enter opens; +, − and 0 zoom and fit.
- The map fills what is left of its column down to the column's clearance, so its toolbar stands at the foot (it was 320 px tall in a column with no height of its own).
- Empty: "Nothing to show." / "Turn on unlinked notes." when every note is filtered out; `MAP // 00` "No notes to map." with no notes.

### The smart folder form (form layer, ADR-0087)

- Overline "New smart folder" (or "Smart folder"), title the name as typed. The line: "Notes join and leave as you write. They must match everything you fill in."
- NAME (`TextField`); HAS ANY OF THESE TAGS (`ChipField`; a leading # is dropped; the line under it lists the tags in use); HAS THE WORDS (`TextField`); LINKED TO (`FieldRow`, stacked on a phone, with CHANGE opening an `AdaptiveMenu` of It doesn't matter, Anything, An event, A person, A conversation); COLOR (the swatch picker, below); Has a reminder and Has to-dos left (`ToggleRow`s).
- **The swatch picker** (`features/notes/swatch-picker.tsx`, `SwatchChoice`; app-level by brief 1.4): one unicron `RadioGroup` of It doesn't matter, Any color and the ten colors, each color a radio, its 8 px swatch square and its name. One Tab stop. The round color buttons, two raw `<button>`s per color in the count, are gone.
- Footer: DELETE (text, critical), Cancel, CREATE FOLDER or SAVE. **DELETE runs at once** and raises the toast "Deleted {name}" with "Its notes are still in Notes" and UNDO. The core has no undelete, so UNDO saves the same rules again as a folder of the same name, and makes it the place again if it was. A failed delete shows the server's words in the form's banner.
- Toasts name the thing with no full stop: "Created {name}", "Saved {name}".

### Empty, loading and error (brief 5.2, cross-app decisions §9)

| Where | Overline | Title | Body | Action |
|---|---|---|---|---|
| All notes | `NOTES // 00` | No notes yet. | Start one, or bring them in from another app. | IMPORT |
| Pinned | `PINNED // 00` | Nothing pinned. | Pin a note from its menu to keep it here. | — |
| A smart folder | `{FOLDER} // 00` | No notes in {folder} yet. | They join when they match. | — |
| The Archive | `ARCHIVE // 00` | No archived notes. | — | — |
| A tag | `#{TAG} // 00` | No notes match. | — | — |

Loading is three skeleton rows. A failed read is `LoadState`: the last good list under a critical banner, or with nothing to show "Can't load your notes." with the core's words and TRY AGAIN.

### Kept until Settings › Notes takes it (brief T5, slice c8)

The More menu: Import notes…, Export all as Markdown, Sync between devices…, Move checked items down, Find text in images.

### The note's color no longer tints the pane (DC3)

`NotesView` stops passing `detailTint` to `MasterDetail`, and cards stop drawing the tints. The tints stay in `styles/notes.css` for the note's own pane and its color menu, which the note's rebuild (brief N2) moves to the swatches; the cards' radius and width knobs are gone.

### Demo scenarios (`core/demo-scenarios/notes.ts`)

`notes-due` (the gift list's reminder passed this morning), `notes-empty` (no notes), `notes-read-fails` (the core refuses every list).

## Verification

- `tsc -b`, `oxlint` and `vite build` (the app and the demo) pass; the notes relay's tests pass.
- Ratchet, counted by reading the source: className overrides **108 → 106**, plain buttons **14 → 12** (the card's button and the color buttons), style 1, spread 0. `.dsa/baseline.json` is lowered. Look-alikes by the estimator: 0.
- In the browser, at phone (390 × 844), medium (768 × 1024) and desktop (1440 × 900), stone and graphite, by asserting scenes: PINNED 01 and RECENT 03 with the drawn row (`Edited 07:16 // 4 items`, PINNED, no snippet, the green square, no tint); the relay's state in the status line; cards in 2, 3 and 4 columns with their foot; the map's toolbar, one Tab stop and no round node; an arrow from the agenda reaches a square it links to, Enter opens it, and its selection is an outline on the soft fill with no solid primary square; Unlinked notes turns off and back; DUE first under the `notes-due` scenario; a tag narrows to its note with the overline `NOTES // #WORK // 01`; the Archive; the relay banner, whose OPEN SYNC opens the set-up; the empty and failed lists; every More menu item works; a smart folder is created with LINKED TO changed and becomes the place, its DELETE says the notes stay, and UNDO brings it back as the place.

## Consequences

- The notes list looks like the drawn frames and the other lists in Vale. Cards and the map follow the same grammar: square, hairlines, one identity color for selection only.
- Unicron gaps found here: `ListRow`'s `leading` is the 40 px index column, so an 8 px square there misaligns the titles; `AppFrameStatusLine`'s fact is text a lane cannot turn into a button; a list column has no height a full-height child can fill.

**Question for Sean (Q6, DC3):** a note's color shown only as a square in rows, a 4 px edge on cards and a square's edge on the map, from unicron's twelve swatches, with the open note's pane no longer tinted. Yes, or where should color weigh more?
