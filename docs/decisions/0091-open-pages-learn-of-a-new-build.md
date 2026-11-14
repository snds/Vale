# ADR-0091 · An open page learns of a new build and reloads when it is safe

- **Status:** Accepted for the rules and the serving. The visible sign is not built yet: it is a screen, and waits for the rebuild (see "Not in this step").
- **Date:** 2026-11-14
- **Builds on:** [ADR-0016](0016-web-gateway.md) (the web gateway), [ADR-0076](0076-automatic-updates.md) (desktop updates), [ADR-0077](0077-gateway-updates.md) and [ADR-0078](0078-gateway-update-and-reload.md) (the gateway's own updates), [ADR-0087](0087-forms-and-questions.md) (the leave guard)

Sean asked that every app update by itself, and most of them have a web front end. The desktop app updates through its updater. The gateway updates through its image. But a browser tab left open on a gateway knew nothing: after the gateway restarted on a new image, the tab kept running the old page until someone reloaded by chance. An old page can also break, because the files it loads on demand are gone with the old build.

This is the same rule in each of Sean's apps (the shared update contract, part A2b).

## Decisions

### How the page learns

- **The build stamps itself** (`apps/web/build-stamp.ts`, a Vite plugin). After the files are written it makes an id, writes it into the page as `<meta name="vale-build" content="…">`, and writes `build.json` (`{"build": "<id>"}`) beside it.
- **The id is a hash of the built files,** 20 hex characters of a SHA-256 over every file's name and content. So it is the front end's own. A gateway release that didn't change the front end keeps the id, and asks nobody to reload. It needs no git and no build argument, so the Docker build and a build from source stamp the same way. Two builds of the same source gave the same id.
- **The id is in the page, not in a script.** It is made from the scripts' final content, so it can't also be inside them. The page it came with is what an open tab compares.
- **The gateway serves `/build.json` itself** (`build_json` in `apps/gateway/src/lib.rs`): read on each request, `Cache-Control: no-cache`, no sign-in. Without the file it answers a plain 404, never the app page.
- **The page asks again** (`apps/web/src/lib/build-watch.ts`): at load, when the tab becomes visible, when the device comes back online, every 15 minutes while visible, and when a file loaded on demand fails (`vite:preloadError`). The fetch goes past the browser's cache and follows no redirect.
- **An answer that isn't JSON with a plain `build` string means "can't tell".** A sign-in page, an error, a proxy's page: never "new", and never a reason to drop an offer already made.
- **A different id means a new version is ready.**

### When it reloads by itself

Only in a quiet moment. All of:

1. The tab has been hidden for a minute, or nobody has typed, clicked, touched or scrolled for five.
2. The app's `canReloadNow()` says yes (`apps/web/src/lib/can-reload.ts`).
3. It has not already reloaded for this id. The id is kept in `sessionStorage`, so a deploy that still serves the old page can't make a tab loop. Where the browser keeps no session storage, the page only offers.

Otherwise it waits and keeps offering **Reload**. Pressing Reload reloads at once. Before any reload, whatever the app registered with `beforeReload` is saved.

### What `canReloadNow()` asks in Vale

- **Unsaved writing in a form in the pane** (`paneHoldsWriting`, the leave guard).
- **Writing in a field or an editor that has the caret.** Any text box, input or editor with text in it and the caret inside. This is wide on purpose: a note that is open and focused holds the reload until the caret leaves it.
- **Anything open over the page:** a dialog, the form layer, a question.
- **A change being saved or sent:** any mutation in flight in the query client.
- **Whatever a feature holds** with `holdReload(why)` (an upload, an answer still arriving).

A check that throws counts as "not now". A reload must never lose work because a check broke.

### Where it runs

- **On a gateway, and on the static demo.** Anywhere the page is loaded from a server.
- **Not inside a Tauri shell** (the desktop app, the phones, Vale Demo for Mac). There the page ships inside the app, and the app's own updater is the only path (ADR-0076).
- **Not under `vite dev`:** that page has no id.

### A file that fails to load

If a file loaded on demand fails and a new build is known: reload if the moment is quiet; if not, the state says so (`needed`), for the sign to read "Reload to continue".

## Not in this step

- **The sign.** One quiet mark in the shell, and the Unicron update row in its `ready` state in Settings → About, with **Reload**. Never a dialog, never a countdown. `useBuildWatch()` and `reloadForNewBuild()` are ready for it.
- **Asking right after an owner's Update or Reload finishes.** `checkBuildNow()` is ready; Settings → Gateway updates calls it when the gateway is back.
- **Long cache lifetimes for hashed files.** The gateway serves `/assets/*` with no `Cache-Control`. They should be `immutable`, and a missing one should be a 404, not the app page.

## Verification

- `pnpm --filter web test` (18 tests, `node --test`): what counts as a build id; quiet by the clock; same id, different id, going back; an unreadable answer never new and never clearing an offer; checks joined and spaced; asking every 15 minutes while visible and not while hidden; reload after five idle minutes with saving first; a hidden tab after a minute, cancelled by coming back; never while work would be lost; once per id; only offering where the note can't be kept; a failed file; `canReloadNow` with holds, standing checks and a broken check; the stamp's id, tag and `build.json` agreeing.
- A real browser against the built app, with its clock driven: one ask at load, another after 15 minutes, no reload on the same build, none on an HTML answer, none after 16 idle minutes with unsent words in a text box (the words still there), one reload once they were gone, and no second reload for the same id while the server still served the old page.
- `tsc -b`, `oxlint` and `vite build` pass. Two builds of the same source gave the same id.
- The gateway's handler and its test (`gateway_end_to_end`: 404 before, the file as it is now, `no-cache`, no sign-in) compile; **CI runs the test, it was not run here.** CI's image checks now also ask `/build.json` and compare it with the page's tag.
