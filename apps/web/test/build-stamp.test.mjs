// The build stamp (ADR-0091): the id, the page's tag and build.json agree, and the page's own
// reader takes what the build writes.
import assert from "node:assert/strict"
import { test } from "node:test"

import { BUILD_META, buildId, buildJson, stampPage } from "../build-stamp.ts"
import { readBuild } from "../src/lib/build-watch.ts"

const files = [
  ["index.html", "<html><head></head><body></body></html>"],
  ["assets/index-abc.js", "console.log(1)"],
  ["assets/index-abc.css", new Uint8Array([1, 2, 3])],
]

test("the id is the files' own: same files, same id, in any order", () => {
  const id = buildId(files)
  assert.match(id, /^[0-9a-f]{20}$/)
  assert.equal(buildId([...files].reverse()), id)
  assert.equal(buildId(files.map(([n, c]) => [n, typeof c === "string" ? Buffer.from(c) : c])), id, "text or bytes")
})

test("any change to a file's content or name changes the id", () => {
  const id = buildId(files)
  assert.notEqual(buildId([files[0], ["assets/index-abc.js", "console.log(2)"], files[2]]), id)
  assert.notEqual(buildId([files[0], ["assets/index-abd.js", "console.log(1)"], files[2]]), id)
  assert.notEqual(buildId(files.slice(0, 2)), id)
  // Where one file ends and the next starts is part of the id.
  assert.notEqual(buildId([["a", "bc"]]), buildId([["ab", "c"]]))
})

test("the page's tag and build.json carry the same id, and the page's reader takes it", () => {
  const id = buildId(files)
  const page = stampPage(files[0][1], id)
  assert.equal(page.match(new RegExp(`<meta name="${BUILD_META}" content="([^"]+)" />`))[1], id)
  assert.ok(page.indexOf(BUILD_META) < page.indexOf("</head>"))
  assert.equal(readBuild(buildJson(id)), id)
  assert.equal(stampPage("<html><body></body></html>", id), null, "no head, no stamp")
})
