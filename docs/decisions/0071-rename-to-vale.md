# ADR-0071 · The product is Vale

- **Status:** Accepted
- **Date:** 2026-10-30
- **Builds on:** [ADR-0006](0006-product-name.md) (the product name)

"Mailbird" was a working name. It belongs to Mailbird, Inc., an email client in the same category, so the project couldn't ship under it, and Google's app verification waited on a final name. Sean chose **Vale**.

## Decisions

### What's renamed

- **Everything people see:** the app's name in every screen, menu, notification and message, the window and page titles, the tray menu ("Open Vale", "Quit Vale"), and the device name in the shared identity ("Vale on Seans-MacBook-Pro").
- **The docs:** the README, NOTICE, the guides, and the ADRs. Two places still say Mailbird on purpose: [ADR-0006](0006-product-name.md), which records why the name changed, and the competitive analysis, where Mailbird is the competitor.
- **Build names:** the crates `vale-shell`, `vale-gateway` and `vale-push-relay`, the root package `vale`, the Docker images, and CI.
- **The app id:** `design.snds.vale`, used by the app stores, the system keychain and the app's data folder.
- **Settings read when building or testing:** `VALE_GOOGLE_CLIENT_ID`, `VALE_GOOGLE_CLIENT_SECRET`, `VALE_MICROSOFT_CLIENT_ID`, `VALE_AI_ANTHROPIC_URL` and `VALE_IT_SMTP_OUT`.
- **The gateway's safety header** is `X-Vale: 1`, and its page marker is `<meta name="vale-gateway">`. The gateway serves the web app, so both sides change together.
- **New calendar events** get ids ending `@vale`. Events made before keep theirs: an id never changes.
- **Meeting links** made in the app start `Vale-` on Jitsi.

### What keeps the old name

These are inside stored or synced data. Renaming them would break notes, sync, sketches or locked notes that already exist. Each is marked in the code.

- **Relay document names** (`mailbird/index`, `mailbird/note/<id>`, `mailbird/x/…`, `mailbird/shared/<id>`, `mailbird/registry`), and the files the relay keeps for them.
- **The salt end-to-end keys derive from** (`mailbird-sealed-v1`, ADR-0062).
- **The value sealed under the notes passphrase** to check it (`mailbird notes lock v1`, ADR-0043).
- **The tag inside saved sketches** (`<metadata id="mailbird-sketch">`, ADR-0046).
- **The app's id in the shared identity** (`mailbird`): the locked-notes key is wrapped under it (ADR-0051).

### Moving over an existing install

- **The data folder:** on first launch, if there's a folder under the old app id and none under the new one, the app moves it into place. It never replaces data already under the new id.
- **The keychain:** a secret not found under the new id is read from the old one, saved under the new one, and removed from the old.
- **The calendar's second time zone,** kept in the browser, is read from its old key if the new one is empty.

### Not in this change

- **The GitHub repository** is renamed by its owner, from `snds/Mailbird` to `snds/Vale`. GitHub forwards the old address, and the links in the docs already use the new one.
- **Other repositories** that mention Mailbird (unicron's notes on who uses it, Lockdown's ecosystem plan) are updated in their own repositories.

## Verification

- **App:** a unit test moves the old data folder once, and never moves it over data already under the new id.
- **Rust:** the core, app, gateway and push-relay tests pass. `cargo clippy -D warnings` is clean for the shell, the app, the gateway and the push relay.
- **Web:** `tsc -b`, `oxlint` and `vite build` are clean. The relay's tests pass. The full browser regression passes. Its suites were updated for the new name and header. The dsa ratchet is flat.

## Consequences

- **A trademark search is still open** (ADR-0006): "Vale" is also a well-known open-source prose linter (vale.sh). That's software, but not mail or calendars.
- **Anyone building with a Google or Microsoft client id** sets the `VALE_` names. The old `MAILBIRD_` names aren't read.
