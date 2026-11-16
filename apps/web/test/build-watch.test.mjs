// The build watch's rules (the shared copy in @unicron/ui since 1.1, run on Vale's cases) and
// Vale's reload-safety registry (ADR-0091, ADR-0116).
// Run: pnpm --filter web test   (node --test, TypeScript types stripped by Node).
import assert from "node:assert/strict"
import { test } from "node:test"

import {
  CHECK_EVERY_MS,
  HIDDEN_FOR_MS,
  IDLE_FOR_MS,
  MIN_GAP_MS,
  createBuildWatch,
  quietByTheClock,
  readBuild,
} from "../node_modules/@unicron/ui/dist/lib/update-watch.js"
import { addReloadCheck, beforeReload, canReloadNow, fieldHoldsWords, holdReload, reloadBlockers, saveBeforeReload } from "../src/lib/can-reload.ts"

/** A page on build "a" with a fake clock, server, tab and session storage. */
function page(over = {}) {
  const w = {
    time: 1_000_000,
    served: '{"build":"a"}',
    hidden: false,
    free: true,
    fetches: 0,
    saved: 0,
    reloads: 0,
    noted: null,
    keepsNotes: true,
    ...over,
  }
  w.watch = createBuildWatch({
    current: "a",
    fetchText: async () => {
      w.fetches += 1
      if (w.served instanceof Error) throw w.served
      return w.served
    },
    now: () => w.time,
    hidden: () => w.hidden,
    canReload: () => {
      if (w.free instanceof Error) throw w.free
      return w.free
    },
    save: () => {
      w.saved += 1
    },
    reload: () => {
      w.reloads += 1
    },
    reloadedFor: () => w.noted,
    noteReloaded: (id) => {
      if (w.keepsNotes) w.noted = id
    },
  })
  w.pass = (ms) => {
    w.time += ms
  }
  return w
}

test("readBuild takes only a small JSON object with a plain build string", () => {
  assert.equal(readBuild('{"build":"3f9c2a71d0b4"}'), "3f9c2a71d0b4")
  assert.equal(readBuild('{"build":"0.1.0-main.20261108093000"}'), "0.1.0-main.20261108093000")
  for (const bad of [
    null,
    undefined,
    "",
    "<!doctype html><html><head><title>Sign in</title></head></html>",
    "Bad Gateway",
    "null",
    "[]",
    '["a"]',
    '"a"',
    "{}",
    '{"build":7}',
    '{"build":""}',
    '{"build":"<script>"}',
    '{"build":"has space"}',
    `{"build":"${"a".repeat(65)}"}`,
    `{"build":"a","pad":"${"x".repeat(5000)}"}`,
  ]) {
    assert.equal(readBuild(bad), null, String(bad).slice(0, 40))
  }
})

test("quiet is a minute hidden or five minutes idle", () => {
  assert.equal(quietByTheClock(1000, null, 1000), false)
  assert.equal(quietByTheClock(1000 + IDLE_FOR_MS - 1, null, 1000), false)
  assert.equal(quietByTheClock(1000 + IDLE_FOR_MS, null, 1000), true)
  assert.equal(quietByTheClock(1000 + HIDDEN_FOR_MS - 1, 1000, 1000), false)
  assert.equal(quietByTheClock(1000 + HIDDEN_FOR_MS, 1000, 1000), true)
})

test("the same id is not news, a different one is, and going back clears it", async () => {
  const w = page()
  let changes = 0
  w.watch.subscribe(() => (changes += 1))
  let s = await w.watch.check()
  assert.deepEqual({ latest: s.latest, ready: s.ready, needed: s.needed }, { latest: null, ready: false, needed: false })
  assert.equal(s.checkedAt, w.time)

  w.served = '{"build":"b"}'
  s = await w.watch.check(true)
  assert.deepEqual({ current: s.current, latest: s.latest, ready: s.ready }, { current: "a", latest: "b", ready: true })

  // Rolled back to this page's build: nothing to offer any more.
  w.served = '{"build":"a"}'
  s = await w.watch.check(true)
  assert.deepEqual({ latest: s.latest, ready: s.ready }, { latest: null, ready: false })
  assert.equal(changes, 3)
  assert.equal(w.reloads, 0)
})

