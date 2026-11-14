# ADR-0091 · Inbox filters: the chips row, splits, the newsletter bundle and the Screener lane

- **Status:** Accepted for the build. It records no change to a decision on record: categories, splits and the bundle stay as [ADR-0022](0022-inbox-your-way.md) made them, and the Screener as [ADR-0018](0018-calm-inbox.md) made it. Deleting a split gains an Undo (brief X6).
- **Date:** 2026-11-14
- **Builds on:** [ADR-0084](0084-places.md) (Mail's places and the page head's switcher), [ADR-0087](0087-forms-and-questions.md) (the form layer and the leave guard), [ADR-0090](0090-mail-lists.md) (message rows and `SwipeRow`).
- **Design:** briefs M2 and M3 of the undrawn-areas design, with M1's order of the rows above the first conversation; brief 5.2 (empty states) and X6 (undo); cross-app decisions §10, §12 and §13. No frame draws these screens.

The Inbox filtered with a row of pill buttons, splits added their own pills with a gear and a plus, the bundle was a rounded card with two icon buttons, the split form was plain inputs, and the Screener lane carried a paragraph under its title. This slice puts all of it on unicron's parts and the brief's words.

## Decisions

### The chips row (M2)

Under the Inbox's page head, on every width, one `FilterChipGroup type="single" scroll` named "Show": ALL · PEOPLE · UPDATES · NEWSLETTERS · one chip per split, with `SplitCount.unread` as its count when above 0. The categories carry no count (W1). After the chips, outside the scroll: "Edit split" (`edit`) while a split is chosen, then "New split" (`add`), both `IconButton`s. The row is the Inbox's only; with no account it is hidden, as before. Picking a chip clears what was open. `InboxChips` in `features/mail/splits.tsx`.

### Two compact rows above the first conversation (M1, M2, M3)

At most two `ListRow layout="message" size="compact"` rows stand above the list, in this order:

1. **The Screener's pointer**, while senders wait and All is chosen, wherever the sidebar does not list Mail's folders (a phone, a medium window, a collapsed sidebar; the same test as the page head's switcher). "Screener", then "3 new senders waiting". A tap opens the lane. On a desktop the sidebar's Screener item carries the count instead, and says "3 new senders waiting" with its name.
2. **The newsletter bundle**, while All is chosen and `InboxOverview.bundle` is there: "Newsletters", the thread count, the unread square when any is unread, the senders, and the newest one's time. A tap chooses NEWSLETTERS. A `SwipeRow` holds MARK READ (only while something is unread: a control that would do nothing is left out) and ARCHIVE ALL, the outer tile, which a full swipe runs because "Archived 2 newsletters" has UNDO. `ListRow` lists both in the row's overflow button, on hover and focus with a mouse and always on touch, on right-click and on the Menu key. UNDO now refreshes the lists (it went around the query cache before).

### The split form (M2)

In f6's form layer: overline "New split" or "Edit split", the name as typed for a title. The line "Mail must match everything you fill in." Then:

| Field | Part |
|---|---|
| NAME | `TextField` |
| FROM | `ChipField`, helper "An address, or a domain with @ in front."; a value with no @, or ending in one, is a critical chip and the field says "Fix or remove the address in red."; an address still being typed counts on save |
| SUBJECT HAS | `TextField` |
| ACCOUNT | `FieldRow` with CHANGE, opening an `AdaptiveMenu` of Any account and each account; only with two or more accounts |
| Only with attachments | `ToggleRow` |
| Keep out of All | `ToggleRow`, "Its mail shows only in this tab." On by default for a new split, as before |

Footer: DELETE (a text button, when editing), Cancel, then CREATE SPLIT or SAVE. A save toasts "Created {name}" or "Saved {name}" and chooses the split. DELETE toasts "Deleted {name}" with UNDO, which saves the split as it was last saved again and chooses it (X6). A failed save or delete shows the server's words in the form's banner.

### The Screener (M3)

- **The lane.** Overline `SCREENER // 03 WAITING`, a real count from `ScreenerStatus.waiting` (an account, when one is chosen, follows it); title "Screener". The paragraph under the title is gone: the empty state says it. Rows and swipes as ADR-0090: LET IN leads and runs on a full swipe; SCREEN OUT trails and only opens.
- **Toasts.** "{Name} can reach your inbox" and "Screened out {name}", the second with the line "Mail already archived stays in Archive". Both have UNDO, which forgets the decision. No full stop.
- **Listed.** The lane is listed while the Screener is on, while senders still wait in it, or while it is open. Off and empty, it is not.
- **Empty.** `SCREENER // 00`, "No new senders.", "First-time senders wait here."

The conversation's NEW SENDER notice belongs to the notice slot (M4) and comes with it.

### States and words

- No splits: the four fixed chips and New split.
- A category with no mail: brief 5.2 ("No receipts or alerts." for Updates now). A split with no mail: `{NAME} // 00`, "Nothing in this split.", "Mail that matches it shows up here."
- Counts in the chips, the overline and the bundle are two digits; sentences ("3 new senders waiting", "Archived 2 newsletters") use the plain number.

### Demo scenarios (`core/demo-scenarios/mail.ts`)

- `splits`: Studio (`@studio.example`) and Travel (`@ferry.example`), neither kept out of All, made through the client's own `saveSplit`.
- `screener-waiting`: with the `?screener` address, two more first-time senders, so three wait.

## Not built, and why

- **Counts on the categories** and on the Inbox: the core has none (W1).
- **The bundle's menu as a sheet on a phone:** `ListRow` draws a dropdown menu at every width (ADR-0090's gap).
- **The Screener's NEW SENDER notice in the conversation:** it comes with the notice slot (a3).
- **"New split for {domain}"** in the conversation menu: a3. It already opens this form filled in.

## Checks

- Scenes in `scenes/mail.mjs`, all asserting:
  - `mail-chips`: the six chips in order, All chosen, a split's count, no Edit split until a split is chosen, the bundle, the pointer on a phone and the sidebar's count on a desktop; Studio's chip filters the list.
  - `mail-newsletters`: a tap on the bundle chooses Newsletters.
  - `mail-bundle-menu`: on a phone a left swipe shows MARK READ and ARCHIVE ALL; from the overflow button Mark read clears the unread square and leaves the menu; Archive all empties it and UNDO brings it back.
  - `mail-split-new`, `mail-split-edit`: the form's line, helper, toggles and Account row; a wrong address stops the save; a rename saves; DELETE and its UNDO.
  - `form-layer-split`: the form layer's checks with CREATE SPLIT; the new split is the chosen chip.
  - `mail-screener`: the overline's count; LET IN by a full swipe on a phone and from the row menu on a desktop, and its UNDO; SCREEN OUT from its tile and from the menu, its line, and its UNDO forgetting the decision.
  - `mail-screener-pointer` (phone and medium): the pointer opens the lane.
  - `mail-screener-empty`: the lane is not listed while off and empty; on and empty, 5.2's words.
- Ratchet, read from the source: className overrides 114 → 110; 1 style, 0 spread, 14 plain buttons; 0 look-alikes by the estimator.

## Consequences

- `SplitChips` and `BundleRow` are gone; `InboxChips`, `NewsletterBundle` and `ScreenerPointer` take their place.
- The Screener's toasts change words wherever a sender is decided (the lane, the conversation's question, the row menu).
- `useMailPlace` lists the Screener while senders wait, even with screening off.
