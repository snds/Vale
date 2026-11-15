# ADR-0113 · Mail lists: message rows, triage swipes on unicron's SwipeRow, the drawn list states

_Numbered 0090 in its lane; renumbered at the merge, because the gateway work on the same branch took 0090 first._

- **Status:** Accepted for the build. **DC2 and DC11 are proposals for Sean** (below): the four swipe slots fill the four drawn tiles, which changes [ADR-0025](0025-one-action-grammar.md); rows lose faces, which changes [ADR-0027](0027-faces-and-sources.md).
- **Date:** 2026-11-14
- **Builds on:** [ADR-0083](0083-shell.md) (the shell), [ADR-0084](0084-places.md) (Mail's places), [ADR-0085](0085-search-place.md) (the `MessageRow` adapter), [ADR-0086](0086-status.md) (the section banner, `LoadState`, `checkMail`), [ADR-0088](0088-date-parts.md) (`DateTimePicker`).
- **Design:** Mobile / 01, 06, 07; Desktop / 01 (list column), 04, 05; States / 01 and 04; brief M1 and sections 4.0 and 5.2 of the undrawn-areas design; cross-app decisions §9, §10, §12 and §13.

Every lane listed conversations on the old local `EntryRow`: a face, a dot for unread, the time in the browser's words, and a swipe of Vale's own (`RowSwipe`) that showed one action at a time. The frames draw unicron's message row, three trailing tiles and one leading tile, and their own empty, loading and sync-error states. This slice builds all of it on unicron's parts.

## Decisions

### The row

`features/mail/message-row.tsx` (`MessageRow`, f4's adapter, extended with an optional `menu`) on `ListRow layout="message"`:

| Part | Shows | From |
|---|---|---|
| Sender | the sender's name; "To {name}" for your own sent mail | `from`; `sentTo` |
| Count | the thread's messages after the sender, two digits, only above 1 | `threadCount` |
| Marks | `star--filled`, then `attachment`, 16 px | `flagged`, `hasAttachments` |
| Tag | Badge NO REPLY YET, Inbox only, once a reminder came due | `followUpAt` ≤ now |
| Account | before the time, with two or more accounts and All chosen | `accountId` |
| Time | the clock today (`09:14`), the weekday this past week (`WED`), else `11.04`; a time to come keeps its clock (`FRI 08:00`). Snoozed adds `time`, Waiting adds `notification` before it | `sortAt`, `snoozedUntil`, `followUpAt` (`row-time.ts`) |
| Unread | the 6 px square | `seen` |
| Subject | cut to one line with `TruncatedText`; "(no subject)" | `subject` |
| Preview | two lines | `preview` |

No face (DC11, Q8). Search lists the same row, so its times change with it.

`VirtualList` takes a per-row estimate: 120 for a two-line preview, 100 otherwise (the rows' own heights). Pages load as before; three skeleton rows stand at the end while one does.

### Row actions without a gesture

The row's menu (`features/mail/lane-list.tsx`): the overflow button (on hover and focus with a mouse, always on touch), right-click, the Menu key and Shift+F10, all unicron's. It lists the swipe slots' actions first (SwipeRow adds them), then the rest of the brief's, each once:

- Archive, or Move to Inbox in the Archive lane;
- Snooze until ▸ the presets with their times, and Pick date and time… (f7's picker, titled Snooze);
- Star or Unstar;
- Mark read or Mark unread;
- Remind me in 3 days, where the conversation can hold your own message;
- Always in Newsletters, except on your own mail.

### Swipes (DC2)

`features/mail/swipe-row.tsx` (`RowSwipe` and its `Reveal`) is gone. Each row is in unicron's `SwipeRow`, and the four stored slots fill the four drawn tiles:

| Tile | Slot | Core default | Tone |
|---|---|---|---|
| Leading (swipe right) | `right` | READ | primary |
| Trailing, inner | `rightLong` | Nothing | neutral |
| Trailing, middle | `leftLong` | Nothing | neutral |
| Trailing, outer: the full swipe | `left` | ARCHIVE | primary |

- A tile names what it will do: READ or UNREAD, ARCHIVE or INBOX, STAR or UNSTAR, SNOOZE, REMIND, NEWSLETTERS. A slot set to Nothing shows no tile; a slot that repeats another's action shows none either.
- Only read, archive, star and snooze are `reversible`, so only they run on a full swipe (each toggles or toasts an Undo). Remind and Always in Newsletters open the row and stop.
- The leading swipe starts 24 px from the edge, and a vertical drag scrolls: unicron's own rules.
- The Screener keeps its pair: LET IN leading (a full swipe runs it; its toast has Undo) and SCREEN OUT trailing (never on a full swipe).
- The defaults stay where the core keeps them (`crates/` and `core/demo.ts`, out of bounds in this pass): READ and ARCHIVE, the other two Nothing. The `swipes-drawn` demo scenario sets STAR and SNOOZE through the client's own `setSwipeActions`, as Settings would, to show and test the drawn tiles. **Q4.**
- "Star", not "Flag", in the tile and the menu. **Q7.**
- `vocabulary.ts` keeps `SWIPE_CHOICES` and `useMailVerbs` for the key and swipe settings. A verb is now `{ icon, label, reversible, onAction }`; `PRIMARY` stays, deprecated, for anything that still reads it.

### The page head

Overline `{LANE} // {ACCOUNT}`: the account's name, ALL ACCOUNTS, or nothing with one account. No unread count (W1). The title is the lane's name; the Inbox keeps "Today" and `THU 11.12`. The category chips do not show when there is no account.

### The Inbox's sync banner (Mobile / 07, Desktop / 05)

The section banner from ADR-0086 now reads "{Account} account stopped syncing", the server's words, then "{Account} mail stops at 08:36." from `lastSync`.

- An account signed in with its provider (`oauth`) gets SIGN IN, through the core's `reauthOAuthAccount`. A failed sign-in puts its words in the banner, beside the button (cross-app decisions §9). Any other account gets OPEN ACCOUNTS.
- On a desktop the banner spans both columns; the account's sidebar row is critical (ADR-0084); the detail column's nothing-open line says "{Account} mail stops at 08:36."

### States

| State | What shows |
|---|---|
| Loading | five skeleton rows (unicron's `Skeleton variant="row"`: two bars 20 apart, over a hairline), named for the lane |
| Loading more | three more at the end |
| A failed read | `LoadState`: the last good list under a critical banner with TRY AGAIN, or the critical empty state |
| Inbox empty | `INBOX ZERO // 09:16`, "Nothing left today.", "Snoozed mail comes back at 8:00 AM tomorrow." only when something is snoozed, OPEN ARCHIVE. No "handled since" line (W1) |
| Desktop, Inbox empty | the detail column lists the snoozed mail: `SNOOZED // BACK AT FRI 08:00 02` and its rows; a row opens its conversation (MasterDetail's new optional `idle`) |
| Another lane empty | brief 5.2's words, `{LANE} // 00` |
| No account | MAIL, "Add your first account.", ADD ACCOUNT → `startFirstRun()` |
| A row leaves its lane while open | the conversation stays open (unchanged) |

### Words

Toasts name the conversation: "Archived Re: Token audit", "Moved … to Inbox", "Snoozed … until tomorrow" (cross-app decisions §12).

### Out of the lists

`components/list-row.tsx` is no longer imported by Mail. The face query (`useContactPhotos`) is no longer read by the rows.

## DC2 (proposal)

ADR-0025 gave a swipe two stages each way: a short swipe and a long one. The frames draw three tiles behind a left swipe and one behind a right swipe. The four stored slots now fill those four tiles, so the long right swipe becomes the inner trailing tile, and the long left swipe the middle one. Settings still names them "Swipe right, all the way" and "Swipe left, all the way" (`features/grammar.tsx`, the notes-settings lane's c8). **Question for Sean (Q4):** may the core's defaults for the two inner tiles change from Nothing to Star and Snooze, and is the slot move right, or should Vale show only the tiles that are set?

## DC11 (proposal)

ADR-0027 put a face on every row with a contact card. The frames draw none. Rows lose the face; an open message keeps its photo in its head (a3), and contact rows follow (b5). **Question for Sean (Q8):** confirm.

## Not built, and why

- **The chips row, the Screener pointer and the bundle row** stay as they were: brief M2 and M3 (a2).
- **Unread and folder counts:** the core has none (W1).
- **Sent, Drafts and Spam lanes:** not lanes in the core (W7).
- **A full-text tooltip on a cut sender:** the sender sits inside the row's main control, and a tooltip trigger there would nest controls; `ListRow` cuts it with an ellipsis and the whole name is in the row's accessible name.
- **The row's menu as a sheet on a phone:** `ListRow` draws a dropdown menu at every width.

## Checks

- Scenes in `scenes/mail.mjs`, all asserting: `mail-inbox` (no faces, times as drawn, the overline, the overflow button on touch), `mail-row-facts` (count, star, attachment, account, NO REPLY YET, Remind me in 3 days from Shift+F10), `mail-snoozed` (when it comes back), `mail-sync-error`, `mail-sync-error-sign-in`, `mail-inbox-zero`, `mail-loading`, `mail-no-account`, `mail-swipe-left` and `mail-swipe-right` (the drawn tiles), `mail-swipe-checks` (a touch swipe shows the slots' tiles; a vertical drag scrolls and opens nothing; a full swipe archives and UNDO restores), `mail-screener-swipe` (SCREEN OUT never runs on a full swipe), `mail-row-menu` (every action from the overflow button and from Shift+F10, the picker, focus back on the row).
- `status-sync-error` (`scenes/shell.mjs`) looks for "Open accounts", the button's new words.
- Ratchet, read from the source: className overrides 117 → 114; 1 style, 0 spread, 14 plain buttons; 0 look-alikes by the estimator.
