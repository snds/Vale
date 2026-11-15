# ADR-0109 · Locked notes, sharing a note and Quick Note on unicron

- **Status:** Accepted. Quick Note's layer cites **DC4** (a proposal recorded in [ADR-0087](0087-forms-and-questions.md), for Sean): forms are dialogs on a desktop, so Quick Note leaves the side sheet [ADR-0037](0037-quick-note.md) gave it.
- **Date:** 2026-11-15
- **Builds on:** [ADR-0037](0037-quick-note.md) (Quick Note), [ADR-0043](0043-locked-notes.md) (locked notes), [ADR-0051](0051-identity-holds-the-notes-key.md) (the identity holds the key), [ADR-0056](0056-shared-notes.md) (shared notes), [ADR-0060](0060-team-conversations.md) (a conversation's link), [ADR-0062](0062-end-to-end-encrypted-sync.md) (a share's key), [ADR-0084](0084-places.md) (`openSharedNote()`, `openSyncSetup()`), [ADR-0086](0086-status.md) (`useCopy`), [ADR-0087](0087-forms-and-questions.md) (the form layer, `useConfirm`), [ADR-0106](0106-note.md) (the note's top line and More).
- **Design:** briefs N5, N6 and N7 of the undrawn-areas design (no Figma frame); cross-app decisions §4 (wrong password), §5 (a setting saves silently, `RadioRow`s for choices that need a sentence), §10 (questions, focus on Cancel), §12 (words, toasts), §14 (form 640).

The passphrase, share and open-a-link forms were plain dialogs drawn with hand-made inputs, a tinted warning box and a toggle group; a locked note showed a round icon and a centred column; Quick Note was a side sheet with a link chip, pill buttons and a 15 px textarea. The briefs give each the app's layers and parts. The lock's crypto, `sealed.ts`, the share links and the sync protocol are unchanged.

## Decisions

### Locked notes (`features/notes/lock.tsx`, brief N5)

- **Lock notes, the first time,** in the form layer (`FormLayer`, 640 on a desktop, the whole screen on a phone): overline LOCKED NOTES, title "Lock notes", the line "One passphrase opens every locked note, on all your devices.", a compact warning `Banner` "Forget it and locked notes can't be opened. Nobody can reset it.", then `TextField`s PASSPHRASE ("At least 6 characters."), AGAIN ("Doesn't match yet." while they differ) and HINT (OPTIONAL) ("Shown on request, to anyone who opens a locked note."). One primary, SET PASSPHRASE, held back until the two match. A failed save keeps the form open with the core's words in its banner. Typed text asks "Discard changes?" on close.
- **Unlock notes** (locking another note while notes are locked) is the same layer with PASSPHRASE, UNLOCK and, where the device holds the identity, UNLOCK WITH YOUR IDENTITY at the footer's start.
- **A locked note while notes are locked** stays in the note's own space: its top line (ending `// LOCKED`) and toolbar, the title at the note's own size 4 px under it, "This note is locked.", PASSPHRASE, a primary UNLOCK and a secondary UNLOCK WITH YOUR IDENTITY where the device offers it. SHOW HINT is a text button inside the field, only when a hint exists; pressed, the hint becomes the field's helper ("Hint: …"). A wrong passphrase is the field's error, "That isn't the passphrase." (the core's "that passphrase isn't right"; decisions §4). The column is the focus width (432).
- **Lock now** is in the note's toolbar on a desktop while locked notes are open (and stays in the phone's More sheet): every locked note closes. The 10-minute idle lock is the core's, unchanged.
- **Remove lock** asks through `useConfirm`: "Remove the lock?", "The note's text is no longer sealed.", REMOVE, focus on Cancel; then the toast "Removed the lock from {title}". The toast names a locked note by its summary's title (it used to say "note").
- A shared note offers no Lock note, and a locked note no Share… (as ADR-0106 built the menu).

### Sharing a note (`features/notes/share-dialog.tsx`, brief N6)

- **`Share "{title}"`** is an `AdaptiveDialog` at `form` (640; a sheet on a phone), in three states:
  - **No notes relay:** "Sharing works through your notes relay, the same one that syncs your devices." and a secondary OPEN SYNC, which closes the form and calls `openSyncSetup()`. The note no longer mounts its own relay dialog.
  - **Not shared:** a `RadioGroup` "People with the link" of two `RadioRow`s, CAN EDIT ("Anyone with the link can change this note.") and CAN VIEW ("Anyone with the link can read it."); CANCEL and the primary CREATE LINK.
  - **Shared:** `FieldRow` LINK with the link cut in the middle and COPY LINK (`useCopy`: "Copied" for 2 s, no toast); `FieldRow` PEOPLE WITH THE LINK, "Can edit" or "Can view", with CHANGE opening an `AdaptiveMenu` of the two; a secondary EMAIL IT (the composer, as before); a text STOP SHARING at the footer's start, which asks "Stop sharing?", "The link stops working.", STOP SHARING, then toasts "Stopped sharing {title}". No primary: nothing is left to confirm.
- **The captions,** in both of the last two states: "Images in the note stay with you." and, when the share (or a new one) has no key, "Your relay can read shared notes, as it can read the rest."
- **A mode change saves silently** (decisions §5): the row shows the new mode while it saves, and on failure goes back, with the core's words in a compact critical `Banner`. The old "People with the link can edit" toast is gone.
- Rows are `stacked` on a phone (brief 4.0).

### Opening a shared note (`share-dialog.tsx`, `use-add-shared.ts`, brief N6)

- **`OpenSharedLink`** (through `openSharedNote()`, from Notes' folders at every width) is in the form layer: overline SHARED NOTES, title "Open a shared note", a `TextField` LINK ("Paste the link someone sent you."; the error "That isn't a shared-note link."). A link that parses shows what it opens as `FieldRow`s: NOTE (or CONVERSATION), FROM, YOU CAN (Edit or Read). The primary is ADD TO MY NOTES, or OPEN IN TEAM for a conversation's link (`useOpenTeamLink`, which shows Team).
- **The toast** is "Added {title} to your notes"; when the owner's relay can't be reached yet, the same with "Its text arrives once the owner's relay can be reached".
- `SharedPreview` (the conversation's shared-note card) is unchanged; it belongs to the mail screens.

### A guest's note (`features/notes/sync-runner.tsx`, brief N6)

- The overline ends `// SHARED // YOU CAN EDIT` or `// YOU CAN READ` (built in ADR-0106; asserted here).
- When the owner stops: the toast "{Owner} stopped sharing {title}" with the line "It's your own note now".

### Quick Note (`features/notes/quick-note.tsx`, brief N7)

- **An `AdaptiveDialog` at `form`** (640), a sheet on a phone (DC4). Header: the overline `QUICK NOTE // {WHAT IS OPEN}` with a text button UNLINK beside it (LINK again once unlinked; focus goes back to the words), the title "Quick note", close.
- **Free text with no box** (`.quick-note-text`: the body role, the note's placeholder ink), placeholder "The first line is the title.", focused on opening; ⌘/Ctrl+Enter is DONE.
- **HERE ALREADY:** when notes already link to what is open, a `SectionHeader` with their count and every one as a `NoteRow`. Opening one saves what was typed first.
- **One primary, DONE.** Esc, close and a press outside save too, as before; an empty note is dropped. The toast is "Saved to Notes" with OPEN.
- **Reached by** ⌥N (now never for a team member), quick create, ⌘K and the Quick note button where a conversation, event or person shows its notes. The ⌥N hint that sat in the old header is in the keys list (X7).

### Demo scenarios (`core/demo-scenarios/notes.ts`)

- `notes-locked`: a passphrase with a hint is set, the cabin packing list is locked, and notes are locked now.
- `notes-relay`: a notes relay on this device (`ws://localhost:1`, no key), so the share form has its link states. Nothing listens there: the socket is refused on the machine and never leaves it, so the status line says CONNECTING.
- `notes-guest`: the design review agenda is shared with you to edit.

## Verification

- `tsc -b`, `oxlint` (no warnings), `vite build` (the app and the demo) and the notes relay's tests pass.
- **Ratchet, counted by reading:** className 87 → 80, style 0, spread 0, plain buttons 11. The look-alike estimate finds none (the exports are `ShareNote`, `OpenSharedLink` and `AskPassphrase`; as `…Dialog` over the form layer they read as look-alikes of `Dialog`).
- **In the browser** (`pnpm shots`, desktop 1440 × 900, phone 390 × 844 and medium 768 × 1024, graphite and stone): `notes-lock`, `notes-unlock`, `notes-share`, `notes-share-shared`, `notes-open-shared`, `notes-guest`, `notes-quick-note`. Asserting scenes: passphrases that differ say so and hold SET PASSPHRASE back, the lock toast and overline, Lock now closing the note (`notes-lock-form`); the hint only on request, the wrong passphrase's words, unlocking (`notes-unlock-hint`); Remove lock asking with focus on Cancel, Cancel keeping it, REMOVE and its toast (`notes-lock-remove`); a view link created, COPY LINK saying Copied with no toast, CHANGE to edit, STOP SHARING asking with focus on Cancel, and its toast (`notes-share-link`); the privacy captions; OPEN SYNC without a relay (`notes-share-no-relay`); the wrong-link error and OPEN IN TEAM (`notes-open-shared-wrong`); a guest's overline and menu (`notes-guest`); Quick Note from a conversation saving with "Saved to Notes" and OPEN, then listing the note under HERE ALREADY (`notes-quick-note`); UNLINK and Esc saving with no link (`notes-quick-note-close`). Every notes, shell, search, status and command scene passes (322 of 322).
- **With a real notes relay** (`tools/notes-relay`, a fresh data folder, a free local port): an owner created a link, a guest in a second browser context added it ("Added Cabin packing list to your notes", `// SHARED // YOU CAN EDIT`), the guest's new line reached the owner, and when the owner stopped sharing the guest got "Personal stopped sharing Cabin packing list" with "It's your own note now".

## Consequences

- The three forms and Quick Note use the same layers as the rest of the app; the hand-made inputs, the tinted warning box and the pill buttons are gone.
- `ShareNote` takes no `onSetUpSync` any more (it is accepted and ignored, so callers keep compiling); OPEN SYNC goes through the intent.
- Not verified here: the identity unlock on a real device, the idle lock's timing, iOS's keyboard over the phone forms.
