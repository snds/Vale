//! The gateway's update feed: where it is, what it holds, and how two
//! answers become one offer (ADR-0090, which replaces one choice of
//! ADR-0077).
//!
//! Every push to `main` announces the newest image in two places
//! (`.github/workflows/gateway-image.yml`), both written only after the
//! image is in the registry:
//!
//! - **the feed**, `vale-gateway-main` on snds/releases, where every app's
//!   feed lives. It has the shared server shape:
//!   `{"app", "version", "commit", "pubDate", "images": {"gateway":
//!   {"repository", "digest"}}}`;
//! - **the bridge**, `gateway-main` on snds/Vale, where the feed was first
//!   (ADR-0077). It keeps its first shape: `{"version", "image", "digest",
//!   "commit"}`. Gateways built before ADR-0090 read only this one.
//!
//! A gateway reads both and offers the newer version of the two. So it keeps
//! finding updates when one of them is missing or stale (the feed before
//! its first publish, or while its token is expired; the bridge if it is
//! ever retired).
//!
//! This file is the rules only: no network, no state. It needs nothing of
//! the gateway, so its tests run on their own.

use host_helper::protocol::valid_digest;
use semver::Version;
use serde::Deserialize;

/// The feed: `latest.json` on the rolling `vale-gateway-main` pre-release of snds/releases.
pub const FEED_ENDPOINT: &str =
    "https://github.com/snds/releases/releases/download/vale-gateway-main/latest.json";

/// The bridge: `latest.json` on the rolling `gateway-main` pre-release of snds/Vale.
pub const BRIDGE_ENDPOINT: &str =
    "https://github.com/snds/Vale/releases/download/gateway-main/latest.json";

/// The app id a server-shape manifest must carry to be the gateway's.
pub const APP_ID: &str = "vale-gateway";

/// The published image (`gateway-image.yml`). A server-shape manifest must
/// name this repository; no other is ever taken from a manifest.
pub const IMAGE: &str = "ghcr.io/snds/vale-gateway";

/// The largest manifest read (the real ones are under 1 KB).
pub const MANIFEST_LIMIT: usize = 64 * 1024;

/// What one manifest announces.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Offer {
    /// The version it names.
    pub version: Version,
    /// The image's digest (`sha256:` and 64 hex characters), when it names
    /// a well-formed one. Update passes it to the host helper as
    /// `expect_digest`.
    pub digest: Option<String>,
}

#[derive(Deserialize)]
struct Raw {
    version: String,
    /// The server shape's marks.
    app: Option<String>,
    images: Option<std::collections::BTreeMap<String, RawImage>>,
    /// The bridge shape's digest.
    digest: Option<String>,
}

#[derive(Deserialize)]
struct RawImage {
    repository: String,
    digest: String,
}

/// Reads a manifest in either shape. `None` when it isn't one the gateway
/// can use.
///
/// - **Server shape** (it has `app` or `images`): `app` must be
///   [`APP_ID`], and `images` must hold exactly one entry for [`IMAGE`]
///   with a well-formed digest. Anything else is refused whole: a manifest
///   for another app, another repository, or without a digest is never an
///   offer.
/// - **Bridge shape:** `version`, and `digest` when it is well formed (as
///   before ADR-0090).
pub fn read(body: &[u8]) -> Option<Offer> {
    if body.len() > MANIFEST_LIMIT {
        return None;
    }
    let raw: Raw = serde_json::from_slice(body).ok()?;
    let version = Version::parse(raw.version.trim().trim_start_matches('v')).ok()?;
    if raw.app.is_none() && raw.images.is_none() {
        let digest = raw
            .digest
            .map(|d| d.trim().to_string())
            .filter(|d| valid_digest(d));
        return Some(Offer { version, digest });
    }
    if raw.app.as_deref() != Some(APP_ID) {
        return None;
    }
    let images = raw.images?;
    let mut ours = images.values().filter(|i| i.repository == IMAGE);
    let image = ours.next()?;
    if ours.next().is_some() || !valid_digest(&image.digest) {
        return None;
    }
    Some(Offer {
        version,
        digest: Some(image.digest.clone()),
    })
}

