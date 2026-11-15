# ADR-0094 · Writing a message: the compose dialog and the full-screen form

- **Status:** Accepted for the build. It records no recorded decision (DC) of its own; it cites DC4 and DC10 (ADR-0087, the form layer and what closing asks) and W2 (no drafts, no Bcc). Everything else builds brief M6 as written.
- **Date:** 2026-11-14
- **Builds on:** [ADR-0041](0041-their-time.md) (their local time and their morning), [ADR-0055](0055-power-settings.md) (read receipts, where a reply starts), [ADR-0086](0086-status.md) (the sending strip and status line), [ADR-0087](0087-forms-and-questions.md) (the form layer, the leave guard), [ADR-0088](0088-date-parts.md) (the date-and-time picker), [ADR-0089](0089-writing-parts.md) (the recipient field, the rich-text field, the format bar).
- **Design:** Desktop / 02 Mail — Compose (`36:882`, stone `53:2465`) and Mobile / 03 Mail — Compose (`34:174`, stone `53:2085`); brief M6 of the undrawn-areas design; brief 4.0 (disabled with a visible reason, errors, toasts); cross-app decisions §1, §9, §10, §12, §14.

Before, the composer held the old tools inside the new layer: a FROM select, a row of loose icon buttons with a sentence about undo, Cancel beside SEND, the format bar always open, attachments as rounded pills, the scheduled time and their hour as tinted strips, and Save as template as a dialog of its own. This slice draws it as the frames do and brief M6 completes it.

## Decisions

### The dialog (desktop and medium, compose 720)

