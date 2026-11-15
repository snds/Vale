# ADR-0093 · What a message carries: needs-you blocks, invitations, unsubscribe, signatures, shared links, the sender panel

- **Status:** Accepted for the build. It records **DC5 as Proposed** (below) and cites **Q9** (may a needs-you block hold two text actions). Everything else builds brief M5 as written.
- **Date:** 2026-11-14
- **Builds on:** [ADR-0036](0036-sender-profile.md) (the sender's profile beside a message), [ADR-0040](0040-sender-local-time.md) (their local time), [ADR-0056](0056-shared-notes.md) and [ADR-0060](0060-team-conversations.md) (share links), [ADR-0085](0085-search-place.md) (the `MessageRow` and `OccurrenceCard` adapters), [ADR-0087](0087-forms-and-questions.md) (the form layer, `useConfirm`, the leave guard), [ADR-0088](0088-date-parts.md) (the date picker), [ADR-0092](0092-conversation.md) (the conversation and its notice slot).
- **Design:** brief M5 of the undrawn-areas design; brief 3.2 (the side panel), 4.0 (states, Field Rows stacked on a phone); cross-app decisions §1, §2, §9, §10, §12 and §13. No Figma frame draws these.

Before, an invitation was a rounded grey card with a date badge, outline toggles for the answer and a native select; a cancellation a pink card; the signature offer and the shared links bordered cards; unsubscribe a plain dialog; the sender's profile a centred card in a dialog. This slice draws them as rows, rules and the one yellow block.

## Decisions

### The notice slot (`conversation-view.tsx`)

1. **One block at most, in a fixed order:** the Screener's NEW SENDER notice (a calm notice, ADR-0114), then a reminder that came due, then the newest invitation waiting for an answer (a `request`, not outdated, with no answer or `needs-action`).
2. **NO REPLY YET:** body "You asked to be reminded {when}.", a solid DONE (archives, toast with UNDO) and a text REMIND AGAIN (the reminder times, ADR-0092).
3. **INVITATION // WED 11.18:** body "{title}, 16:30 – 17:15, {location}", a solid ACCEPT and the text actions MAYBE and DECLINE. Unicron 1.0's `NeedsYou` holds two text actions (`secondaryActions`), so the brief's first answer to **Q9** is built; if Sean says one, the two become one OTHER ANSWERS menu.
4. **A second waiting thing** is a compact `ListRow` under `SectionHeader` WAITING ON YOU, and the block's title ends `// +1` (`NeedsYou more`). The reminder's row: "No reply yet", DONE, REMIND AGAIN in its menu. The invitation's row: its title, time and place, RESPOND (a menu of Accept, Maybe, Decline). Under the Screener's notice every waiting thing is a row, so an answer is never out of reach.

### The invitation in its message (`invite-card.tsx`, `invite-planning.tsx`)

One section per method, a `SectionHeader` and `FieldRow`s (stacked on a phone), no card:

| Method and state | Rows |
|---|---|
| request | WHEN (PROPOSE NEW TIME, not for a repeating event; once sent, "You proposed …" and PROPOSE ANOTHER) · WHERE · ORGANIZER `{name} // 3 invited, 1 going` · YOUR CALENDAR ("Nothing else on your calendar then", or the clash with a warning `Badge` CLASH and "and N more") · CALENDAR with CHANGE (while not in your calendar and more than one is writable) · the call rows (`MeetingPanel`) |
| request, answered | the same, and YOUR ANSWER "Going // in your calendar" with CHANGE (the three answers) |
| request, outdated | one caption |
| cancel | "{organizer} canceled this event." · EVENT (struck) · WHEN · secondary REMOVE FROM CALENDAR |
| reply | "{name} accepted your invitation." · EVENT · WHEN · the note as a quote · secondary UPDATE YOUR EVENT |
| counter | "{name} proposed a new time" · EVENT · NOW (struck) · PROPOSED · the note · YOUR CALENDAR · secondary ACCEPT NEW TIME and KEEP ORIGINAL, or the answered caption, or "This event isn't in your calendar any more." |
| declinecounter | one line, "{organizer} kept the original time." |

- **Toasts:** "Accepted {title} · added to {calendar}", "Replied maybe to {title}", "Declined {title}", "Moved {title} and told everyone", "Kept the time and told {name}", "Removed {title} from your calendar", "Updated {title}". A failed answer is one critical line beside the control, in the server's words.
- **One calendar choice** for every place that answers: CALENDAR's CHANGE sets it per message, ACCEPT reads it (`useInviteAnswer`, `invite-words.ts`).
- **EVENT** is added for cancel, reply and counter, whose subject does not always name the event; a request's title is in its block and subject.
- **Propose a new time** is on f6's form layer: overline "Propose a new time", the event as title, NEW DATE (f7's `DatePicker` behind CHANGE), STARTS and ENDS (time fields), YOUR CALENDAR for the new time (from `useOccurrences`), NOTE TO {ORGANIZER} (optional), primary PROPOSE. An end before the start is the ENDS field's error, "The new time ends before it starts.". Toast "Asked {name} about Wed 16:30". The leave guard asks once anything is changed.

