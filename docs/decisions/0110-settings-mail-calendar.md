# ADR-0110 · Settings for Mail, Signatures and templates, Calendar and Notifications as rows

- **Status:** Accepted for the build; it applies [ADR-0104](0104-settings-frame.md)'s row grammar, which is Proposed (DC1). It changes no recorded decision of its own.
- **Date:** 2026-11-15
- **Builds on:** [ADR-0104](0104-settings-frame.md) (the frame, silent saves, `settings/save.ts`), [ADR-0055](0055-power-settings.md) (Mail's settings), [ADR-0018](0018-calm-inbox.md) (the Screener and decided senders), [ADR-0017](0017-mail-power.md) (signatures and templates), [ADR-0030](0030-meeting-services.md) (calls), [ADR-0054](0054-menu-bar-calendar.md) (the menu bar), [ADR-0088](0088-date-parts.md) (the zone picker), [ADR-0089](0089-writing-parts.md) (the rich-text field and format bar), [ADR-0087](0087-forms-and-questions.md) (the form layer), [ADR-0015](0015-mobile-groundwork.md) (push through a relay).
- **Design:** briefs T2, T3, T4 and T8 of the undrawn-areas design; cross-app decisions §5, §9, §10, §12 and §13. No Figma frame draws these sections.

The four sections still held their pre-1.0 rows inside the frame: headings, switches beside paragraphs, a native select, cards with borders, and a toast for every change. The brief gives each one row grammar: overline groups, `ToggleRow`s, `RadioRow`s, `FieldRow`s with CHANGE or EDIT, and facts with no action.

## Decisions

### Shared

- **`settings/setting-block.tsx`:** one overline group: a `SectionHeader` (level 3) and its rows, as a region named by the header. A section stacks its groups 32 apart. **`settings/row-size.ts`:** rows are `stacked` on a phone.
- **Saves are silent** (brief T0). Every switch, choice and menu runs through `useSettingSave`; a failure leaves the control on its stored value with one critical line under its row. The old success toasts are gone.

### Mail (T2: `advanced-mail.tsx`, `screener-settings.tsx`)

- **READING:** REMOTE IMAGES as three `RadioRow`s (Ask, From contacts, Always) with the brief's sentences. MARK AS READ as single-choice chips ON OPEN · AFTER 3 S · MANUALLY; the chosen one's line is the description.
- **REPLYING:** Quote the message; Write below the quote (off, with "Needs Quote the message.", while quoting is off); Ask for read receipts.
- **SENDING:** UNDO SEND · "10 seconds", read from `UNDO_SECONDS` in `mail/format.ts`. A fact: the core has no setting (W4).
- **CHECKING:** CHECK FOR NEW MAIL with CHANGE: an `AdaptiveMenu` of 2, 5, 15 and 30 minutes and every hour (a sheet on a phone).
- **SCREENER:** the Screener switch ("New senders wait for your yes."). SENDERS YOU DECIDED with a count: a compact `ListRow` per sender with one or two tags (SCREENED OUT, BLOCKED, ALWAYS IN {CATEGORY}) and the trailing way back (LET IN AGAIN, UNBLOCK, RESET CATEGORY); a second decision is in the row's menu.
- Not built: Notify for (W4) and the Summaries switch (W6).

### Signatures and templates (T3: `writing-settings.tsx`)

- **SIGNATURES:** a `FieldRow` per account: its name, the signature's first line or "No signature", EDIT. EDIT opens the form layer (form 640; the whole screen on a phone): `SIGNATURE // {account}`, the rich-text field and its format bar, SAVE. Saved empty, the account has none.
- **TEMPLATES** with a count and NEW TEMPLATE in the header. A compact `ListRow` per template: the name, the subject in the meta role. A press opens the template form (NAME · SUBJECT "Fills an empty subject." · the text; SAVE TEMPLATE, off until there is a name). The row's menu holds DELETE; the toast "Deleted {name}" has UNDO, which saves it again.
- Both forms ask "Discard changes?" when closed with changes, and show a failed save in the form's banner.
- No account: "Add an account first." The empty list: "No templates yet. Save one from a message."

### Calendar (T4: `meeting-settings.tsx`, `menu-bar-settings.tsx`, `settings/second-zone-row.tsx`)

- **CALLS:** Calls open in their apps ("Zoom and Teams. Off: every call opens in the browser.").
- **MENU BAR** (not on a gateway): Calendar in the menu bar ("While it's on, closing the window keeps Vale running there." kept: it says what the switch changes); Show what's next, off with "Needs Calendar in the menu bar." while the menu bar is off. It used to be hidden then.
- **TIME:** SECOND TIME ZONE as before; WEEK STARTS, the day `firstDayOfWeek()` gives (the one the calendar's weeks use), as a fact "From your device's region."
- Not built: week numbers and the default alert (W4).

### Notifications (T8: `push-settings.tsx`)

- Two `RadioRow`s: "On the phone's schedule" (saves at once) and "Instant, through your relay" (shows the RELAY form; nothing saves until CONNECT TO RELAY).
- RELAY: RELAY ADDRESS (with the set-up guide), RELAY TOKEN ("Saved. Leave empty to keep it." once saved), UNIFIEDPUSH ADDRESS where the device has no push service; the one primary CONNECT TO RELAY, then SAVE. A failure is a compact critical `Banner` above it.
- ACCOUNTS ON THE RELAY with a count: a compact row per address with its tag INSTANT, WAITING or NEEDS ATTENTION (and PHONE'S SCHEDULE for an account the relay can't watch, as today); the relay's error as a critical banner.
- SEND A TEST (secondary): the toast "Test sent", "It should arrive in a few seconds".

### Demo scenarios (`core/demo-scenarios/settings.ts`)

- `settings-save-fails` now also refuses the Screener, Calendar and Notifications saves.
- `settings-kept`: what Mail, the Screener, Calendar and Notifications saved is kept in the tab and put back at start, so a reload reads it as the core reads its disk.
- `senders-decided`: four decided senders, one with two decisions. `relay-connected`: this phone on a relay.

## Verification

- `tsc -b`, `oxlint` (no warnings), `vite build` (the app and the demo) and the notes relay's tests pass.
- **Ratchet, counted by reading:** className 80 → 80, style 0, spread 0, plain buttons 11. The old files' overrides sat on plain elements (an `<input>`, `<label>`s), which the count skips, so the count did not fall. The look-alike estimate finds none (`SettingBlock` is named for no unicron part).
- **In the browser** (`pnpm shots -g settings`, 126 of 126; desktop 1440 × 900, phone 390 × 844 and medium 768 × 1024, graphite and stone). Asserting scenes:
  - `settings-mail`: the five groups, three image choices on Ask, ON OPEN, UNDO SEND a fact, Every 2 minutes, no Notify for or Summaries, no toast.
  - `settings-mail-kept`: each Mail row and the Screener changed, no toast, Write below the quote's reason, and every value read back after a reload.
  - `settings-senders-decided`: count 04, the four tags, UNBLOCK and RESET CATEGORY, the second decision in the menu, LET IN AGAIN removing the row and the count following.
  - `settings-signatures`, `settings-signature-edit` (the format bar, SAVE, the first line in the row, the form holding it again), `settings-template-form`, `settings-template-delete` (saved with its subject, count 02, DELETE, the toast, UNDO bringing it back).
  - `settings-calendar` (Sunday from en-US), `settings-calendar-kept` (both switches after a reload; Show what's next keeps its own value), `settings-second-zone`.
  - `settings-save-failed` and `settings-calendar-save-failed`: the control returns, one line, no toast.
  - `settings-phone`, `settings-notifications-relay` (CONNECT TO RELAY, SAVE, the token's helper, two INSTANT accounts, Test sent, the choice after a reload), `settings-notifications-schedule`.

## Consequences

- The four sections speak the same rows as Accounts and Appearance; the old headings, paragraphs, bordered cards and native select are gone.
- The Screener switch is now named "Screener". `scenes/mail.mjs`'s `mail-screener` looks for "Screen first-time senders" and needs the new name at the merge.
- Not verified here: a real relay and phone, the desktop's menu bar, a core that refuses a save.
