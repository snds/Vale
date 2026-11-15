# ADR-0095 · Send later, the Outbox, failed sends, snooze and reminders on mail

- **Status:** Accepted for the build. It records **DC9 as Proposed**: the lane "Scheduled" becomes the **Outbox**, with SENDING, NOT SENT and SCHEDULED (question Q3 for Sean). It cites W9 (no call to clear a failed send) and DC4 and DC10 (ADR-0087, what closing a form asks). Everything else builds briefs M7 and M8 as written.
- **Date:** 2026-11-14
- **Builds on:** [ADR-0041](0041-their-time.md) (their morning), [ADR-0086](0086-status.md) (the sending strip and status line, section banners), [ADR-0087](0087-forms-and-questions.md) (the form layer, the leave guard), [ADR-0088](0088-date-parts.md) (the date-and-time picker), [ADR-0113](0113-mail-lists.md) (message rows on unicron's `ListRow` and `SwipeRow`), [ADR-0094](0094-writing.md) (the compose dialog and its `SplitButton`).
- **Design:** briefs M7 and M8 of the undrawn-areas design; brief X4 (the Mail banner for a failed send), X6 (EDIT on a scheduled message and closing it), 4.0 (toasts, swipes, empty states), 5.2 (the Outbox's empty copy); cross-app decisions §1, §9, §10, §12, §13. Figma draws none of it.

Before, a scheduled message was a row with four inline buttons in a lane named Scheduled; a send in its undo window had no place but the strip; a failed send raised a toast on its event only and then had no home at all. Send later, Snooze and Remind me if no reply were three menus with three ways of writing their times.

## Decisions

### Send later (brief M7)

1. **One list in two forms**, in `send-later.tsx`: `SendLaterItems`, the rows of the compose dialog's `SplitButton` menu, and `SendLaterMenu`, an `AdaptiveMenu` (a menu on a desktop, a sheet on a phone) for the phone's composer and the Outbox's CHANGE TIME.
2. **The rows:** the mono label SEND LATER; `sendLaterOptions` each with its time in mono, as rows write times (`Fri 08:00`); a THEIR TIME group when a recipient lives in another zone (ADR-0041's morning, at most two); then **"Pick date and time…"**, f7's picker titled Send later with the line "If the desktop app is closed then, it sends when it next opens. A gateway sends on time." and SCHEDULE.
3. **After Send now:** f5's sending strip and status line, then "Sent {subject}". **After Send later:** "Scheduled {subject} for {time}" with UNDO, which reopens the message with its time.
4. `FollowUpAfterMenu` and `FollowUpAtMenu` had no caller and are gone; the composer keeps its delays (brief M6), the conversation its times (below).

### The Outbox (brief M7; DC9 and Q3, proposed)

1. **Renamed in `lanes.ts`**, so the sidebar, the page head's sheet and the command menu all say Outbox; the id stays `scheduled`, so a place kept anywhere still opens it. The phone strip's open action says "Open Outbox".
2. **Page head:** overline `OUTBOX // 03` (with the account where one is chosen), title Outbox. **Empty:** `OUTBOX // 00`, "Nothing waiting to go.", "Use the arrow beside Send to send later." A failed read with nothing to show is the critical empty state with TRY AGAIN.
3. **Sections, each only with rows**, every row the message `ListRow`:
   - **SENDING** (`listOutbox`, queued and not scheduled): "To {names}", the seconds left (`08 S`), subject, preview, and a trailing UNDO that takes it back and reopens it.
   - **NOT SENT** (failed): `Badge tone="critical"` NOT SENT, the error as the preview; EDIT in its menu only, and no swipe.
   - **SCHEDULED** (`useScheduled`'s set): `send--alt` and the send time; the menu holds SEND NOW and CHANGE TIME…, and the swipe EDIT (inner) and DELETE (outer, the full swipe, since its UNDO queues it again).
4. **Opening a row** shows it read-only in the detail column, pushed on a phone: `MetaList` TO, FROM, SENDS (or FAILED); the subject as title; the body; that section's actions as secondary buttons. Nothing is primary.
5. **EDIT on a scheduled message** takes it out (`cancelSend`) and opens the composer with its time. The composer's draft carries `outbox` (the message as it waited and its time, a new optional field of `ComposerDraft`): closed **unchanged** it asks nothing and goes back, "Back in Outbox for {time}"; closed **with changes** it asks "Discard changes?", and DISCARD puts the original back the same way. If its time has come meanwhile, the toast says it could not go back, in the core's words, with EDIT.
6. **DELETE** says "Deleted {subject}" with UNDO, which queues it again with its time. **CHANGE TIME** says "Moved {subject} to {time}". **SEND NOW** sends at once (`rescheduleSend(id, null)`), and the send's own toast says "Sent {subject}".
7. **EDIT on a failed send** opens a copy of its message. The failed row stays, because the core keeps failed items and has no call to clear one (W9, a wish for Sean).

### A failed send, said once (brief M7, X4)

Four things, each once per failed item: the toast "Not sent: {subject}" with EDIT, which stays until closed; the Mail banner, "Not sent: {subject}" with the error and EDIT, or "{NN} messages not sent" with OPEN OUTBOX for two or more (after an account that stopped syncing, which keeps the one banner slot); the NOT SENT row; and the Outbox nav item in `tone="critical"` ("Outbox, a message not sent"). The device keeps the ids it has toasted and the ids that were seen (`localStorage` `vale.outbox.shown`, read in a try, the session's memory when there is none); opening the Outbox or pressing EDIT counts as seen, which takes the banner, the tone and the toast away. The toast now comes from the outbox list itself, so a send that failed while Vale was closed is said too.

### Snooze and reminders (brief M8)

1. **One `LaterMenu`** in `snooze-menu.tsx`, for Snooze (the toolbar, a phone's More, by its anchor) and Remind me if no reply (More, only on a thread with your mail in it): the mono label (SNOOZE UNTIL, REMIND ME IF NO REPLY) as the desktop menu's first line and the sheet's title, `snoozeOptions` with their times in mono, then "Pick date and time…" (the picker's SNOOZE or SET REMINDER).
2. **Toasts:** "Snoozed {subject} until {when}" with UNDO (unchanged); "Comes back {when} if nobody replies", here and from the row's Remind me in 3 days. Once set, More offers Cancel reminder (unchanged). The composer's list stays delays.
3. The row menu's Snooze until submenu keeps its shape (ADR-0113); its times are unchanged.

### Scenes and scenario

- **Kept:** `mail-send-later` (now Sean's undrawn `mail--send-later`, asserting the label, the times and Pick date and time…), `mail-send-later-time` (asserting the line and SCHEDULE), `mail-snooze-menu` (Sean's `mail--snooze`), `mail-scheduled` (the empty Outbox).
- **New:** `mail-outbox` (Sean's `mail--outbox`; the three sections, `OUTBOX // 03`, the seconds, NOT SENT, the time; nothing critical once open), `mail-outbox-row`, `mail-scheduled-actions` (the tiles on touch; CHANGE TIME; EDIT and close unchanged; DELETE and UNDO; SEND NOW), `mail-send-undo` (UNDO from the strip or the status line reopens the message; sent, "Sent {subject}"; scheduled, the toast with UNDO), `mail-send-fails` (Sean's `mail--not-sent`; one toast, one banner, the critical tone), `mail-send-fails-seen` (after the Outbox, and after a reload, none of them again; the row stays once), `mail-send-fails-edit`, `mail-remind-no-reply` (Sean's `mail--remind`). The brief's "unit test with a client stub" is `mail-send-fails` and `mail-send-fails-seen` on the `send-fails` scenario: the repo has no web unit tests.
- **Scenario** `outbox` (`core/demo-scenarios/mail.ts`): a reply in its undo window, a failed send and a scheduled one.
- Changed words in other scenes: `shell.mjs` (the strip opens the Outbox), `mail.mjs` (the folders list, the reminder toasts, Pick date and time…).

## Verification

- `check-mail-search.sh`: typecheck, lint (no warnings), build:demo, build, the notes-relay tests, the ratchet read from the source, the lockfile proof: exit 0.
- **Ratchet:** className **88 → 82** (`.dsa/baseline.json` lowered, `dsaVersion` kept); style 1, spread 0, raw buttons 14 unchanged. Look-alikes by the estimator: 0.
- **In the browser** (`pnpm shots`, phone 390 × 844, desktop 1440 × 900, and medium 768 × 1024 for the Outbox; graphite and stone), the asserting scenes above.

## Consequences

- `ComposerDraft` gains optional `outbox`; `features/mail/outbox.ts` holds the Outbox's data and actions and the shown ids, so the views stay component-only.
- The calendar lane's `picker-keys` scene presses the composer menu's "Pick a time…", which is now "Pick date and time…" (brief M7). It needs that word at the merge.
- A failed send cannot be dismissed (W9): it stays in NOT SENT until the core can clear it. Q3 asks for one call to do that.
