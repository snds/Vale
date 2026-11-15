# ADR-0107 · First run in the focus frame, and adding an account as its second step

- **Status:** Accepted
- **Date:** 2026-11-14
- **Builds on:** [ADR-0083](0083-shell.md) (the first-run gate, `startFirstRun()` and `startAddAccount()`), [ADR-0104](0104-settings-frame.md) (Settings › Accounts and its ADD AN ACCOUNT rows), [ADR-0086](0086-status.md) (the FIRST SYNC strip, the toaster), [ADR-0013](0013-google.md) (signing in on the provider's page), [ADR-0081](0081-harness-and-scenarios.md) (scenes and demo scenarios).
- **Design:** brief X8 of the undrawn-areas design (no Figma frame); cross-app decisions §4 (the focus frame, "Not now"), §9 (errors), §12 (words), §14 (disabled with a visible reason).

Someone who opened Vale with no account landed on Mail's empty state, and "Add account" sent them into Settings › Accounts, where each provider opened a form drawn with the old field parts. The design makes the way in its own two steps in the focus frame, and makes the provider forms one thing that first run and Settings both show.

## Decisions

### When first run shows

- **The gate** (`features/onboarding/first-run-gate.tsx`) decides once, when the first read of the accounts settles: no account, not a team member, and "Not now" not chosen on this device. It draws nothing until then, so neither the app nor first run flashes before the other. A failed read lets the app in; the app says what went wrong.
- **The demo** always has its sample accounts, so it reaches first run only through its `no-account` scenario.
- **"Not now" is kept per device** in `localStorage` (`vale.first-run.not-now`, `features/onboarding/first-run.ts`). The demo's "Reset the demo" clears it with the rest.
- **The app stays mounted and hidden** (React's `Activity`) while first run shows, so Mail's ADD ACCOUNT (`startFirstRun()`, now step 1) and NOT NOW there return to the app as it was.

### Step 1: choose

- `AppFrameFocus` (432, `AppLockup` at the top of the column, the folio `Step 01 // 02`), inside its own `AppFrame`.
- `PageHead` (`sm`): overline WELCOME, "Add your first account."; then Accounts' storage sentence for this build.
- **The six providers** as `NavItem`s, in this order: Gmail, Outlook / Microsoft 365, iCloud, Fastmail, Other (IMAP), Other (JMAP). `ProviderList` in `accounts.tsx` is the one list, and Settings' ADD AN ACCOUNT draws it too. A provider this build cannot add is `disabled` with its reason as a visible line tied by `aria-describedby`; it stays in the tab order and pressing it does nothing.
- "Calendars and notes on this device work without an account." and a text button NOT NOW. **No primary on this step:** each row is the action (decisions §4).

### Step 2: sign in

- `AddAccountStep` (`accounts.tsx`) is the provider's form, in either place. `features/onboarding/add-place.ts` says which; `add-form.tsx` draws the two parts that differ: the head (in the focus frame a text button BACK and the page head "Add {provider}"; in Settings the pushed screen's head) and the end (the primary and what stands under it). The folio reads `Step 02 // 02`.
- **Titles name the provider:** Add Gmail, Add Outlook, Add iCloud, Add Fastmail, Add IMAP account, Add JMAP account.
- **Password providers:** `TextField`s EMAIL ADDRESS · NAME ON SENT MAIL · the provider's secret (APP-SPECIFIC PASSWORD, API TOKEN or PASSWORD) with its help line and HOW link. Other (IMAP) adds USERNAME and two groups under `SectionHeader`s, INCOMING (IMAP) and OUTGOING (SMTP), each SERVER · PORT · SECURITY. Other (JMAP) adds SESSION URL and USERNAME. CALENDARS AND CONTACTS (Fastmail's second password, or the two servers for Other) shows only where the preset asks; iCloud keeps its line "Calendars and contacts connect with the same password." Primary ADD ACCOUNT with "Checked before saving." under it.
- **Gmail and Outlook:** the browser line, what the provider will ask to allow (the three real scopes) and the line on where things stay, the optional address with the provider's help, a compact info `Banner` about the warning page the provider shows first, and the primary CONTINUE IN BROWSER. While it waits it keeps its word in the loading state, with "Finish signing in in your browser", the line on coming back, and a text button CANCEL. Under the primary, USE YOUR OWN CLIENT (the build's client) or CHANGE CLIENT (your own).
- **Your own client:** CLIENT ID (Microsoft's "Application (client) ID") and, for Google, CLIENT SECRET, each with the provider's instructions and the step-by-step guide; primary SAVE CLIENT; text buttons REMOVE CLIENT (a saved one of yours) and CANCEL (when there is a client to go back to). A build with no sign-in set up opens on this form, saying so.
- **Phone:** the same screens; the primary is full width at the foot of the screen and rides above the on-screen keyboard (`--keyboard-inset`). In the focus frame the primary is full width on every size.
- **Errors** (decisions §9): what the server says when it refuses a password or a server, a failed browser sign-in, or a client that cannot be saved stays in a compact critical `Banner` above the primary; the form keeps what was typed. CANCEL ends the wait quietly: the core's "sign-in was cancelled" is not shown.
- **Kept, every one:** each provider, field, help line and link, the scopes and the "stays on this device" lines, the warning pages, the own-client form and its remove, and CONNECT's form under Manage (now on `TextField` too).

### Done

- **No third screen.** Adding the account closes first run; Mail opens, the status says `FIRST SYNC // {account}` (ADR-0086), and the toast reads "Added {address}". The toast is raised after the app's own effects, so the frame's toaster is there to hear it.
- **From Settings** (brief T1): ADD AN ACCOUNT opens step 2 in the Settings column, pushed on a phone; adding returns to the list with the same toast.

### Words

"Add {provider}", ADD ACCOUNT, CONTINUE IN BROWSER, CANCEL, USE YOUR OWN CLIENT, CHANGE CLIENT, SAVE CLIENT, REMOVE CLIENT, NOT NOW, BACK. Code writes them in sentence case; the button sets the case.

### Demo scenarios (`core/demo-scenarios/settings.ts`)

- `accounts-addable`: the demo plays the desktop app for adding an account. Every provider can be picked, and a password provider's form adds the account as the core would, waiting for its first sync.
- `wrong-password`: the server refuses the password, in its own words.
- `oauth-waits`: the build has its own Google and Microsoft client, and the browser never comes back; CANCEL ends the wait as the core does.
- `first-run-skipped`: "Not now" was chosen before, so `no-account` opens on Mail's own empty state.

## Verification

- `tsc -b`, `oxlint` (no warnings), `vite build` (the app and the demo) and the notes relay's tests pass.
- **Ratchet, counted by reading:** className 92 → 92, style 0, spread 0, plain buttons 12. None of the files this slice owns had an override to take away; the new screens add none. The look-alike estimate finds none.
- **In the browser** (`pnpm shots`, desktop 1440 × 900, phone 390 × 844 and medium 768 × 1024, graphite and stone): the scenes `onboarding-welcome`, `onboarding-password`, `onboarding-imap`, `onboarding-wrong-password`, `onboarding-oauth-wait`, `onboarding-own-client`, `onboarding-done` and `settings-add-account`. Asserting scenes check that NOT NOW enters the app and is remembered after a reload, that Mail's ADD ACCOUNT opens step 1 again, that an off provider shows its reason, stays in the tab order and opens nothing (`onboarding-disabled-provider`), that the waiting button keeps its word and CANCEL ends the wait without an error, that a refused password keeps the form and shows the server's words, that a saved client offers CHANGE CLIENT and REMOVE CLIENT, and that adding from first run and from Settings ends with the toast and the first sync (`settings-add-account-done`). Every settings, shell, search and inbox scene still passes.

## Consequences

- A person who has never added an account meets first run on the desktop app and on a gateway. The web preview, which cannot add one, never does unless its scenario asks.
- Scenes that want Mail's no-account state add the `first-run-skipped` scenario to `no-account`.
- The provider forms are one component in two places; a change to a field shows in both.
- Not verified here: a real browser sign-in, a real server's refusal, and the on-screen keyboard on a phone. The demo's core stands in for all three.
