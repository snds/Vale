# ADR-0116 · Unicron 1.1: the pre-release tarballs and what the migration guide asks

- **Status:** Accepted.
- **Date:** 2026-11-16
- **Builds on:** [ADR-0082](0082-unicron-1-0.md) (Unicron 1.0 from `vendor/unicron/`), [ADR-0091](0091-open-pages-learn-of-a-new-build.md) (the build watch), [ADR-0085](0085-search-place.md) (the occurrence card) and [ADR-0098](0098-calendar-views.md) (the calendar views).
- **Design:** Unicron's `docs/08-migrating-to-1.1.md`; the decisions of 2026-11-16 (Unicron 1, 2, 13, 89, 95, 98; Updates 5).

Unicron 1.1 settles the questions of the 1.0 build. Vale moves to it and does what its migration guide asks of an app.

## Decisions

### The tarballs

- `@unicron/ui` and `@unicron/tokens` install from `vendor/unicron/unicron-ui-1.1.0-pre.1.tgz` and `unicron-tokens-1.1.0-pre.1.tgz`. The 1.0.0-pre.2 tarballs are gone. The ui tarball pins its tokens to `1.1.0-pre.1` exactly, so the override in `pnpm-workspace.yaml` names the same tokens file, as before.
- **Swap to the @unicron/ui and @unicron/tokens release URLs when Unicron 1.1 is released, and delete vendor/unicron/.** The two places are `apps/web/package.json` and the override; the gateway's `Dockerfile` drops its `COPY vendor` line then too.
- The lockfile changes only the two unicron entries and the contrast tool's two small dependencies (`apca-w3`, `colorparsley`). The `@snds/dsa` entries are as they were.
- **2026-11-17: the 1.1.0 release.** The pre.1 tarballs are gone; `vendor/unicron/` holds `unicron-ui-1.1.0.tgz` and `unicron-tokens-1.1.0.tgz`, byte for byte the assets of the `@unicron/ui@1.1.0` and `@unicron/tokens@1.1.0` GitHub Releases (Unicron `8068d43`). The ui tarball pins its tokens to `1.1.0` exactly. The lockfile changes only the two unicron entries' paths, versions and hashes; their dependencies did not change. Nothing new is required of an app: the release adds motion (a sliding tab indicator, a 1px press, the phone sheet's drag physics, Progress on `scale`, toast timing, `RollingNumber`) and an opt-in expressive stylesheet, which Vale does not take up. The release URLs now exist, so the swap above is still to do.

### What the migration guide asks, done

- **Icons (Unicron 98).** Five drawings Vale uses left the curated set: `star--filled`, `zoom--in`, `zoom--out`, `chart--network`, `minimize`. `app/icons.ts` registers each, as Unicron 1.0 drew it (Carbon 11.92.0). The forward arrow stays registered as Carbon's `reply`, mirrored (Unicron 95).
- **The calendar event (Unicron 2).** `CalendarEvent` left the core. Vale's copy is `components/calendar-event.tsx`; `OccurrenceCard` draws it. Here it is Unicron 1.0's part, moved as the guide says; [ADR-0117](0117-theme-and-calendar-event.md) makes it Vale's own.
- **The build watch (Updates 5).** The rules and their page wiring are Unicron's shared `startBuildWatch` now. `lib/build-watch.ts` starts it with Vale's prefix (`vale`: the tag `vale-build`, the note `vale.build.reloadedFor`, both unchanged), `canReloadNow()`, the draft saver, `build.json` beside the app's base and `same-origin` credentials. Still off in a Tauri shell. Vale's own rules file is gone. `test/build-watch.test.mjs` runs Vale's cases on the shared copy. One case changed with the shared rule: a page whose next file is gone reloads as soon as nothing would be lost, without waiting for a quiet moment.
- **Placeholder ink (Unicron 25).** The note's placeholder reads `text-label`, not `text-faint`.
- **Counts read three digits (Unicron 13).** Every count drawn through the core (`formatNavCount`, nav items, chips, list rows) now reads `012`. Sentences keep plain numbers (Vale 6).
- **Nothing to drop for the old ramps (Unicron 7).** Vale's layer aliases no `--g-neutral-*`, `--g-white-alpha-*` or accent ramp.

## Consequences

- Until Vale declares its own theme ([ADR-0117](0117-theme-and-calendar-event.md)), a page shows Unicron's slate default, because the core no longer carries Vale's theme (Unicron 1).
- The lighter washes (hover 4%, pressed 6%), the round radio, the critical edges in `line-invalid` and the three-digit counts come with the bump; they are Unicron's, not Vale's.
