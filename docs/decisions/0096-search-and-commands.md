# ADR-0096 · Search everywhere, the command menu and the keys list

- **Status:** Accepted for the build. It records **DC14 as Proposed**: ADR-0032's fixed keys grow from Esc, `?` and ⌘K to ⌘K, ⌘,, ⌘\, ⌥N, `?`, ⌘Z (while a send can be taken back), the Menu key or Shift+F10, and Esc, and the person's search key (`mail.search`) works in every section, not only Mail. The question for Sean is whether that list, and a search key that is listed under Everywhere but kept under Mail's id, are right. It cites W3 (no From or Has-attachment filter in `MessageQuery`).
- **Date:** 2026-11-15
- **Builds on:** [ADR-0032](0032-your-keys.md) (single keys), [ADR-0055](0055-power-settings.md) (when opening a conversation reads it), [ADR-0063](0063-shared-inbox.md) (a team member's mail-only view), [ADR-0075](0075-settings-page-and-shortcuts.md) (the keys list), [ADR-0085](0085-search-place.md) (Search as a place, the row adapters, the settings sections list), [ADR-0086](0086-status.md) (`LoadState`), [ADR-0092](0092-conversation.md) (the conversation).
- **Design:** briefs X2, X3 and X7 of the undrawn-areas design; Mobile / 04 and Desktop / 03 (Mail — Search); cross-app decisions §6, §9, §12, §13, §14.

ADR-0085 made Search a place with chips and results that opened in their own section. This finishes it: a result now opens beside the results (pushed on a phone), every chip says its count once it is sure, the keys move through the results, and Mail looks through every page of every lane. The command menu and the keys list are rebuilt on unicron's parts with every place and fixed key in them.

## Decisions

### Search (brief X2)

1. **A result opens in Search** (`found-detail.tsx`): the conversation in `ConversationView`, an event in `EventDetailPane`, a person in `ContactDetailPane`, a note in `NoteDetailPane`, each imported as its owner keeps it. The detail column on a desktop, a pushed screen on a phone and at medium width, so Back returns to the results with the words kept. The sender panel stands beside a found conversation as it does in Mail. A conversation opened here is read as Mail reads one (`useMarkRead`, moved out of Mail's list into `features/mail/use-mark-read.ts`). The open row is selected (`primary-soft` and the edge). A new search, or another chip, closes what was open. "Nothing open." now says "Pick a result to see it here."
2. **Counts on the chips.** Every kind is read once there are words, so each chip can say its count (`FilterChip count`), and only once its query has every row; a lane or Mail with more pages shows none. ALL adds the four. A team member reads mail alone and has no chips.
3. **Mail, every page** (`use-results.ts`): six fixed page-at-a-time reads (Inbox, Snoozed, Archive, Waiting, Starred, and the Screener only while it is on), under the lanes' own cache keys. Joined newest first, one row per conversation; while a lane has more, the list stops at that lane's oldest row so far, so a later page never lands above a row already shown. Reaching the end (`MoreOnView`, an `IntersectionObserver` on SHOW MORE) fetches the next page of every lane that has one; the button is the same step by hand.
4. **Keys.** ↓ from the field goes to the first result; ↑ and ↓ move between results; ↑ from the first returns to the field; Enter opens (the row is a button). Esc closes what is open, then clears the words, then leaves for where you came from.
5. **A failed read** goes through `LoadState`: the critical empty state with TRY AGAIN when nothing came back, the critical banner over what did.
6. **Left out:** the drawn FROM and HAS ATTACHMENT chips (W3), and Desktop / 03's parsed booking card (no backend): a found message shows as a message. The phone's swipe up on the search button (scope All) is not built: `FloatButton` has no swipe, and the ALL chip is the plain path.

### The command menu (brief X3)

1. unicron's `CommandDialog` (the form size, in the top third) with `Command`: "Type a command or search…", groups under mono overlines, a key at the right of a row that has one (`CommandShortcut`), one highlighted row, and the footer "`?` lists every key." in the meta role.
2. **CREATE:** New message (the compose key), New event, New contact, New note, Quick note [about …] (⌥N), Open a shared note… (`openSharedNote()`).
3. **MAIL:** every lane from `lanes.ts`, the Screener while it is on.
4. **GO TO:** Mail, Calendar, Contacts, Notes, Tasks, Booking links, Duplicates, Recently deleted, Restore contacts (`openRestoreContacts()`), Search (the search key), and Missed reminders (`openMissed()`) only once `missed-reminders.ts` says that list was raised.
5. **SETTINGS:** Settings (⌘,), every section this person has by name from `sections.ts`, Add an account… (`startAddAccount()`), Keyboard shortcuts (`?`).
6. **VIEW:** Theme: System, Stone, Graphite; Show hours or Hide hours (`view-prefs.ts`); Collapse sidebar or Show sidebar (⌘\), where the sidebar shows in full.
7. **VALE**, in the desktop app (`isDesktopApp()`): Check for updates, Restart to update while one is ready, Reload app.
8. **The last row while typing:** "Search everything for “…”", opening Search with ALL. ADR-0085's extra "Search mail for “…”" row is gone: the MAIL chip is a press away.
9. **A team member** sees MAIL, Search, their own settings sections and the keys list; nothing about notes, and their last row is "Search mail for “…”". Off while writing a message, as before.

### The keys list (brief X7)

1. unicron's `AdaptiveDialog` (form, a full sheet on a phone): overline KEYS, title "Keyboard shortcuts"; `SectionHeader`s EVERYWHERE, MAIL, CALENDAR; a `FieldRow` per key, the key as a `Kbd` in the label (the label column at the scale's 96 through unicron's `--c-field-row-label-width` knob, on a plain wrapper) and what it does as words in the value.
2. MAIL and CALENDAR are the person's own keys (`useKeyBindings`). EVERYWHERE is their search key, then `FIXED_KEYS`: ⌘K, ⌘,, ⌘\, ⌥N, `?`, ⌘Z, Menu or ⇧F10, Esc. ⌘ and ⌥ read Ctrl+ and Alt+ off Apple machines.
3. Two columns from the medium width up (`useViewport`, no media query): EVERYWHERE over CALENDAR, MAIL down the right. The footer's one secondary, CHANGE KEYS AND SWIPES, opens Settings › Shortcuts and gestures. No primary. Focus starts at the top of the list, so it opens at its start.
4. A team member sees no CALENDAR and no ⌥N. `FIXED_KEYS` entries gain an optional `notes` flag for that; Settings › Shortcuts and gestures reads the same list and so shows the new fixed keys too.

### Scenes

- **Kept, same names:** `mail-search` (Sean's drawn `search--mail`; on a desktop a result open beside), `mail-search-none` (Sean's `search--none`), `search-mail` (now also ↑, ↓, Enter, and Esc closing an open result first; Back from a pushed result), `search-all` (Sean's `search--all`; a found note opens in Search), `command-menu` (Sean's `shell--command-menu`; the five groups, the footer, one highlighted row), `keyboard-shortcuts` (Sean's `shell--keys`; the person's keys and every fixed one).
- **New:** `search-calendar` (Sean's `search--calendar`), `search-contacts`, `search-notes`, `search-lane-starred` (the lane chip finds Screener and Starred mail; MAIL looks in the Screener), `search-show-all`, `search-result-desktop` (a person and an event open beside; the sidebar marks Search), `search-member`, `command-menu-typing` (the last row; Restore contacts and Open a shared note… open; no Missed reminders with nothing missed), `command-menu-missed` (scenario `missed`).

## Verification

- `check-mail-search.sh`: typecheck, lint (no warnings), build:demo, build, the notes-relay tests, the ratchet read from the source, the lockfile proof: exit 0.
- **Ratchet:** className **82 → 82**: the slice's files had no className on a unicron part to take away, and it adds none. Style 1, spread 0, raw buttons 14 unchanged. Look-alikes by the estimator: 0.
- **In the browser** (`pnpm shots -g search -g command -g keyboard`, phone 390 × 844 and desktop 1440 × 900, graphite and stone, and `--size medium -g search`): every scene above passes its assertions. Mail, shell, status and the shortcuts settings scenes were run again for the moved mark-read and the longer `FIXED_KEYS`.

## Consequences

- `FIXED_KEYS` gains entries and an optional `notes` flag; its shape is otherwise unchanged for the notes-settings lane's key editor.
- `features/mail/use-mark-read.ts` is the one place a conversation is read on opening.
- Search reads every kind as you type; on a gateway that is up to eleven reads for a search (six lanes, the lane it came from, events, people, notes and archived notes), each kept and shared with the sections' own cache.
- A lane that is not ordered by `sortAt` (Snoozed orders by when it comes back) can, past 200 rows, end Mail's joined list a little early until the next page comes; nothing is ever shown out of order.
