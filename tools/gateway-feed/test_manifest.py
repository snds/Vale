#!/usr/bin/env python3
"""Tests for manifest.py. Run: python3 tools/gateway-feed/test_manifest.py"""

import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import unittest

# No __pycache__ beside the script.
sys.dont_write_bytecode = True

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("manifest", os.path.join(HERE, "manifest.py"))
manifest = importlib.util.module_from_spec(spec)
spec.loader.exec_module(manifest)

V1 = "0.1.0-main.20261108093000"
V2 = "0.1.0-main.20261114093000"
COMMIT = "c" * 40
DIGEST = "sha256:" + "a" * 64
IMAGE = f"ghcr.io/snds/vale-gateway@{DIGEST}"


def published(version):
    return json.dumps({"app": "vale-gateway", "version": version})


class Build(unittest.TestCase):
    def test_the_server_shape(self):
        self.assertEqual(
            manifest.build(V2, COMMIT, IMAGE),
            {
                "app": "vale-gateway",
                "version": V2,
                "commit": COMMIT,
                "pubDate": "2026-11-14T09:30:00Z",
                "images": {"gateway": {"repository": "ghcr.io/snds/vale-gateway", "digest": DIGEST}},
            },
        )

    def test_a_newer_version_replaces_an_older_one(self):
        self.assertEqual(manifest.build(V2, COMMIT, IMAGE, published(V1))["version"], V2)
        # A new x.y.z follows the old one's release.
        self.assertEqual(manifest.build("0.2.0-main.20261114093000", COMMIT, IMAGE, published("0.1.0"))["version"], "0.2.0-main.20261114093000")

    def refused(self, code, *args):
        with self.assertRaises(manifest.Refused) as c:
            manifest.build(*args)
        self.assertEqual(c.exception.code, code, str(c.exception))

    def test_it_never_goes_backwards(self):
        self.refused(manifest.ALREADY, V2, COMMIT, IMAGE, published(V2))
        self.refused(manifest.NEWER_PUBLISHED, V1, COMMIT, IMAGE, published(V2))
        # A release follows its own main builds, as semver orders them.
        self.refused(manifest.NEWER_PUBLISHED, V2, COMMIT, IMAGE, published("0.1.0"))
        # 0.10.0 is after 0.9.0: numbers, not text.
        self.refused(manifest.NEWER_PUBLISHED, "0.9.0-main.20261114093000", COMMIT, IMAGE, published("0.10.0-main.20261101000000"))

    def test_an_unreadable_published_manifest_is_never_written_over(self):
        for text in ["", "not json", "[]", "{}", '{"version": 7}', '{"version": "soon"}']:
            self.refused(manifest.BAD, V2, COMMIT, IMAGE, text)

    def test_bad_inputs(self):
        self.refused(manifest.BAD, "0.1.0", COMMIT, IMAGE)
        self.refused(manifest.BAD, "0.1.0-main.2026", COMMIT, IMAGE)
        self.refused(manifest.BAD, V2, "abc", IMAGE)
        self.refused(manifest.BAD, V2, COMMIT.upper(), IMAGE)
        for image in [
            "ghcr.io/snds/vale-gateway",
            "ghcr.io/snds/vale-gateway:main",
            "ghcr.io/snds/vale-gateway@sha256:abc",
            f"ghcr.io/evil/vale-gateway@{DIGEST}",
            f"docker.io/snds/vale-gateway@{DIGEST}",
            f"ghcr.io/snds/vale-gateway@md5:{'a' * 64}",
        ]:
            self.refused(manifest.BAD, V2, COMMIT, image)


class CommandLine(unittest.TestCase):
    def run_it(self, *args):
        return subprocess.run([sys.executable, os.path.join(HERE, "manifest.py"), *args], capture_output=True, text=True)

    def test_writes_only_on_success(self):
        with tempfile.TemporaryDirectory() as d:
            out = os.path.join(d, "latest.json")
            prev = os.path.join(d, "published.json")
            base = ["--commit", COMMIT, "--image", IMAGE, "--out", out]

            r = self.run_it("--version", V1, *base)
            self.assertEqual(r.returncode, 0, r.stderr)
            with open(out, encoding="utf-8") as f:
                first = f.read()
            self.assertEqual(json.loads(first)["version"], V1)
            self.assertTrue(first.endswith("}\n"))

            with open(prev, "w", encoding="utf-8") as f:
                f.write(first)
            os.remove(out)
            r = self.run_it("--version", V1, *base, "--previous", prev)
            self.assertEqual(r.returncode, manifest.ALREADY)
            self.assertIn("already published", r.stderr)
            self.assertFalse(os.path.exists(out))

            r = self.run_it("--version", V2, *base, "--previous", prev)
            self.assertEqual(r.returncode, 0, r.stderr)
            with open(prev, "w", encoding="utf-8") as f, open(out, encoding="utf-8") as g:
                f.write(g.read())
            os.remove(out)
            r = self.run_it("--version", V1, *base, "--previous", prev)
            self.assertEqual(r.returncode, manifest.NEWER_PUBLISHED)
            self.assertFalse(os.path.exists(out))

            r = self.run_it("--version", V2, "--commit", COMMIT, "--image", "ghcr.io/snds/vale-gateway:main", "--out", out)
            self.assertEqual(r.returncode, manifest.BAD)
            self.assertFalse(os.path.exists(out))


class TheGatewayReadsIt(unittest.TestCase):
    """The names here are the ones apps/gateway/src/feed.rs checks."""

    def test_names_match_the_reader(self):
        with open(os.path.join(HERE, "..", "..", "apps", "gateway", "src", "feed.rs"), encoding="utf-8") as f:
            reader = f.read()
        self.assertIn(f'pub const APP_ID: &str = "{manifest.APP}";', reader)
        self.assertIn(f'pub const IMAGE: &str = "{manifest.REPOSITORY}";', reader)


if __name__ == "__main__":
    unittest.main()