/// One offer from the two answers: the feed's and the bridge's, each the
/// manifest's bytes or why it couldn't be fetched.
///
/// - Both readable: the higher version (semver order); the feed's when they
///   are equal.
/// - One readable: that one.
/// - Neither: the feed's error when it couldn't be fetched, else
///   `unreadable` (it was fetched and isn't a manifest).
pub fn choose(
    feed: Result<Vec<u8>, String>,
    bridge: Result<Vec<u8>, String>,
    unreadable: &str,
) -> Result<Offer, String> {
    let from_feed = feed.as_ref().ok().and_then(|b| read(b));
    let from_bridge = bridge.as_ref().ok().and_then(|b| read(b));
    match (from_feed, from_bridge) {
        (Some(f), Some(b)) => Ok(if b.version > f.version { b } else { f }),
        (Some(one), None) | (None, Some(one)) => Ok(one),
        (None, None) => Err(match feed {
            Err(why) => why,
            Ok(_) => unreadable.to_string(),
        }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn v(s: &str) -> Version {
        Version::parse(s).unwrap()
    }

    fn digest(c: char) -> String {
        format!("sha256:{}", c.to_string().repeat(64))
    }

    /// What `gateway-image.yml` writes to the feed.
    fn server(version: &str, d: &str) -> String {
        format!(
            r#"{{"app":"vale-gateway","version":"{version}","commit":"{}","pubDate":"2026-11-14T09:30:00Z","images":{{"gateway":{{"repository":"ghcr.io/snds/vale-gateway","digest":"{d}"}}}}}}"#,
            "c".repeat(40)
        )
    }

    /// What it writes to the bridge.
    fn bridge(version: &str, d: &str) -> String {
        format!(
            r#"{{"version":"{version}","image":"ghcr.io/snds/vale-gateway","digest":"{d}","commit":"{}"}}"#,
            "c".repeat(40)
        )
    }

    #[test]
    fn both_shapes_read_to_the_same_offer() {
        let want = Offer {
            version: v("0.1.0-main.20261114093000"),
            digest: Some(digest('a')),
        };
        assert_eq!(
            read(server("0.1.0-main.20261114093000", &digest('a')).as_bytes()),
            Some(want.clone())
        );
        assert_eq!(
            read(bridge("0.1.0-main.20261114093000", &digest('a')).as_bytes()),
            Some(want)
        );
    }

    #[test]
    fn the_bridge_shape_reads_as_before() {
        assert_eq!(
            read(br#"{"version":"0.1.0-main.20261108120000"}"#),
            Some(Offer {
                version: v("0.1.0-main.20261108120000"),
                digest: None
            })
        );
        // A malformed digest is dropped, the version kept.
        assert_eq!(
            read(br#"{"version":"v0.1.0","digest":"sha256:abc"}"#),
            Some(Offer {
                version: v("0.1.0"),
                digest: None
            })
        );
        for bad in [
            &b"not json"[..],
            br#"{"version":"soon"}"#,
            br#"{"notes":"no version"}"#,
            b"[]",
        ] {
            assert_eq!(read(bad), None);
        }
        assert_eq!(read(&vec![b' '; MANIFEST_LIMIT + 1]), None);
    }

    #[test]
    fn a_server_manifest_must_be_the_gateways_own_and_whole() {
        let d = digest('b');
        let ok = server("0.1.0-main.20261114093000", &d);
        assert!(read(ok.as_bytes()).is_some());
        // Optional fields other servers write are fine.
        let by_hand = ok.replacen('{', r#"{"byHand":false,"byHandAt":null,"#, 1);
        assert!(read(by_hand.as_bytes()).is_some());

        let refused = [
            // Another app's manifest (Warpcore's lives in the same repository).
            ok.replace(r#""app":"vale-gateway""#, r#""app":"warpcore""#),
            // No app id.
            ok.replace(r#""app":"vale-gateway","#, ""),
            // Another repository: the image is never taken from the manifest.
            ok.replace("ghcr.io/snds/vale-gateway", "ghcr.io/evil/vale-gateway"),
            ok.replace("ghcr.io/snds/vale-gateway", "docker.io/snds/vale-gateway"),
            // A malformed digest, or none.
            ok.replace(&d, "sha256:abc"),
            ok.replace(&d, ""),
            // No images at all.
            r#"{"app":"vale-gateway","version":"0.1.0-main.20261114093000"}"#.to_string(),
            r#"{"app":"vale-gateway","version":"0.1.0-main.20261114093000","images":{}}"#.to_string(),
            // Two entries for the gateway's repository: which one is meant?
            ok.replace(
                r#""images":{"#,
                &format!(r#""images":{{"other":{{"repository":"ghcr.io/snds/vale-gateway","digest":"{}"}},"#, digest('e')),
            ),
            // A bad version.
            ok.replace("0.1.0-main.20261114093000", "soon"),
        ];
        for (i, body) in refused.iter().enumerate() {
            assert_eq!(read(body.as_bytes()), None, "case {i}: {body}");
        }

        // Another image beside the gateway's is ignored, not taken.
        let two = ok.replace(
            r#""images":{"#,
            &format!(r#""images":{{"relay":{{"repository":"ghcr.io/snds/vale-push-relay","digest":"{}"}},"#, digest('e')),
        );
        assert_eq!(read(two.as_bytes()).unwrap().digest, Some(d));
    }

    #[test]
    fn the_newer_of_the_two_is_offered() {
        let old = "0.1.0-main.20261108000000";
        let new = "0.1.0-main.20261114093000";
        let pick = |feed: Result<String, &str>, bridge_: Result<String, &str>| {
            choose(
                feed.map(String::into_bytes).map_err(str::to_string),
                bridge_.map(String::into_bytes).map_err(str::to_string),
                "unreadable",
            )
        };
        let f = |ver: &str| Ok(server(ver, &digest('f')));
        let b = |ver: &str| Ok(bridge(ver, &digest('b')));

        // Same version in both (the usual case): the feed's.
        assert_eq!(pick(f(new), b(new)).unwrap().digest, Some(digest('f')));
        // A stale feed (its token expired): the bridge's newer build.
        let got = pick(f(old), b(new)).unwrap();
        assert_eq!((got.version, got.digest), (v(new), Some(digest('b'))));
        // A stale bridge (retired): the feed's.
        let got = pick(f(new), b(old)).unwrap();
        assert_eq!((got.version, got.digest), (v(new), Some(digest('f'))));
        // One missing or unreadable: the other.
        assert_eq!(
            pick(Err("nothing published"), b(new)).unwrap().version,
            v(new)
        );
        assert_eq!(pick(f(new), Err("unreachable")).unwrap().version, v(new));
        assert_eq!(pick(Ok("<html>".into()), b(new)).unwrap().version, v(new));
        assert_eq!(pick(f(new), Ok("not json".into())).unwrap().version, v(new));
        // Neither: the feed's own error, or unreadable when it answered with something else.
        assert_eq!(
            pick(Err("unreachable"), Err("nothing published")),
            Err("unreachable".into())
        );
        assert_eq!(
            pick(Ok("<html>".into()), Err("unreachable")),
            Err("unreadable".into())
        );
        assert_eq!(
            pick(Err("nothing published"), Ok("{}".into())),
            Err("nothing published".into())
        );
    }

    #[test]
    fn both_addresses_are_githubs_over_https() {
        for url in [FEED_ENDPOINT, BRIDGE_ENDPOINT] {
            assert!(url.starts_with("https://github.com/snds/"));
            assert!(url.ends_with("/latest.json"));
        }
        assert!(FEED_ENDPOINT.contains("/snds/releases/releases/download/vale-gateway-main/"));
        assert!(BRIDGE_ENDPOINT.contains("/snds/Vale/releases/download/gateway-main/"));
    }
}