### Unsubscribe, signatures, shared links

- **Unsubscribe** asks through `useConfirm`: "Unsubscribe from {sender}?", the body by method (one-click, mail with the address, web), UNSUBSCRIBE, focus on Cancel; a failed request keeps the question open with the server's words. Then one toast per method ("Unsubscribed", "Unsubscribe request sent", "Opened the sender's unsubscribe page"), each with ARCHIVE.
- **The signature suggestion** is a compact info `Banner` under the message: "{Name}'s signature has a phone number." (or "{Name} isn't in your contacts."), REVIEW (the contact form filled in) and dismiss ("Not now", for the session).
- **A Vale share link** is a Field Row SHARED WITH YOU with the title, "From {name}", and OPEN IN NOTES or OPEN IN TEAM. A team member sees only conversation links (notes are the owner's, brief 4.0). The note's live preview card is not drawn any more; opening it shows the note.

### The sender panel (`sender-profile.tsx`, `sender-panel.ts`)

- In order: Initial Tile L with the contact's photo · the name · title and company · the address in mono · their time, `22:46 there // 3 h behind // Night there // as of Oct 2026` · secondary WRITE, CALL and MESSAGE (with a phone number), OPEN CARD; or "Not in your contacts." and ADD · MAIL with the received count and `Since Nov 2026`, then up to five recent conversations as `MessageRow`s · MEETINGS as `OccurrenceCard`s (upcoming, then past) · the contact's linked notes (not for a team member).
- **Where it stands (DC5, Proposed).** ADR-0036 made it a column by container width. Now it is unicron's `AppFrameSidePanel` in `MasterDetail`'s new optional `side` slot: a third column, 312 wide, when the detail column keeps 960 beside it; otherwise, and on a phone and at medium width, a sheet from the side. At 1440 × 900 the detail column is 648, so it is a sheet; at 2200 it stands as a column. FROM and More › About open it. **Question for Sean (Q13 set):** one number, 960, as the brief says; or a column from a smaller width.
- The panel follows the open conversation (a small store, `sender-panel.ts`); picking a conversation in a sheet closes the sheet.

### Demo scenarios (`core/demo-scenarios/mail.ts`)

`follow-up-due` (Jo's kitchen-shelves quote, its reminder an hour past), `invite-waiting` (with it: Jo's first message is also an unanswered invitation), `invite-states` (with `?counter`: a cancellation, a guest's reply with a note, a kept time and an outdated copy; REMOVE FROM CALENDAR deletes the demo's event).

## Verification

- `check-mail-search.sh`: typecheck, lint (no warnings), build:demo, build, the notes-relay tests, the ratchet read from the source, the lockfile proof: exit 0.
- **Ratchet:** className **97 → 89** (`.dsa/baseline.json` lowered, `dsaVersion` kept); style 1, spread 0, raw buttons 14 unchanged. Look-alikes by the estimator: 0.
- **In the browser** (`pnpm shots`, phone 390 × 844, desktop 1440 × 900, graphite and stone; medium for the sender panel), asserting scenes: one block when two things wait (`// +1`, WAITING ON YOU, RESPOND); DONE archives and UNDO brings the conversation back; each invitation answer raises its toast (Accept from the block, Maybe and Not going from CHANGE); counter, cancel and reply buttons and their toasts; the propose form's error and its sent state; unsubscribe's body by method with focus on Cancel, and the mail method's toast with ARCHIVE; the sender panel a sheet at 1440 (detail column 648) and a column at 2200; the signature banner; the shared link's row.

## Consequences

- DONE archives, and the core dismisses a due reminder when its conversation is archived. UNDO un-archives the conversation but cannot bring that reminder back: the core has no call for it (a wish for Sean's list).
- The call rows are `MeetingPanel` as the calendar lane draws it; its JOIN is a solid primary, a second solid beside ACCEPT on the screen until the merge, where its Field Row form and optional `join` prop land.
- `UnsubscribeAction` keeps its props; `InviteCard` and `SenderProfile` keep theirs. `MasterDetail` gains an optional `side`.