test("an answer that cannot be read means can't tell: never new, and never clears an offer", async () => {
  for (const unreadable of ["<html>Sign in</html>", "", null, new Error("offline"), '{"build":5}']) {
    const w = page({ served: unreadable })
    let s = await w.watch.check()
    assert.equal(s.ready, false)
    assert.equal(s.checkedAt, null)

    w.served = '{"build":"b"}'
    s = await w.watch.check(true)
    assert.equal(s.ready, true)
    w.served = unreadable
    s = await w.watch.check(true)
    assert.equal(s.ready, true, "the offer stays")
    assert.equal(s.latest, "b")
  }
})

test("checks close together are dropped, and one at a time", async () => {
  const w = page()
  const both = [w.watch.check(), w.watch.check()]
  await Promise.all(both)
  assert.equal(w.fetches, 1, "the second joined the first")
  await w.watch.check()
  assert.equal(w.fetches, 1, "inside the gap")
  w.pass(MIN_GAP_MS)
  await w.watch.check()
  assert.equal(w.fetches, 2)
  await w.watch.check(true)
  assert.equal(w.fetches, 3, "force skips the gap")
})

test("the clock asks every 15 minutes while visible, and not while hidden", async () => {
  const w = page()
  await w.watch.tick()
  await w.watch.check()
  assert.equal(w.fetches, 1, "the first tick asks")
  w.pass(CHECK_EVERY_MS - 1)
  await w.watch.tick()
  assert.equal(w.fetches, 1)
  w.pass(1)
  await w.watch.tick()
  await w.watch.check()
  assert.equal(w.fetches, 2)

  w.hidden = true
  w.watch.visibility()
  w.pass(CHECK_EVERY_MS * 3)
  await w.watch.tick()
  assert.equal(w.fetches, 2, "hidden: no asking")
  w.hidden = false
  w.watch.visibility()
  await w.watch.check()
  assert.equal(w.fetches, 3, "becoming visible asks")
  w.pass(MIN_GAP_MS)
  w.watch.online()
  await w.watch.check()
  assert.equal(w.fetches, 4, "coming back online asks")
})

test("a new build reloads by itself only after five idle minutes, and saves first", async () => {
  const w = page({ served: '{"build":"b"}' })
  await w.watch.check()
  await w.watch.tick()
  assert.equal(w.reloads, 0, "someone may be here")
  w.pass(IDLE_FOR_MS - 1)
  w.watch.activity()
  w.pass(IDLE_FOR_MS - 1)
  await w.watch.tick()
  assert.equal(w.reloads, 0, "activity starts the wait again")
  w.pass(1)
  await w.watch.tick()
  assert.equal(w.reloads, 1)
  assert.equal(w.saved, 1)
  assert.equal(w.noted, "b")
  await w.watch.tick()
  assert.equal(w.reloads, 1, "one reload")
})

test("a hidden tab reloads after a minute; coming back cancels the wait", async () => {
  const w = page({ served: '{"build":"b"}' })
  await w.watch.check()
  w.hidden = true
  w.watch.visibility()
  w.pass(HIDDEN_FOR_MS - 1)
  await w.watch.tick()
  assert.equal(w.reloads, 0)
  w.hidden = false
  w.watch.visibility()
  w.pass(HIDDEN_FOR_MS)
  await w.watch.tick()
  assert.equal(w.reloads, 0, "visible again: the hidden minute no longer counts")
  w.hidden = true
  w.watch.visibility()
  w.pass(HIDDEN_FOR_MS)
  await w.watch.tick()
  assert.equal(w.reloads, 1)
})

test("it never reloads by itself while the app says work would be lost", async () => {
  for (const notFree of [false, new Error("a check broke")]) {
    const w = page({ served: '{"build":"b"}', free: notFree })
    await w.watch.check()
    w.pass(IDLE_FOR_MS * 10)
    await w.watch.tick()
    assert.equal(w.reloads, 0)
    assert.equal(w.watch.state().ready, true, "it keeps offering")
    assert.equal(w.noted, null, "nothing is noted for a reload that did not happen")
    // Reload pressed: at once, saved first.
    w.watch.reloadNow()
    assert.equal(w.saved, 1)
    assert.equal(w.reloads, 1)
  }
})

test("once per id: a deploy that still serves the old page cannot loop", async () => {
  // This tab already reloaded for "b" and still runs "a".
  const w = page({ served: '{"build":"b"}', noted: "b" })
  await w.watch.check()
  w.pass(IDLE_FOR_MS * 10)
  await w.watch.tick()
  assert.equal(w.reloads, 0)
  assert.equal(w.watch.state().ready, true)
  // A later build is a new id: one more try.
  w.served = '{"build":"c"}'
  await w.watch.check(true)
  await w.watch.tick()
  assert.equal(w.reloads, 1)
  assert.equal(w.noted, "c")
})