1. **Header:** overline `NEW MESSAGE // {ACCOUNT}`, `REPLY //` for a reply (the draft answers a message), `FORWARD //` for a forward (its subject starts `Fwd:`); the subject as typed is the title, "New message" (or Reply, Forward) while empty; the close button.
2. **Fields, in order:**
   - **FROM**, a `FieldRow` (the name and the address in mono, `Personal // me@personal.example`), only with two or more accounts. CHANGE opens an `AdaptiveMenu` of the accounts (radio). Changing it swaps the signature in the body, as before.
   - **TO**, the shared recipient field, with the CC text button beside its box (ChipField has no trailing slot: ADR-0089's gap 1).
   - **CC**, once asked for or when the draft has one.
   - **SUBJECT**, a `TextField`.
   - **MESSAGE**, the shared rich-text field: 144 px (six lines) at least, growing, with the signature in it. The frame draws two lines; rules 8.5 wins.
3. **One notice at a time**, a compact `Banner` between SUBJECT and MESSAGE, the first that applies: the server's error (critical, `role="alert"`) · "Add an account to send." with OPEN ACCOUNTS (info) · "Sends {time}." with SEND NOW INSTEAD (info) · "It's {their time} for {first name}. Night there." with SEND {9:00 AM} FOR {NAME} (info, `useLocalTimes`). The error moved here from the form layer's banner above the footer, so the message has one notice slot.
4. **Attachments** are unicron `FileChip`s in a wrapping row under the message, each with its own Remove. Over 25 MB in all, the critical line "31 MB attached. Most servers take 25 MB." (whole megabytes, rounded up; base64 padding is no longer counted as file). Files dragged over the layer draw a 2 px primary edge inside it (`rule-box-emphasis`) and "Drop to attach".
5. **Footer, left:** a `Toolbar` "Message tools", one Tab stop: Attach files · Formatting (a toggle; off by default, it shows the format bar on the message's bottom edge and stays as left for the session) · Templates (an `AdaptiveMenu`: each template, Save as template…, and Signatures and templates… where that section exists) · Remind me if no reply (In 1 day, In 3 days, In 1 week, a radio group; No reminder once set) · More (Ask for a read receipt, checked or not). Once set, the reminder is a `Chip` "Remind in 3 days" with its remove.
6. **Footer, right:** the `SplitButton`, the layer's one primary: SEND (SCHEDULE with a send time) and its `chevron--down` half, Send later: today's presets, their morning, Pick a time… (f7's picker, anchored beside it) until a6 rebuilds send later. In the demo, "Demo. Nothing leaves." stands beside it.
7. **No Cancel** (the form layer gains an optional `cancel`; every other form keeps its Cancel). Closing is the close button or Esc, and asks "Discard changes?" through the leave guard whenever the message holds a recipient, a subject, text or a file, a message reopened by Undo too. No SAVE DRAFT, no Bcc (W2), no Reply all.
8. **Send is off with a visible reason** and stays in the tab order (`focusableWhenDisabled`, `aria-describedby`): a wrong address (the line under its field, "Fix or remove the address in red."), too much attached (the 25 MB line), no account (the notice).
9. **Keys:** ⌘ or Ctrl + Enter sends; Esc closes and asks; ⌘K stays off while writing (the command menu already skips it); a reply starts in the body, new mail and a forward in TO.

### The phone (Mobile / 03)

- **Top row:** close · the title · the send float button. Held (or Shift+Enter, the context-menu key, a right click), it opens Send later; the form layer's primary gains optional `onLongPress`, `longPressLabel` and `describedBy`.
- **Fields:** FROM as a stacked `FieldRow` (CHANGE with two or more accounts), TO with CC, CC, SUBJECT, the notice, then the body with no box (`RichEditor bare`, flush with the fields).
- **The foot:** Attach and More as neutral float buttons. More is a sheet: Send later…, Templates…, Remind me if no reply…, Ask for a read receipt, Formatting. Each opens its own sheet by an anchor.
- **Formatting** shows f8's bar in its keyboard mode at the foot; with the keyboard up, it takes the foot's place.
- No strip over the form but the sending strip (as ADR-0087 left it).

### Save as template

A form of its own in the form layer, beside the message so it dims it: overline "Save as template", the name as typed as title, NAME, primary SAVE TEMPLATE (off until named), Cancel. The toast "Saved {name}". The template is the message without its signature.

### Scenes and scenario

- **Kept:** `mail-compose` (now Sean's drawn `mail--compose`, and at medium), `mail-reply`, `mail-send-later` and `mail-send-later-time` (a phone opens Send later from More), `discard-question` (the close button, not Cancel), `mail-format-bar` (turns Formatting on first; a phone's bar is at the foot), `form-layer-compose` (no Cancel; a phone's Send has the long press), `mail-recipients`.
- **New, all asserting:** `mail-compose-cc` (sends with chips, Cc, a dropped file, a template, a reminder and a read receipt; UNDO brings all of it back; a file's Remove), `mail-compose-invalid`, `mail-compose-big` (a 31 MB file made by the scene; Drop to attach), `mail-compose-no-account`, `mail-compose-discard` (the close button asks; a message reopened by Undo asks), `mail-compose-notices` (the server's error, a send time with SEND NOW INSTEAD, their hour with their morning; one at a time), `mail-template-save`.
- **Scenario** `send-refused` (`core/demo-scenarios/mail.ts`): the server refuses the next message once, in its own words.
- `helpers.mjs`: `formLayer` takes `cancel: false`.

## Verification

- `check-mail-search.sh`: typecheck, lint (no warnings), build:demo, build, the notes-relay tests, the ratchet read from the source, the lockfile proof: exit 0.
- **Ratchet:** className **89 → 88** (`.dsa/baseline.json` lowered, `dsaVersion` kept); style 1, spread 0, raw buttons 14 unchanged. Look-alikes by the estimator: 0 (the form was renamed `WritingForm`, since `ComposerForm` reads as a look-alike of unicron's `Composer`).
- **In the browser** (`pnpm shots`, phone 390 × 844, desktop 1440 × 900 and medium 768 × 1024, graphite and stone), asserting scenes: the overline, FROM with CHANGE, no Cancel, no Save draft, no Bcc, the message 144 px at least, the five tools in order, the split button; Ctrl+Enter sends with chips, Cc, an attachment, a template, a reminder and a read receipt, and UNDO restores them; each of the three disabled reasons is on screen, tied to Send, and Send keeps its Tab stop on a desktop; the notices one at a time; closing asks, also after UNDO; Save as template's toast and its place in Templates. Compared by eye with `desktop-02-mail-compose.png` (and stone) and `mobile-03-mail-compose.png`.

## Consequences

- `FormLayerForm` gains optional `cancel`, and `FormPrimary` optional `describedBy`, `onLongPress`, `longPressLabel`; `RichEditor` gains optional `bare`. The layer's context moved to `components/form-layer-context.ts` with `useFormLayerClose()`, and the layer now focuses the newest layer's first field.
- The calendar lane's `picker-keys` scene opens Send later from a "Send later" button; on a phone that button is gone (brief M6: a long press or More). That scene needs More › Send later… on a phone at the merge.
- `send-later.tsx`'s `FollowUpAfterMenu` has no caller any more; a6, which rebuilds send later, retires it.
- A phone's disabled Send cannot keep its Tab stop: unicron's `FloatButton` has no `focusableWhenDisabled` (a gap). Its reason is on screen and in `aria-describedby`.
