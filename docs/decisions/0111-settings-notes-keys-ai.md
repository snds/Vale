# ADR-0111 · Settings for Notes, Shortcuts and gestures, and AI as rows

- **Status:** Accepted for the build; it applies [ADR-0104](0104-settings-frame.md)'s row grammar, which is Proposed (DC1). The swipe rows name the four tiles of brief M1, which is DC2 (recorded by the mail lane's ADR-0090, with Q4); the fixed keys ⌘, ⌘\ and ⌘Z in the list are DC14 (the mail lane's ADR-0096). This ADR changes no recorded decision of its own.
- **Date:** 2026-11-15
- **Builds on:** [ADR-0104](0104-settings-frame.md) (the frame, silent saves), [ADR-0110](0110-settings-mail-calendar.md) (`SettingBlock`, `useRowSize`), [ADR-0012](0012-notes.md) and [ADR-0062](0062-end-to-end-encrypted-sync.md) (sync through a relay, and its end-to-end encryption), [ADR-0065](0065-relay-key-secret-field.md) (the key in a `SecretField`), [ADR-0034](0034-connected-notes.md) and [ADR-0044](0044-images-in-notes.md) (export and import), [ADR-0045](0045-scans-and-text-in-images.md) (text in images), [ADR-0025](0025-one-action-grammar.md) (swipes), [ADR-0032](0032-your-keys.md) (your keys), [ADR-0059](0059-opt-in-ai.md) (opt-in AI), [ADR-0087](0087-forms-and-questions.md) (the form layer, the confirm question), [ADR-0084](0084-places.md) (intents), [ADR-0105](0105-note-lists.md) (the notes page head).
- **Design:** briefs T5, T6 and T7 of the undrawn-areas design (and N1's "the More menu's set-up items move to T5"); cross-app decisions §5, §9, §10, §12 and §14. No Figma frame draws these sections.

Notes' set-up lived in a More menu on the notes page head and in a dialog that held the relay form and a second step for encryption. Shortcuts and gestures was headings, native selects and a toast for every change. AI was bordered cards with a check, toasts, and a bordered error box. The brief makes the first a Settings section and gives all three the row grammar the other sections speak.

## Decisions

### Notes (T5: `notes/notes-settings.tsx`, `relay-dialog.tsx`, `relay-setup.ts`, `import-dialog.tsx`, `open-sync-setup.ts`)

- **A new section**, shown to everyone but a team member (notes are the owner's, ADR-0063), in the CALENDAR AND NOTES group. The demo now lists nine sections; a gateway's owner and the desktop app ten, so "Find a setting" shows for them.
- **SYNC:** SYNC BETWEEN DEVICES · Off, Connecting…, Up to date, or Not syncing with the relay's words under it in critical text · SET UP or CHANGE. END-TO-END ENCRYPTION · Off or On · TURN ON, off with "Needs sync between devices." until sync is set up. Once on, the KEY row: `SecretField`, hold to show, COPY (the clipboard clears after 90 s).
- **Set up sync** in the form layer (form 640, the whole screen on a phone): RELAY ADDRESS ("Any Hocuspocus server works.") · ACCESS TOKEN ("Kept in your system keychain." or, on a gateway, "Sealed on your gateway.") · ENCRYPTION KEY only when the relay is encrypted (this device has a key, or the relay asked for one) · the primary TURN ON SYNC, or SAVE, with TURN OFF SYNC beside it. Saves are silent; a refused one stays in the form with the server's words. The old success toasts are gone.
- **Turn on end-to-end encryption?** is one `useConfirm` question with the line and three `ConfirmDialogConsequence`s. The brief's `key` and `link--off` glyphs are not in unicron's set, so `password` and `unlink` stand in (a gap in the hand-off). The yes TURN ON keeps its label and shows it is working while it unshares and saves the key; focus starts on Cancel.
- **READING:** Find text in images ("Read on this device.") and Move checked items down, as `ToggleRow`s saved silently.
- **MOVING:** IMPORT ("Apple Notes, Google Keep, Markdown") opens the import form: the three sources as `NavItem`s, each a folder to choose with its line; the primary CHOOSE A FOLDER… and CHOOSE FILES… beside it; a segmented `Progress` (one step per batch the core takes) with "Importing…"; then "Imported N notes.", what was left as it was, and DONE as the form's primary. The caption "Notes are copied in. Nothing changes where they came from." EXPORT ("All notes as Markdown") raises "Saved notes to {path}".
- **The Notes More menu is gone.** It held only set-up, and every item is a row here. On a phone the list's view choice was already in the Folders sheet (ADR-0105).
- **Intents:** `openSyncSetup()` opens Settings › Notes (the Notes banner's and the share form's OPEN SYNC). `openNotesImport()` opens it with the import form (the empty list's IMPORT).

### Shortcuts and gestures (T6: `grammar.tsx`, `styles/settings.css`)

- **SWIPES IN THE MAIL LIST:** a picture of the tiles as set (a row swiped right to its leading tile, one swiped left to its trailing tiles, as States / 01 draws), with plain bars where the words would be, `aria-hidden` and `inert`. Then LEADING, TRAILING OUTER ("A full swipe runs it."), TRAILING MIDDLE and TRAILING INNER, mapped to the stored slots `right`, `left`, `leftLong` and `rightLong` as brief M1 maps them. Each has CHANGE, an `AdaptiveMenu` of `SWIPE_CHOICES`. The Screener's own two swipes keep their caption.
- **KEYS IN MAIL** and **KEYS IN CALENDAR:** a `FieldRow` per command, the key as a `Kbd` in a ghost `Button`. Pressing it captures the next key ("Press a key…"; Esc cancels; Tab leaves it as it was). A key in use swaps with the other command and the toast says which ("Swapped with Star or unstar"); otherwise the change is silent. ADD KEY where none is set; REMOVE in the row's menu. The capture is Vale's own (brief 1.4), built from `Button` and `Kbd`: no plain `<button>`. The rows widen the Field Row's label column through its knob, on the spacing scale, so a command's words fit.
- **THESE DON'T CHANGE:** Esc, ?, ⌘K, ⌥N (not for a team member), ⌘, , ⌘\ and ⌘Z, as facts, with Ctrl on Windows and Linux.
- **RESET KEYS** (secondary), off with "Nothing differs from the defaults." until a key differs; it raises "Keys reset to the defaults" with UNDO. The caption "Keys follow you to every device on your account."

### AI summaries and replies (T7: `ai-settings.tsx`)

- The caption first; the section's own line is now "Summaries and suggested replies from a model you choose.", so the two do not repeat.
- **MODEL RUNS:** four `RadioRow`s with the brief's lines; "On this computer" reads "On your own server" on a gateway.
- Then, by the choice: SERVER ADDRESS or SERVICE ADDRESS (a Text Field that saves when you leave it, with its real helper; a refused address shows the server's words) · MODEL, CHANGE with a menu of what the server lists, or a Text Field when it lists none or cannot be asked · API KEY for a hosted choice: write-only, with SAVE; once saved a row "Saved in your system keychain" (or "the gateway's sealed store") with REPLACE and REMOVE, which asks first, since the key cannot come back · CONNECTION: "Checking the connection…", "Connected.", or the error in critical text with TRY AGAIN. "What's sent" stays as a caption.
- No toasts. The drawn Summaries switch is not built (W6).

### Demo scenarios (`core/demo-scenarios/settings.ts`)

- `settings-kept` now also keeps the notes switches, the swipes, the keys, the AI choice and whether a key is saved.
- `notes-synced` and `notes-encrypted`: a relay on this machine (nothing listens; the socket never leaves it), shown up to date. `ai-local`: a model server on this computer.

## Verification

- `tsc -b`, `oxlint` (no warnings), `vite build` (the app and the demo), the notes relay's tests and the lockfile proof pass (`check-notes-settings.sh`, exit 0).
- **Ratchet, counted by reading:** className **80 → 74**, style 0, spread 0, plain buttons 11 (none added). The look-alike estimate finds none.
- **In the browser** (`pnpm shots`, desktop 1440 × 900, phone 390 × 844 and medium 768 × 1024, graphite and stone). Asserting scenes:
  - `settings-notes` (every row, TURN ON's reason), `settings-notes-kept` (both switches after a reload, no toast), `settings-sync-setup` (the form layer's checks, TURN ON SYNC by Ctrl+Enter, Connecting… with CHANGE after a reload, SAVE and TURN OFF SYNC), `settings-sync-from-notes` (OPEN SYNC lands on Settings › Notes with the relay's words), `settings-encryption-confirm` (the line, three consequences, focus on Cancel), `settings-encryption-on` (On, the KEY row, after a reload).
  - `notes-more` (no More menu on the notes head; IMPORT, EXPORT, SET UP and both switches work from Settings › Notes), `notes-import` (from the empty list), `notes-sync`, `notes-relay-error`, `notes-share-no-relay`.
  - `settings-shortcuts` (the picture hidden, four tile rows, key buttons, seven facts, RESET KEYS off with its reason), `settings-shortcuts-capture` (a key remapped with no toast, a taken key swapped with its toast, Esc keeps a key), `settings-shortcuts-kept` (a tile, a key and a removed key after a reload; RESET KEYS and its UNDO).
  - `settings-ai` (the caption, four choices on Off, no Summaries switch), `settings-ai-key` (the key saved and never shown, REPLACE and REMOVE, the model's menu, Connected., REMOVE asks with focus on Cancel), `settings-ai-kept` (a local server and its model after a reload).
  - `settings` and `settings-phone-index` now count nine sections.

## Consequences

- Notes' set-up has one home, reached from Settings, ⌘K's settings and the intents; the notes page head holds only LIST · CARDS · MAP.
- A new device joining an encrypted relay is asked for the key once the relay has said it needs one (the banner's OPEN SYNC leads there); before, the key field showed on every set-up.
- Not verified here: a real relay, a real key in the system keychain, a real model server, and the clipboard clear on the desktop app.
