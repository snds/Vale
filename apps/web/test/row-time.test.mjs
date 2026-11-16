// A row's time (cross-app settlement): the clock today, the weekday this week, the date before; the relative age for the tooltip.
// Run: pnpm --filter web test   (node --test, TypeScript types stripped by Node).
import assert from "node:assert/strict"
import { test } from "node:test"

import { relativeAge, rowTime } from "../src/features/mail/row-time.ts"

const now = new Date(2026, 10, 12, 9, 16)
const at = (y, m, d, h = 0, min = 0) => new Date(y, m, d, h, min).getTime() / 1000

test("today the clock, this week the weekday, older the date", () => {
  assert.equal(rowTime(at(2026, 10, 12, 8, 5), now), "08:05")
  assert.equal(rowTime(at(2026, 10, 10, 14, 0), now), new Date(2026, 10, 10).toLocaleDateString(undefined, { weekday: "short" }))
  assert.equal(rowTime(at(2026, 10, 2, 14, 0), now), "11.02")
  assert.equal(rowTime(at(2025, 10, 2, 14, 0), now), "2025.11.02")
})

test("the tooltip says how long ago, in words", () => {
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" })
  assert.equal(relativeAge(now.getTime() / 1000 - 2 * 3600, now), rtf.format(-2, "hour"))
  assert.equal(relativeAge(now.getTime() / 1000 - 30, now), rtf.format(0, "second"))
  assert.equal(relativeAge(now.getTime() / 1000 - 3 * 86_400, now), rtf.format(-3, "day"))
  assert.equal(relativeAge(now.getTime() / 1000 + 3 * 86_400, now), rtf.format(3, "day"))
})
