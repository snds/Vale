# ADR-0104 · Settings on unicron's SettingsFrame, and Accounts as rows

- **Status:** Proposed (DC1 of the undrawn-areas design: it replaces [ADR-0075](0075-settings-page-and-shortcuts.md)'s page). Built so Sean can judge it on screen; ADR-0075's page stands as the record until he says yes. The question for him is at the end.
- **Date:** 2026-11-14
- **Builds on:** [ADR-0075](0075-settings-page-and-shortcuts.md) (Settings as a page), [ADR-0085](0085-search-place.md) (one list of settings sections), [ADR-0082](0082-unicron-1-0.md) (the Theme row), [ADR-0083](0083-shell.md) (the shell, Settings pushed on a phone), [ADR-0084](0084-places.md) (places and history), [ADR-0087](0087-forms-and-questions.md) (the confirm question), [ADR-0063](0063-shared-inbox.md) (a team member), [ADR-0077](0077-gateway-updates.md) (the gateway's updates).
- **Design:** Desktop / 12 Settings (`36:2839`) and Mobile / 16 Settings (`34:1400`); briefs T0, T1 and T9 of the undrawn-areas design; cross-app decisions §5, §9, §10 and §12.

Vale's Settings was ADR-0075's page: a list of section names beside the open one, each section drawing its own heading, and Accounts as a card of plain lines with a trash can. The Figma frames draw one flat page of rows; Vale has eleven sections, too many for one page. All four apps now share one Settings layout, unicron's `SettingsFrame`, and the drawn rows are kept where they have a setting behind them.

## Decisions

### The page (brief T0)

- **`SettingsFrame`, driven by `features/settings/sections.ts`.** Each entry now carries the section head's one line (`description`). The frame draws the section list, the groups, the current item and the section head; Vale passes the sections, the open one, its page head and the rows.
- **Four overline groups,** shown by the frame once there are more than seven sections, with today's conditions:

  | Group | Section | Shown when |
  |---|---|---|
  | ACCOUNTS | Accounts | always (a team member sees one block) |
  | | Team members | a gateway's owner |
  | MAIL | Mail; Signatures and templates; AI summaries and replies | an account, not a team member |
  | | Notifications | an account, not on a gateway, not a team member |
  | CALENDAR AND NOTES | Calendar | not a team member |
  | | Notes | registered, hidden until its rows are built (brief T5) |
  | VALE | Appearance; Shortcuts and gestures | always |
  | | About | the desktop app, or a gateway's owner |

  A group with nothing shown is left out. A team member has three sections, so no groups.
- **"Gateway updates" is About's now** (brief T12, "Server"): its rows show under About for the gateway's owner, unchanged until About is rebuilt. The `gateway` id stays in the type and lands on About.
- **Expanded:** the page head `SETTINGS // {the accounts' names}` and "Settings" over the 204 px section list; the open section in one column up to 720, headed by its title and one line. The breadcrumb is `SETTINGS // {SECTION}`. The status is `VALE {version}` where the build knows it (the desktop app's updater); the web build does not, so it shows nothing there. Nothing open means the first section, Accounts.
- **Phone and medium:** the page head, then the drawn ACCOUNTS rows of Mobile / 16, then `ALL SETTINGS // NN` and the section list. Each section pushes; the top bar's Back, or the status line's at medium width, returns to the list, by the browser's Back when the list is the entry behind.
- **"Find a setting"** (a `SearchField`) from ten sections up. It looks through each section's name, line and keywords. Vale draws it in the page head rather than through the frame's `search` slot, because the frame counts the sections a search leaves and would take the field away while someone types; Vale counts every section the person has. **No build reaches ten sections yet** (the most is nine: the desktop app, or a gateway's owner), so the field shows once Notes is shown. The narrowing was proven with the threshold lowered in a trial.
- **Row grammar** (cross-app decisions §5): a choice of up to four short words is chips, choices that need a sentence are `RadioRow`s, five or more is CHANGE with a menu; on or off is a `ToggleRow`; a thing with its own page is a `FieldRow` with MANAGE or EDIT; a fact is a `FieldRow` with no action. The sections not rebuilt here keep today's rows inside the frame until their slices.
- **Saving:** at once and silently. A failed save leaves the control on its stored value, with one critical line under its row in the server's words (`features/settings/save.ts`, `save-failed.tsx`). Mail's switches, choices and check interval use it now; the success toasts they had stay until Mail is rebuilt.
- **Loading:** a section that is still reading shows three skeleton rows (Accounts).
- **Left out, with nothing behind them** (W4, W6): the undo-send switch, Notify for, week numbers, week starts as a choice, the default alert, the Summaries switch, and Follow system (Theme's SYSTEM chip does its job; Q11).
- **`features/settings/section-header.tsx` is gone.** The frame draws a section's head; a screen pushed inside Accounts has its own (`account-screen-head.tsx`).

### Appearance (brief T9)

- Moved into the frame as it was built in ADR-0082: one `FieldRow` THEME with the chips SYSTEM · STONE · GRAPHITE and their tooltips. The chips switch the whole app at once and the choice outlives a reload (asserted).

### Accounts (brief T1)

- **One line by build,** kept in full because it is about privacy: this device and the keychain; the gateway and its sealed store; or, in the web demo, the sample-mail line.
- **`ACCOUNTS NN`, one `FieldRow` per account, as drawn:** the label is the account's name; the value is the provider's name and, after `//`, what is wrong or under way ("Gmail // sign-in needed", "IMAP // first sync"); the line under it is the address and then "Synced Thu 09:16", or the error in critical text. The provider's name: Gmail, Outlook, iCloud, Fastmail (a JMAP session on fastmail.com) or JMAP, IMAP. The action is MANAGE, or SIGN IN for an OAuth account whose sync failed, in its loading state while the browser is open; a failed sign-in is a critical line under the row.
- **`ADD AN ACCOUNT`:** the six providers as `NavItem`s, in first run's order (Gmail, Outlook / Microsoft 365, iCloud, Fastmail, Other (IMAP), Other (JMAP)). One that this build cannot add is off with its reason as a visible line ("Needs the desktop app"). Each opens today's form in this column, pushed on a phone. `startAddAccount()` opens Accounts here with the first provider focused.
- **On a gateway, for its owner, last:** `GATEWAY`, a `FieldRow` SIGNED IN · "This gateway" · SIGN OUT. It replaces the "Sign out of this gateway" button under the section list.
- **Manage an account** is pushed in the column: ADDRESS, PROVIDER, MAIL (when it synced, or the error, with SIGN IN where it applies), CALENDARS AND CONTACTS ("Connected", the error, or "Not connected" with CONNECT, which opens the app-password or server form). Then REMOVE ACCOUNT, a text button in critical ink, which asks through `useConfirm`: "Remove {address}?", "Mail on the server is not affected.", REMOVE, focus on Cancel. This replaces `window.confirm`. The demo's core refuses, and the question shows its words.
- **Where it stands** (`features/settings/account-step.ts`): the list, or one pushed screen. The page's way back closes a pushed screen before it leaves the section, the browser's Back does too on a phone, and another section or closing Settings leaves Accounts at its list.
- **A team member** sees one block: "You're signed in as {name} on a shared inbox. Its accounts belong to the owner." and SIGN OUT.
- Toasts name the thing with no full stop: "Added {address}", "Signed in to {address}", "Removed {address}".

### Demo scenarios (`core/demo-scenarios/settings.ts`)

`settings-save-fails` (the core refuses a change to the mail settings), `sign-in-needed` (the work account signs in with Google, and Google has asked for a new sign-in), `gateway-owner`.

## Verification

- `tsc -b`, `oxlint` and `vite build` (the app and the demo) pass; the notes relay's tests pass.
- Ratchet, counted by reading the source: className overrides **117 → 108**, style 1, spread 0, plain buttons 14. `.dsa/baseline.json` is lowered. Look-alikes by both estimators: 0.
- In the browser, at phone (390 × 844), medium (768 × 1024) and desktop (1440 × 900), stone and graphite, by asserting scenes: every section opens from the list at all three widths, and Back returns to it on a phone and at medium width; one current item in the section list beside the sidebar's current Settings; the drawn account rows (`Gmail // sign-in needed` with SIGN IN); Find a setting absent under ten sections (and, in a trial with the threshold lowered, narrowing to Appearance with the field kept); the theme chips switch the app and outlive a reload; a failed save leaves the switch on with one line under it and no toast; REMOVE ACCOUNT asks with focus on Cancel; a team member has three sections and the block; a gateway's owner gets the GATEWAY row, Team members and About, and no Notifications.

## Consequences

- Settings looks and works the same as in the other three apps. ADR-0075's page stands until Sean answers.
- The rebuilds of Mail, Signatures and templates, Calendar, Notes, Shortcuts, AI, Notifications, Team members and About put their rows in this frame with the grammar above and `useSettingSave`.
- "Find a setting" is built and waits for a tenth section.
- Unicron gaps found here: the section list marks the open section `aria-current="page"`, the same as the sidebar's Settings item, where the brief asks for `true`; the frame's "Find a setting" counts the filtered sections; the frame's detail column has no slot before the section head (the demo notice stands under it on a phone).

**Question for Sean (app spec question 1, DC1):** Settings as the shared `SettingsFrame` (the drawn account rows first on a phone, then every section; a section list beside the open section on a desktop) in place of the one flat page the frames draw and ADR-0075's list. Yes, or keep ADR-0075's page with the new rows?
