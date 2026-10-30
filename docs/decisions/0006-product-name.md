# ADR-0006 · Product name

- **Status:** Decided: **Vale** (2026-10-30). The rename itself is [ADR-0071](0071-rename-to-vale.md).
- **Date:** 2026-10-13

## Context

**Mailbird** is a live commercial email client from Mailbird, Inc. It ships on Windows and macOS with freemium pricing, so the name collides with an active trademark in our exact category. The project used "Mailbird" as a working name until now.

## Decision so far

- "Mailbird" was a **working repo name only**.
- Package and crate names are kept neutral where it's cheap:
  - Rust core: `pim-core`.
  - Shell: `mailbird-shell`, now `vale-shell`.
- The app bundle identifier `design.snds.mailbird` must change before any store submission. It is `design.snds.vale` now.

## Decision

- **The product is Vale** (Sean, 2026-10-30).

## To do before any public release

1. ~~Choose a name.~~ Vale.
2. Run a trademark search (USPTO and EUIPO, class 9/42). Known so far: "Vale" is also the name of an open-source prose linter (vale.sh), which is software but not mail or calendars.
3. Check domain and store availability.
4. ~~Rename the repo, `productName`, `identifier`, and `index.html` title.~~ Done in ADR-0071, except the GitHub repository itself, which the owner renames.
