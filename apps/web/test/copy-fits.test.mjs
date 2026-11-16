// When the clipboard is blocked, which values show in the toast and which open the review dialog (Vale 16).
// Run: pnpm --filter web test   (node --test, TypeScript types stripped by Node).
import assert from "node:assert/strict"
import { test } from "node:test"

import { TOAST_LINE, fitsInToast } from "../src/lib/copy-fits.ts"

test("up to two lines show in the toast", () => {
  assert.equal(fitsInToast("https://vale.example/book/intro"), true)
  assert.equal(fitsInToast("Meeting ID 812 3344 0012\nPasscode 551920"), true)
  assert.equal(fitsInToast("x".repeat(TOAST_LINE * 2)), true, "two full lines")
  assert.equal(fitsInToast(""), true)
})

test("longer text opens the review dialog instead", () => {
  assert.equal(fitsInToast("one\ntwo\nthree"), false)
  assert.equal(fitsInToast("x".repeat(TOAST_LINE * 2 + 1)), false, "a third line by width")
  assert.equal(fitsInToast("# Cabin packing list\n\n- [ ] Boots\n- [ ] Lantern"), false, "a whole note")
})
