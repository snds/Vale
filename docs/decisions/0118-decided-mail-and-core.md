# ADR-0118 · Decided changes: Mail, the status, Search, Team, and three new core calls

- **Status:** Accepted. Decided on Sean's behalf on 2026-11-16 (`rebuild-questions-decided.md`, Vale 1, 6, 15, 16, 17, 22, 33, 35, 39, 43) with the three cross-app settlements of the same day.
- **Date:** 2026-11-16
- **Builds on:** [ADR-0086](0086-status.md), [ADR-0087](0087-forms-and-questions.md), [ADR-0093](0093-message-carries.md), [ADR-0095](0095-outbox.md), [ADR-0096](0096-search-and-commands.md), [ADR-0060](0060-team-conversations.md), [ADR-0113](0113-mail-lists.md), [ADR-0115](0115-review-fixes.md).

## Decisions

### Mail

- **ALL on the accounts (Vale 1).** While an account is chosen, the ACCOUNTS heading has an ALL text action ("Show all accounts"). Pressing the chosen account again still works; there is still no "All" row. Scene `mail-folders-sheet`.
- **An untouched reply closes without asking (Vale 22).** `replyDraft` marks a reply that opens with no words of its own `fromReply`; the composer then asks "Discard changes?" only once the recipients, subject, text, files or times differ from what Reply filled in. A reply that opens with words and a message reopened by Undo send ask as before. Scene `discard-question`.
- **UNDO after DONE is whole (Vale 33).** Archiving a conversation a reminder brought back dismisses the reminder, so every archive's UNDO now also puts the reminder back at its own time through the new core call `restore_follow_up(threadId, dueAt)` (the time may have passed; `set_follow_up` refuses the past). Core test `undo_after_done_brings_the_reminder_back`; scene `mail-needs-you-done` asserts the row says NO REPLY YET again and the block is back.
- **A failed send can be cleared (Vale 35, W9).** NOT SENT rows get DELETE (the row's menu, a full swipe, the message's buttons) through the new core calls `clear_failed_send(id)` and, for UNDO, `restore_failed_send(id)` (state `cleared`, no schema change). Toasts that name a time ("Moved … to …", "Back in Outbox for …") use the device's format (`longTime`). Core test `a_failed_send_can_be_cleared_and_put_back`, dispatch test in `compose_commands`; scene `mail-send-fails-edit`.

### The status

- **Offline stays put (Vale 15).** On a phone a toast stands above the Offline strip (Unicron 1.1's `above-strip` placement) and never takes its place. Scene `status-offline-toast`.
- **No endless skeletons offline (Vale 17).** Reads use React Query's `offlineFirst`: with no network a read is still tried once. A list read before keeps showing; one never read says it can't load; the status strip and line say "Offline" with the last sync. Scene `status-offline-section`.
- **A blocked copy of a long text (Vale 16).** When the clipboard refuses a value longer than two lines (`lib/copy-fits.ts`), the toast says "Couldn't copy {what}" with SHOW, which opens a 560 review dialog (`components/copy-review.tsx`) with the text selected. Up to two lines still show in the toast. Unit test `copy-fits.test.mjs`; scene `status-copy-blocked`.

### Search (Vale 39)

The kinds on screen read the words as typed; the other kinds read once typing pauses for 250 ms (`hooks/use-settled.ts`), so each chip still gets its count without a read of every kind on every key. Scene `search-other-kinds-wait`.

### Team (Vale 43)

The row time and the order are the newest message's (`latest`, schema version 24, saved with the document); your name on comments is your gateway name or your first account's address, never its label; LEAVE asks first ("Leave {subject}?", focus on Cancel). Core tests `the_team_list_is_newest_message_first` and the extended `a_teammate_joins_once_and_keeps_a_copy`; scenes `team-shared`, `team-leave-asks`, `team-row-time`. Details in ADR-0060.

### Cross-app settlements

- **Rows use clock time:** `rowTime` already writes the clock today, the weekday this week and the date before; a row's time now has its relative age in a tooltip (`relativeAge`, `features/mail/row-time-tip.tsx`) on mail rows and Team rows. Unit test `row-time.test.mjs`.
- **Counts read three digits (Vale 6):** through Unicron 1.1's `formatNavCount` / `formatListCount` in overlines, chips and badges (TASKS, REMINDERS, BOOKING LINKS, PAGES, the sending and checking lines); sentences keep plain numbers. Scenes that pinned two digits now pin three.
- **Needs-you:** Vale has nothing time-limited or blocking of this kind, so no block shows on every screen. What can wait (conversations a reminder brought back with no reply yet) shows as a count in the needs-you tone on the way into Mail (sidebar and tab bar) and as the NO REPLY YET block on Mail's home screen, the Inbox, with OPEN; the conversation keeps its own block (`features/mail/waiting-on-you.ts`). Scene `mail-waiting-on-you`.

## Consequences

- The core gains three calls (`restore_follow_up`, `clear_failed_send`, `restore_failed_send`) in `pim-app`'s dispatcher, the gateway's member list and the web client, and one column (`team_threads.latest`).
- An invitation waiting for an answer has no list-level flag in the core, so the Mail count covers reminders only; invitations keep the conversation's block.