test("where the once-per-id note cannot be kept, it only offers", async () => {
  const w = page({ served: '{"build":"b"}', keepsNotes: false })
  await w.watch.check()
  w.pass(IDLE_FOR_MS * 10)
  await w.watch.tick()
  assert.equal(w.reloads, 0)
  assert.equal(w.watch.state().ready, true)
})

test("a lazy file that fails: reload as soon as nothing would be lost, else say Reload to continue", async () => {
  // No new build known: not the watch's business.
  let w = page()
  assert.equal(await w.watch.preloadFailed(), false)
  assert.equal(w.watch.state().needed, false)
  assert.equal(w.reloads, 0)

  // A new build, and the app says work would be lost: say so, don't reload.
  w = page({ served: '{"build":"b"}', free: false })
  assert.equal(await w.watch.preloadFailed(), false)
  assert.deepEqual({ ready: w.watch.state().ready, needed: w.watch.state().needed }, { ready: true, needed: true })
  assert.equal(w.reloads, 0)

  // A new build, someone just clicked, nothing would be lost: the page is blocked anyway, so it
  // reloads without waiting for a quiet moment (Unicron 1.1, Updates 5; Vale waited before).
  w = page({ served: '{"build":"b"}' })
  assert.equal(await w.watch.preloadFailed(), true)
  assert.equal(w.reloads, 1)
  assert.equal(w.saved, 1)
})

test("a failing saver does not stop a reload a person asked for", () => {
  const w = page()
  w.watch = createBuildWatch({
    current: "a",
    fetchText: async () => null,
    now: () => 0,
    hidden: () => false,
    canReload: () => true,
    save: () => {
      throw new Error("disk full")
    },
    reload: () => {
      w.reloads += 1
    },
    reloadedFor: () => null,
    noteReloaded: () => {},
  })
  w.watch.reloadNow()
  w.watch.reloadNow()
  assert.equal(w.reloads, 1)
})

test("canReloadNow: holds, standing checks, and a broken check all say not now", () => {
  assert.equal(canReloadNow(), true)
  const release = holdReload("a message is being sent")
  const other = holdReload("an upload")
  assert.equal(canReloadNow(), false)
  assert.deepEqual(reloadBlockers(), ["a message is being sent", "an upload"])
  release()
  release()
  assert.deepEqual(reloadBlockers(), ["an upload"])
  other()
  assert.equal(canReloadNow(), true)

  let dirty = true
  const remove = addReloadCheck("unsaved writing", () => dirty)
  assert.equal(canReloadNow(), false)
  dirty = false
  assert.equal(canReloadNow(), true)
  const broken = addReloadCheck("a broken check", () => {
    throw new Error("no document")
  })
  assert.deepEqual(reloadBlockers(), ["a broken check"])
  broken()
  remove()
  assert.equal(canReloadNow(), true)
})

test("saveBeforeReload runs every saver, even after one fails", () => {
  const ran = []
  const a = beforeReload(() => {
    ran.push("a")
    throw new Error("a failed")
  })
  const b = beforeReload(() => ran.push("b"))
  saveBeforeReload()
  assert.deepEqual(ran, ["a", "b"])
  a()
  b()
  saveBeforeReload()
  assert.deepEqual(ran, ["a", "b"])
})

test("fieldHoldsWords: any field with words in it, with or without the caret", () => {
  const field = (over) => ({ type: "text", value: "", disabled: false, readOnly: false, ...over })
  // A name typed on the booking page and left for the next field still counts.
  assert.equal(fieldHoldsWords(field({ value: "Ada" })), true)
  assert.equal(fieldHoldsWords(field({ type: "textarea", value: "Dear Sam," })), true)
  assert.equal(fieldHoldsWords(field({ type: "password", value: "x" })), true)
  assert.equal(fieldHoldsWords(field({ type: "email", value: "a@b.example" })), true)
  // Nothing typed, or nothing a person can type in.
  assert.equal(fieldHoldsWords(field()), false)
  assert.equal(fieldHoldsWords(field({ value: "saved", disabled: true })), false)
  assert.equal(fieldHoldsWords(field({ value: "shown", readOnly: true })), false)
  for (const type of ["button", "checkbox", "color", "file", "hidden", "image", "radio", "range", "reset", "submit"]) {
    assert.equal(fieldHoldsWords(field({ type, value: "on" })), false, type)
  }
})
