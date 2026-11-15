# ADR-0112 · The gateway's door, Team members, and About with app and server updates

- **Status:** Accepted for the build, with one part Proposed: **DC12** (an update raises no toast; the mark on the way into Settings is the one signal, and the server's update rows live in About › SERVER), changing ADR-0076 and ADR-0077. Question for Sean: Q13 (the smaller changes to recorded decisions, as a set). It applies [ADR-0104](0104-settings-frame.md)'s row grammar, which is Proposed (DC1).
- **Date:** 2026-11-15
- **Builds on:** [ADR-0016](0016-web-gateway.md) (the web gateway and its password), [ADR-0063](0063-shared-inbox.md) (team members and invitations), [ADR-0076](0076-automatic-updates.md) (the desktop app's updates), [ADR-0077](0077-gateway-updates.md) and [ADR-0078](0078-gateway-update-and-reload.md) (the gateway's update check, Update and Reload through the host helper), [ADR-0081](0081-harness-and-scenarios.md) (scenarios), [ADR-0083](0083-shell.md) (the update mark), [ADR-0086](0086-status.md) (UPDATING SERVER), [ADR-0087](0087-forms-and-questions.md) (the form layer, the confirm question), [ADR-0107](0107-first-run.md) (the focus frame).
- **Design:** briefs X9, T10, T11 and T12 of the undrawn-areas design; cross-app decisions §3, §4, §5, §9, §10, §12. No Figma frame draws these screens.

The gateway's door was a rounded card with a mail glyph. Team members was a bordered list, an inline form and `window.confirm`. About and Gateway updates were paragraphs, outline buttons and success toasts for every switch and every finished update.

## Decisions

### The gateway's door (X9: `gateway-sign-in.tsx`)

- **The focus frame** (`AppFrameFocus`, 432, the lockup, one primary full width; at a phone's foot above the keyboard), with its own Toaster.
- **Sign in:** overline GATEWAY, "Sign in.", one line; EMAIL ("Only if you were invited to the team."); GATEWAY PASSWORD with "The GATEWAY_PASSWORD it was started with.", or PASSWORD once an email is typed; SIGN IN, which keeps its word while it works.
- **A wrong password is the field's error,** in the shared words (decisions §4): "That isn't the gateway password." or "That isn't your password." The gateway's own sentences ("that's not the gateway password", "that email and password don't match") are mapped in the page; anything else it says (too many tries) shows in its words. No backend change.
- **Join** at `/join#<code>`: CHOOSE A PASSWORD ("At least 12 characters."), JOIN. A short password is the field's error on submit instead of a disabled button with no reason.
- **An invitation that has ended** (spent, expired, or a link with no code): `EmptyState tone="critical"`, "This invitation has ended.", "Ask for a new link." The gateway says so only when the code is tried, so the state shows after JOIN.

### Team members (T10: `team-members.tsx`)

- The section's line is the brief's caption. **PEOPLE NN:** a `FieldRow` per person, named by the name; the email in mono, or "Owner (you)"; the badge NOT JOINED YET while an invitation is out; NEW LINK for a member; REMOVE in the row's overflow menu.
- **REMOVE asks** through `useConfirm`: "Remove {name}?", "They're signed out now. What's assigned to them goes back to nobody.", REMOVE; focus on Cancel. `window.confirm` is gone.
- **ADD MEMBER** (secondary) opens the form layer: NAME · EMAIL · CREATE INVITATION; a refusal stays in the form in the gateway's words. Then, in the same layer, INVITATION LINK with COPY LINK ("Copied" for 2 s, no toast) and "Works once, for {days} days. It won't show again.", and DONE. NEW LINK opens the same link layer. A NEW LINK that fails puts one critical line under its row.
- Loading: three skeleton rows. A failed read: the critical empty state with TRY AGAIN.

### About (T12: `updates/about-section.tsx`, `gateway-updates.tsx`)

- **Two groups** (decisions §3). About shows for `isDesktopApp()` (THIS APP) and a gateway's owner (SERVER). The Gateway section stays out of the list; its old id lands on About.
- **THIS APP:** unicron's `UpdateStatusRow` and `AutoCheckSwitch`, with Vale's words (`update-model.ts`): VERSION "Vale {version} · {channel}"; "Up to date.", "Checking…", "Downloading {version}…", "{version} is ready.", or the failure in critical text; CHECK FOR UPDATES, RESTART TO UPDATE once ready (RELOAD APP otherwise), RELEASE NOTES when there are some; "Check for updates automatically", "When Vale opens and every six hours." The switch saves silently, with one critical line on a refusal.
- **SERVER:** VERSION "{version} · {channel}" with "{version} is out." when a newer image exists, or what the last restart did; UPDATE TO {version} (the one primary, only with the host helper and a newer image), RELOAD SERVER and CHECK FOR UPDATES (secondary); LAST CHECKED; the automatic check, "At start and every six hours. It only looks."; with no host helper, UPDATE COMMAND with the command in mono, COPY and RELEASE NOTES, and where the helper's install steps are. The backup line stays in full.
- **While it updates or reloads:** "The gateway goes away for a moment. Everyone signs in again.", UPDATING SERVER in the live status (ADR-0086), and when the gateway comes back asking for a sign-in, the door (`SIGNED_OUT`) instead of a "Sign in again" button.
- **DC12 (Proposed):** no toast for an update. The "Vale gateway {version} is running" toast and the two automatic-check toasts are gone; the row says it. The mark on the way into Settings (ADR-0083) is the one signal and also marks About in the section list.

### Seams for the demo (`updates/gateway-client.ts`, `update-client.ts`)

- The gateway's calls (session, sign-in, join, the team, the server's updates) go through `gateway()`. On a gateway and in the desktop app it is exactly `core/client.ts`'s functions; only the in-memory demo's scenarios can stand in (`standInForGateway`). The door asks for the session after the demo has started, so a scenario can play it.
- `updateClient()` answers once the demo has started, and a scenario can stand in for the desktop's updater (`standInForUpdater`); it never reaches Tauri.
- Scenarios in `core/demo-scenarios/settings.ts`: `gateway-owner` (now with a team of three and a newer image), `gateway-no-helper`, `gateway-signin`, `gateway-join`, `invitation-ended`, `desktop-update-ready`. The demo's gateway takes "demo-gateway-password" (owner) and "demo-member-password" (with an email).

## Verification

- `tsc -b`, `oxlint`, `vite build` (the app and the demo), the notes relay's tests and the lockfile proof (`check-notes-settings.sh`, exit 0).
- **Ratchet, counted by reading:** className **74 → 74**: the old door, team and update files had their classes on plain elements, and no className is left on a unicron part in this lane's files, so the baseline stays. Style 0, spread 0, plain buttons 11. The look-alike estimate finds none.
- **In the browser** (`pnpm shots`, desktop, phone and medium, graphite and stone), asserting scenes: `outside-signin` (fields, helpers, one primary, no app behind it), `outside-signin-wrong` (both wrong-password errors), `outside-signin-done`, `outside-join`, `outside-join-short` (the field's error, then joined off the invitation's address), `outside-invitation-ended`; `settings-team-members`, `settings-team-invite`, `settings-team-remove` (asks, focus on Cancel), `settings-team-removed`; `settings-about-app`, `settings-about-restart`, `settings-about-server` (UPDATE TO the one primary), `settings-about-server-command`, `settings-about-server-updating` (the line, UPDATING SERVER, then the door), `settings-update-mark` (sidebar, rail, phone button; no toast).
- Checked on demo scenarios only: no debug gateway was run.

## Consequences

- One door for the gateway in the shared focus frame, and one question for removing someone.
- **Unicron gap:** `UpdateStatusRow` draws every action as a text action, so RESTART TO UPDATE is not a primary as T12 asks; About › This app has no primary until the part offers emphasis.
- A newer server image does not mark the way into Settings: the mark reads only the desktop's updater (`app/update-mark.ts`, the shell's).
