# ADR-0072 · A demo app for Mac

- **Status:** Accepted
- **Date:** 2026-10-30
- **Builds on:** [ADR-0016](0016-web-gateway.md) (the web demo on sample mail), [ADR-0071](0071-rename-to-vale.md) (the app id)

Sean wants to try the desktop app's look and feel before setting up real accounts. The web app already runs a full demo on sample mail, calendar, contacts and notes, and the browser suites test it. Lockdown ships its demo the same way: no account, a bar on every screen, and one way back to a clean start (Lockdown D488).

## Decisions

### What it is

- **Vale Demo** is the desktop app around the web demo. It opens straight on the sample data, with no sign-in and no accounts to add.
- **It's a separate build,** not a mode inside the real app: `pnpm build:demo` sets `VITE_DEMO_APP=1`. In that build the page always uses the demo, and treats itself as not Tauri. It never calls the desktop core, so it behaves exactly as the tested web demo does.
- **It's a separate app,** `Vale Demo` with the id `design.snds.vale.demo`. Its data folder and keychain entries never meet a real install's.
- **A bar on every screen** says "You're exploring the demo. Nothing here is real." Its **Reset demo data** clears what the demo saved and starts it fresh.

### How it's built and shared

- **The Mac build machines build it** (`.github/workflows/demo-mac.yml`): one universal dmg for Apple silicon and Intel, macOS 11 or later.
- **Each push to `main`** that touches the app replaces the `demo-mac` pre-release, whose dmg is the download. Pull requests that change the shell or the workflow check only that it builds.
- **It's ad-hoc signed, not signed with an Apple certificate,** so macOS stops it the first time. The release notes say how to open it: Open Anyway in Privacy & Security on macOS 15 or later, Control-click → Open before that, or clearing the quarantine flag in Terminal.

## Not in this step

- **Desktop-only features** work as the web demo has them: the tray and mini calendar, native notifications, and saving through the core are off, because the demo build doesn't talk to the core. Testing those waits on the real app and the hardware session (ADR-0054).
- **Windows and Linux demo builds.** The same config builds them; add a job when wanted.
- **A demo inside the real app** (Lockdown's "Explore the demo" on first run). This build is the quick path; a first-run entry can come with onboarding.

## Verification

- `tsc -b`, `oxlint`, `vite build` and `pnpm build:demo` are clean. The normal build has no demo bar, and the browser regression is unchanged.
- **The demo build, in a browser posing as the desktop webview** (Tauri's bridge present, and failing on any call): the sample mail opens with no sign-in, the bar is on Mail, Calendar, Contacts and Notes, **Reset demo data** clears saved state and reloads, nothing calls the core, and the console is clean.
- **The Mac workflow** builds the universal dmg, checks that both architectures are in it, and prints its signature.
