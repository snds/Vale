# ADR-0090 · The gateway's feed joins the shared releases repository

- **Status:** Proposed. It waits for one answer from Sean: may the gateway's feed live on snds/releases? Merging this is that yes. Until then nothing is lost: the first feed is still written and still read.
- **Date:** 2026-11-14
- **Replaces one choice of:** [ADR-0077](0077-gateway-updates.md), "On snds/Vale itself, not snds/releases". Everything else there stands.
- **Builds on:** [ADR-0076](0076-automatic-updates.md) (desktop updates through the shared kit), [ADR-0078](0078-gateway-update-and-reload.md) (Update and Reload through the host helper)

Sean asked for one release and update flow for all his apps: every release goes to the releases repository, so every app that updates itself finds it there. Words used here: a **feed** is the public file an app reads to learn its newest build (`latest.json`). The **bridge** is the old feed, kept alive so gateways already installed still find the next build.

Vale's desktop app already follows the shared flow (`vale-main` on snds/releases). The gateway did not. ADR-0077 put its feed on snds/Vale, in a shape of its own, because that needed no stored secret. That reason has gone: the desktop release already needs the secret `RELEASES_TOKEN`, and it is set.

## Decisions

### Two places, one build

- **The feed is `vale-gateway-main` on snds/releases.** It is a rolling pre-release, never marked latest, like every other app's. Its name is `<app>-<part>-main` because Vale also has a desktop feed (`vale-main`).
- **Its manifest has the shared server shape,** the one Warpcore's feed has:

  ```json
  {
    "app": "vale-gateway",
    "version": "0.1.0-main.20261114093000",
    "commit": "<40 hex>",
    "pubDate": "2026-11-14T09:30:00Z",
    "images": { "gateway": { "repository": "ghcr.io/snds/vale-gateway", "digest": "sha256:<64 hex>" } }
  }
  ```

- **The bridge stays: `gateway-main` on snds/Vale,** in its first shape (`version`, `image`, `digest`, `commit`), written by the same step as before. Gateways built before this ADR read only the bridge. It is never deleted: a gateway that was off for months would otherwise never find an update.
- **Order in `gateway-image.yml`:** the image is pushed, `:main` moves, the bridge is written, and the feed is written last. So neither file names an image that isn't in the registry.
- **Neither goes backwards.** The bridge keeps its check. The feed has its own (`tools/gateway-feed/manifest.py`): the same version again, or an older one, writes nothing. A published manifest that can't be read is never written over; the run fails so a person looks.

### The secret

- **The feed needs `RELEASES_TOKEN`:** a fine-grained token for snds/releases only, Contents read and write. It is already on the repository for the desktop release. No new secret.
- **Without it the step is skipped with a notice** and the run passes. The bridge alone keeps every gateway updating.
- **With a token that can't reach snds/releases** (expired, wrong scope) the run fails after the bridge is written. That is loud on purpose, and still safe, for the reason below.

### What a gateway reads

- **Both, and it offers the newer of the two** (`apps/gateway/src/feed.rs`, `choose`). Same version in both: the feed's. One missing, unreadable or stale: the other. Neither: the feed's own error.
- **Why both, not the feed alone.** A token expires. The day it does, the feed stops moving while the bridge keeps going. A gateway that read only the feed would then say "up to date" forever, with no error to see. Reading both costs one more small `GET` every six hours.
- **Both addresses are on GitHub's hosts.** The kit's rule is unchanged: https only, `github.com` and its release-asset hosts, every redirect checked, at most five. No host was added. Each read still sends nothing about the gateway.
- **A server-shape manifest must be the gateway's own and whole,** or it is no offer at all: `app` is `vale-gateway`, and `images` has exactly one entry for `ghcr.io/snds/vale-gateway` with a well-formed digest. The shared repository holds other apps' feeds; a manifest for another app, another repository or with no digest is refused.
- **The image's repository never comes from a manifest.** It is a constant in the gateway. A manifest can only name a version and a digest.
- **The release page stays on snds/Vale** (`gateway-main`), where only this repository's own workflow can write. Settings links there.

### Who can write the feed now, and what that risks

Before, only one workflow in snds/Vale could write the gateway's feed, with the repository's own short-lived token. Now anything holding `RELEASES_TOKEN` can write `vale-gateway-main`. That token is long-lived and is stored on every app repository that publishes. What someone with a stolen token could do:

- **Stop updates** by breaking the feed. The bridge still works, so gateways keep updating.
- **Offer a version that doesn't exist.** Settings would say "Version X is out". Update then asks the host helper to pull `ghcr.io/snds/vale-gateway:X`. The pull fails, and nothing restarts.
- **Not: run their own image.** The token can't push to the registry. The gateway never takes a repository from the manifest, the helper's allow-list names the one repository, and a pulled image whose digest differs from the manifest's is refused before anything restarts (ADR-0078).
- **Not: roll a gateway back.** Only a strictly newer version is an offer, and the tag must exist in the registry.

The by-hand command (`docker compose pull && docker compose up -d`) pulls `:main` from the registry and reads no feed.

### One kit version

Every pin of the shared kit (snds/app-updates) is now commit `2a2a63f`: the desktop crate, the gateway's rules crate (was tag `v0.1.0`), the host helper's client (was `c0ff0bf`) and the release workflow with its scripts (was `7173200`). The rules gained one channel, `Local`, which Vale doesn't use. The helper's protocol gained fields for stacks with several images; the gateway has one image and sends `expect_digest` as before. When the kit is tagged `v0.2.0`, the crate pins become that tag; the workflow stays pinned by commit.

### Pull requests try the desktop release path

`release-main` in `ci.yml` now also runs on a pull request that touches `apps/web/src-tauri/`, `Cargo.lock`, `pnpm-lock.yaml` or `ci.yml` (job `release-plan` decides). The kit makes that a dry run by itself: a throwaway key made in the job, no real key read, nothing published, the would-be `latest.json` kept as the run's `latest-json` artifact.

## Not in this step

- **Retiring the bridge.** Not planned. If it ever is, its last `latest.json` stays in place.
- **A server-shape writer in the kit.** Vale's gateway, Lockdown's server and Warpcore each carry one. It belongs in snds/app-updates; that is Sean's change to make there.
- **Accepting ADR-0078.** Update and Reload are still tested only against a fake helper. Sean installs the helper on Unraid and runs its step 5 first.

## Verification

- `apps/gateway/src/feed.rs` has no need of the rest of the gateway, so its five tests were run on their own: both shapes read to the same offer, the bridge shape reads as before, a server manifest must be the gateway's own and whole (ten refusals), the newer of the two is offered (stale feed, stale bridge, one missing, neither), and both addresses are GitHub's. A sixth, one-off test read the file the workflow's script wrote.
- `python3 tools/gateway-feed/test_manifest.py` (7 tests): the shape, never backwards, an unreadable published manifest never written over, bad inputs, and that its names match the reader's.
- The new workflow step was run against a stand-in `gh`: no token (skipped, exit 0), a token that can't read (fails), first publish, a rerun, an older run, a newer run, an unreadable published manifest (fails, nothing uploaded), a release with no manifest.
- `cargo check -p vale-gateway --all-targets` and `cargo clippy -p vale-gateway --all-targets -- -D warnings` are clean; `cargo check -p vale-shell` passes on the new pin.
- **Not run here:** `cargo test -p vale-gateway` (the check with both feeds through `Updates`, and the API tests). They compile; CI runs them. The publish itself runs only on a push to `main`: its first run there is the end-to-end test.
