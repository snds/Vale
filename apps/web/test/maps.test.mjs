// Where MAP opens a place (Vale 48).
// Run: pnpm --filter web test   (node --test, TypeScript types stripped by Node).
import assert from "node:assert/strict"
import { test } from "node:test"

import { isApplePlatform, mapLink } from "../src/lib/maps.ts"

test("Apple devices open the system's maps app", () => {
  for (const p of [{ platform: "MacIntel" }, { userAgentData: { platform: "macOS" } }, { platform: "iPhone" }, { userAgent: "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)" }]) {
    assert.equal(isApplePlatform(p), true, JSON.stringify(p))
    assert.equal(mapLink("Café Lisboa, Lisbon", p), "maps://?q=Caf%C3%A9%20Lisboa%2C%20Lisbon")
  }
})

test("everything else opens OpenStreetMap's search", () => {
  for (const p of [{ platform: "Win32" }, { platform: "Linux x86_64" }, { userAgentData: { platform: "Android" } }, {}]) {
    assert.equal(isApplePlatform(p), false, JSON.stringify(p))
    assert.equal(mapLink("Café Lisboa", p), "https://www.openstreetmap.org/search?query=Caf%C3%A9%20Lisboa")
  }
})
