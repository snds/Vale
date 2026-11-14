// Mail: the lanes, a conversation, reading and writing. Search is in search.mjs.
import { area, button, closeForm, tabBar, discardQuestion, ensure, formatBar, formLayer, goBack, groups, headTitle, leaveLayer, oneCurrent, pick, press, switcher, switcherLayer, toastGone } from "./helpers.mjs"
import { settings } from "./settings.mjs"

/** Opens a conversation in the Inbox list by its subject. */
export const conversation = (app, subject) => press(app, app.page.getByRole("list", { name: "Inbox" }).getByRole("button", { name: subject }).first())
/** Opens a lane (Unread, Starred, Snoozed…) from Mail's folders: the sidebar, or the page head's sheet or popover. */
export const lane = async (app, name) => {
  await pick(app, name)
  // The press lands where a row now stands: the pointer leaves it, so no hover is in the picture by chance.
  await app.page.mouse.move(0, 0)
  await app.settle()
}
/** Opens a new message; returns its dialog. */
export const compose = async (app) => {
  await press(app, button(app.page, "Compose"))
  return app.page.getByRole("dialog", { name: "New message" })
}

/** Writes a message to Marcus and sends it. */
export const send = async (app, subject) => {
  const message = await compose(app)
  await message.getByRole("combobox", { name: "To" }).pressSequentially("Marcus")
  await press(app, app.page.getByRole("option", { name: /Marcus Lee/ }))
  await message.getByRole("textbox", { name: "Subject" }).fill(subject)
  await press(app, message.getByRole("button", { name: "Send", exact: true }))
  await message.waitFor({ state: "detached" })
  await app.settle()
}
const toasts = (page) => page.locator("[data-sonner-toast]")
const visibleBoxes = async (list) => {
  const boxes = []
  for (const el of await list.all()) if (await el.isVisible()) boxes.push(await el.boundingBox())
  return boxes.filter(Boolean)
}
/** The bars at the phone's foot: the bottom row, a strip above it, a toast in the strip's slot. */
const bars = async (page) => 1 + ((await page.locator('[data-slot="accessory"]:not([data-compact]):visible').count()) ? 1 : 0) + (await visibleBoxes(page.locator("[data-sonner-toast]"))).filter((b) => b.y > 422).length
const strip = (page) => page.locator('[data-slot="accessory"]')
/** Archives a conversation from its own action bar: a finished action, so a toast with Undo. */
const archive = async (app, subject) => {
  await conversation(app, subject)
  // The conversation's own action: Mail's folders have an Archive too, in the sidebar (ADR-0084).
  await app.page.getByRole("region", { name: "Mail: what is open" }).getByRole("button", { name: "Archive", exact: true }).click()
}

/** A conversation's row in a mail list, by its subject: the swipe row around the message row. */
const rowOf = (page, subject, list = "Inbox") =>
  page.getByRole("list", { name: list, exact: true }).getByRole("listitem").filter({ has: page.getByRole("button", { name: subject }) }).first().locator('[data-slot="swipe-row"]')
/** The tiles a row shows open, by their words. */
const tiles = async (row) => (await row.locator('[data-slot="swipe-action"]').allInnerTexts()).map((t) => t.trim())
/** The row's overflow button: its name is its word, then the row's. */
const moreOf = (row) => row.getByRole("button", { name: /^More actions/ })
const menu = (page) => page.getByRole("menu").last()
/** The Inbox's chips (brief M2): a radio group named Show; a chip by its name (a split's count follows it). */
const chips = (page) => page.getByRole("radiogroup", { name: "Show", exact: true })
const chip = (page, name) => chips(page).getByRole("radio", { name: new RegExp(`^${name}(\\W|$)`) })
/** The Screener's pointer row at the top of the Inbox: its main control is the word Screener. */
const screenerPointer = (page) => page.locator('[data-slot="list-row"]').filter({ hasText: "3 new senders waiting" }).getByRole("button", { name: /^Screener/ })
const newSplit = (page) => page.getByRole("button", { name: "New split", exact: true })
/** The newsletter bundle above the Inbox's conversations. */
const bundle = (page) => page.locator('[data-slot="swipe-row"]').filter({ has: page.locator('[data-slot="list-row-sender"]', { hasText: /^Newsletters$/ }) })

/**
 * Drags a row sideways (dx) or down (dy) as a finger does on a phone (Chromium's touch input, so the
 * browser scrolls and makes pointer events as it does for a real touch), or with the mouse on a desktop.
 * A left drag starts near the row's end, a right one 64 px in: clear of the screen's back edge.
 */
const drag = async (app, row, dx, dy = 0) => {
  const { page } = app
  const box = await row.boundingBox()
  const x0 = Math.round(dx < 0 ? box.x + box.width - 48 : dx > 0 ? box.x + 64 : box.x + box.width / 2)
  const y0 = Math.round(box.y + box.height / 2)
  const steps = 12
  const at = (i) => [Math.round(x0 + (dx * i) / steps), Math.round(y0 + (dy * i) / steps)]
  if (app.touch) {
    const cdp = await page.context().newCDPSession(page)
    const touch = (type, x, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y, id: 1 }] })
    await touch("touchStart", x0, y0)
    for (let i = 1; i <= steps; i++) await touch("touchMove", ...at(i))
    await touch("touchEnd")
    await cdp.detach()
  } else {
    await page.mouse.move(x0, y0)
    await page.mouse.down()
    for (let i = 1; i <= steps; i++) await page.mouse.move(...at(i))
    await page.mouse.up()
  }
  await page.waitForTimeout(200)
  await app.settle()
}

/** A press somewhere that is not the row: an open row closes on it. */
const pressOutside = async (app) => {
  await app.page.evaluate(() => document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })))
  await app.settle()
}

export const scenes = [
  {
    // Mobile / 01 and Desktop / 01's list (ADR-0090; brief M1): message rows with no face, the time as the
    // frames write it, the account with All chosen, and the overflow button always there on touch.
    name: "mail-inbox",
    sean: { kind: "drawn", area: "mail", screen: "inbox" },
    assert: async (app) => {
      const { page } = app
      const list = page.getByRole("list", { name: "Inbox", exact: true })
      ensure(!(await list.locator('[data-slot="avatar"], [data-slot="initial-tile"]').count()), "a row shows a face (Q8: rows have none)")
      for (const t of await list.locator('[data-slot="list-row-time"]').allInnerTexts()) ensure(/^(WORK|PERSONAL) \/\/ (\d\d:\d\d|[A-Z]{3}|\d\d\.\d\d)$/.test(t.trim()), `a row's time reads "${t.trim()}", not as the frames write it`)
      ensure((await page.locator('[data-slot="page-head-overline"]:visible').first().innerText()).trim() === "INBOX // ALL ACCOUNTS", "the overline is not INBOX // ALL ACCOUNTS")
      const more = list.getByRole("button", { name: /^More actions/ }).first()
      if (app.touch) ensure(await more.evaluate((el) => getComputedStyle(el.closest('[data-slot="list-row-menu"]')).opacity === "1"), "the overflow button is hidden on touch")
    },
  },
  {
    // What a row tells without opening it (brief M1), all from the demo's own data: the thread's count, a star,
    // an attachment, the account, and NO REPLY YET on your own mail once its reminder came due.
    name: "mail-row-facts",
    sizes: ["desktop", "phone"],
    scenario: "no-reply-yet",
    assert: async ({ page }) => {
      const list = page.getByRole("list", { name: "Inbox", exact: true })
      const rows = list.locator('[data-slot="list-row"]')
      ensure(await rows.filter({ has: page.locator('[data-slot="list-row-count"]', { hasText: /^0[2-9]$/ }) }).count(), "no row shows its thread's count")
      ensure(await rows.filter({ has: page.getByRole("img", { name: "Starred" }) }).count(), "no row shows a star")
      ensure(await rows.filter({ has: page.getByRole("img", { name: "Has attachments" }) }).count(), "no row shows an attachment")
      ensure(await rows.filter({ has: page.locator('[data-slot="list-row-time"]', { hasText: /^Work \/\// }) }).count(), "no row names its account")
      const nudged = rows.filter({ has: page.locator('[data-slot="badge"]', { hasText: /no reply yet/i }) })
      ensure((await nudged.count()) === 1, `${await nudged.count()} rows say No reply yet, not one`)
      ensure(/^To /.test((await nudged.locator('[data-slot="list-row-sender"]').innerText()).trim()), "the row with No reply yet does not say who it went to")
    },
    // Remind me in 3 days, from the row's menu: the reminder moves on, so the row goes back to Waiting.
    run: async (app) => {
      const { page } = app
      const row = page.getByRole("list", { name: "Inbox", exact: true }).locator('[data-slot="list-row"]').filter({ has: page.locator('[data-slot="badge"]') }).first()
      await row.locator('[data-slot="list-row-main"]').focus()
      await page.keyboard.press("Shift+F10")
      await press(app, menu(page).getByRole("menuitem", { name: "Remind me in 3 days", exact: true }))
      await page.locator("[data-sonner-toast]").filter({ hasText: "If nobody replies, this comes back in 3 days" }).waitFor()
      ensure(!(await page.getByRole("list", { name: "Inbox", exact: true }).locator('[data-slot="badge"]').count()), "Remind me in 3 days left the row in the Inbox with No reply yet")
      await toastGone(app)
      // The picture: the Inbox with the reminder come due again, as the scenario starts.
      await page.reload()
      await app.settle()
    },
  },
  { name: "mail-conversation", run: (app) => conversation(app, /Token audit/) }, // three messages, and the sender beside them
  { name: "mail-invitation", run: (app) => conversation(app, /Invitation: Design crit/) },
  { name: "mail-attachments", run: (app) => conversation(app, /Your booking is confirmed/) },
  { name: "mail-html", run: (app) => conversation(app, /Design Systems Weekly/) }, // an HTML message, remote images held back
  {
    name: "mail-sender",
    sizes: ["phone"], // from tablet up, the sender's panel sits beside the conversation
    run: async (app) => {
      await conversation(app, /Token audit/)
      await press(app, app.page.getByRole("button", { name: /^About / }))
    },
  },
  {
    name: "mail-summary", // opt-in AI (ADR-0059): the demo answers for a model on this computer
    run: async (app) => {
      await settings(app, "AI summaries and replies")
      await press(app, app.page.getByRole("radio", { name: /On this computer/ }))
      await app.page.getByRole("combobox", { name: "Model" }).selectOption("llama3.2")
      await area(app, "Mail")
      await conversation(app, /Token audit/)
      await press(app, button(app.page, "Summarize"))
    },
  },
  {
    name: "mail-snooze-menu",
    run: async (app) => {
      await conversation(app, /Token audit/)
      await press(app, button(app.page, "Snooze"))
    },
    // The presets, then any date and time (ADR-0088; brief M8).
    assert: async ({ page }) => ensure(await page.getByRole("menuitem", { name: "Pick date and time…" }).isVisible(), "the snooze menu has no custom time"),
  },
  {
    // Snooze until any date and time: the shared picker, titled for the job, with its one primary.
    name: "mail-snooze-time",
    run: async (app) => {
      await conversation(app, /Token audit/)
      await press(app, button(app.page, "Snooze"))
      await press(app, app.page.getByRole("menuitem", { name: "Pick date and time…" }))
      const picker = app.page.getByRole("dialog", { name: "Snooze" })
      // Tomorrow, at the hour it opens on: the conversation leaves the inbox until then.
      await press(app, picker.getByRole("gridcell", { name: /^Friday, November 13/ }))
      await press(app, picker.getByRole("button", { name: "Snooze", exact: true }))
      ensure(!(await picker.count()), "Snooze did not close the picker")
      await toasts(app.page).filter({ hasText: /Snoozed/ }).first().waitFor()
      await toastGone(app)
      // The picture: the picker again, on another conversation.
      await conversation(app, /Cabin weekend/)
      await press(app, button(app.page, "Snooze"))
      await press(app, app.page.getByRole("menuitem", { name: "Pick date and time…" }))
      await app.page.mouse.move(0, 0)
    },
    assert: async ({ page }) => ensure(await page.getByRole("dialog", { name: "Snooze" }).getByRole("button", { name: "Snooze", exact: true }).isVisible(), "the snooze picker has no Snooze button"),
  },
  {
    name: "mail-archived-toast", // a toast with Undo, taken while it shows
    run: async (app) => {
      await archive(app, /Cabin weekend/)
      await toasts(app.page).first().waitFor()
    },
  },
  {
    // Where a toast stands (ADR-0086; cross-app decisions §1): the bottom left of the content on a
    // desktop; on a phone the status strip's slot, so the foot never holds three bars, and never
    // over a strip with an action: it waits for a send's undo window to end.
    name: "toast-placement",
    sizes: ["desktop", "phone", "medium"],
    run: async (app) => {
      const { page } = app
      if (app.phone) {
        await send(app, "Saturday ferry")
        await archive(app, /Cabin weekend/)
        await app.settle()
        await page.waitForTimeout(600)
        ensure(await strip(page).getByRole("button", { name: "Undo", exact: true }).isVisible(), "the sending strip left for a toast")
        const held = await strip(page).boundingBox()
        for (const box of await visibleBoxes(toasts(page))) ensure(box.y + box.height <= held.y || box.y >= held.y + held.height, "a toast covers the sending strip")
        ensure((await bars(page)) <= 2, `the foot holds ${await bars(page)} bars`)
        // The send is taken back, so the slot is free and the toast that waited takes it.
        await press(app, strip(page).getByRole("button", { name: "Undo", exact: true }))
        // The message is back with its recipient and subject, so closing it asks first (ADR-0087).
        await closeForm(app)
      } else await archive(app, /Cabin weekend/)
      await toasts(page).filter({ hasText: "Archived" }).first().waitFor()
      await page.mouse.move(0, 0)
    },
    assert: async (app) => {
      const { page } = app
      const toast = toasts(page).filter({ hasText: "Archived" }).first()
      const box = await toast.boundingBox()
      ensure(await toast.getByRole("button", { name: "Undo", exact: true }).isVisible(), "the toast has no Undo")
      ensure((await toast.getByRole("button").count()) === 1, "the toast holds more than one action")
      if (app.phone) {
        const row = await page.locator('[data-slot="app-frame-bottom-row-bar"]').boundingBox()
        ensure(!(await strip(page).isVisible()), "a strip and a toast both stand above the bottom row")
        ensure(box.y + box.height <= row.y && row.y - (box.y + box.height) <= 16, `the toast is not in the strip's slot: it ends at ${Math.round(box.y + box.height)}, the row starts at ${Math.round(row.y)}`)
        ensure(Math.round(box.x) === 16 && Math.round(box.x + box.width) === app.viewport.width - 16, `the toast spans ${Math.round(box.x)} to ${Math.round(box.x + box.width)}`)
        ensure((await bars(page)) === 2, `the foot holds ${await bars(page)} bars`)
      } else {
        const content = await page.locator('[data-slot="app-frame-status-line"]').boundingBox()
        ensure(Math.abs(box.x - content.x) <= 1, `the toast starts at ${Math.round(box.x)}, the content at ${Math.round(content.x)}`)
        ensure(app.viewport.height - (box.y + box.height) <= 48, "the toast is not at the bottom")
        ensure(box.x + box.width / 2 < content.x + content.width / 2, "the toast is not at the left of the content")
      }
    },
  },
  {
    name: "mail-attachment-preview",
    run: async (app) => {
      await conversation(app, /Your booking is confirmed/)
      await press(app, app.page.getByRole("button", { name: /what-to-bring\.txt/ }).first())
    },
  },
  {
    name: "mail-unsubscribe",
    run: async (app) => {
      await conversation(app, /Design Systems Weekly/)
      await press(app, button(app.page, "Unsubscribe"))
    },
  },
  {
    name: "mail-share",
    run: async (app) => {
      await conversation(app, /Token audit/)
      await press(app, button(app.page, "Share with teammates"))
    },
  },
  {
    name: "mail-reply",
    run: async (app) => {
      await conversation(app, /Token audit/)
      await press(app, button(app.page, "Reply"))
    },
  },
  {
    name: "mail-compose",
    run: async (app) => {
      const dialog = await compose(app)
      await dialog.getByRole("combobox", { name: "To" }).pressSequentially("Marcus")
      await press(app, app.page.getByRole("option", { name: /Marcus Lee/ }))
      await dialog.getByRole("textbox", { name: "Subject" }).fill("Saturday ferry")
      await dialog.getByRole("textbox", { name: "Message" }).click()
      await app.page.keyboard.type("The 08:15 crossing is booked. Shall we meet at the pier at 7:45?")
    },
  },
  {
    name: "mail-send-later",
    run: async (app) => {
      const dialog = await compose(app)
      await press(app, dialog.getByRole("button", { name: "Send later" }))
    },
  },
  {
    name: "mail-send-later-time",
    run: async (app) => {
      const dialog = await compose(app)
      await press(app, dialog.getByRole("button", { name: "Send later" }))
      await press(app, app.page.getByRole("menuitem", { name: "Pick a time…" }))
      await app.page.mouse.move(0, 0)
    },
  },
  {
    // "Discard changes?" (ADR-0087; brief X6): a message asks whenever it holds a recipient, a subject,
    // text or a file, one reopened by Undo send too. KEEP EDITING is the no and takes focus.
    name: "discard-question",
    sean: { kind: "undrawn", area: "shell", screen: "discard-question" },
    run: async (app) => {
      const { page } = app
      const question = discardQuestion(page)
      const message = page.getByRole("dialog", { name: "New message" })
      const discard = question.getByRole("button", { name: "Discard", exact: true })
      const keep = question.getByRole("button", { name: "Keep editing", exact: true })
      const esc = async () => {
        await page.keyboard.press("Escape")
        await app.settle()
      }
      // Empty, it closes at once: the signature alone is not writing.
      await compose(app)
      await esc()
      ensure(!(await question.count()), "an empty message asked before closing")
      ensure(!(await message.count()), "Esc did not close an empty message")
      // With text, Esc asks. Focus starts on KEEP EDITING, so Enter never discards by accident.
      await compose(app)
      await message.getByRole("textbox", { name: "Message" }).click()
      await page.keyboard.type("The 08:15 crossing is booked.")
      await esc()
      ensure(await question.isVisible(), "a message with text closed without asking")
      ensure(await keep.evaluate((el) => el === document.activeElement), "focus is not on Keep editing")
      const box = await question.boundingBox()
      if (app.phone) ensure(Math.round(box.width) === app.viewport.width && Math.round(box.y + box.height) === app.viewport.height, "on a phone the question is not a sheet at the foot")
      else ensure(Math.round(box.width) === 480, `the question is ${Math.round(box.width)} wide, not 480`)
      // Esc in the question keeps editing: it answers the question and leaves the message alone.
      await esc()
      ensure(!(await question.count()) && (await message.isVisible()), "Esc in the question did not keep the message")
      // The close button asks too (Cancel on a desktop does the same).
      await press(app, message.getByRole("button", { name: app.phone ? "Close" : "Cancel", exact: true }))
      ensure(await question.isVisible(), "closing a message with text by its button did not ask")
      // DISCARD closes it.
      await press(app, discard)
      ensure(!(await message.count()) && !(await question.count()), "Discard did not close the message")
      // A message reopened by Undo send holds its recipient and subject, so it asks as well.
      await send(app, "Saturday ferry")
      await page.evaluate(() => document.activeElement?.blur())
      await page.keyboard.press("Control+KeyZ")
      await app.settle()
      const subject = message.getByRole("textbox", { name: "Subject" })
      ensure((await subject.inputValue()) === "Saturday ferry", "Undo did not reopen the message")
      await subject.focus()
      await esc()
      ensure(await question.isVisible(), "a message reopened by Undo closed without asking")
      // KEEP EDITING keeps it, as it was.
      await press(app, keep)
      ensure((await message.isVisible()) && (await subject.inputValue()) === "Saturday ferry", "Keep editing did not keep the message")
      await message.getByRole("textbox", { name: "Message" }).click()
      await page.keyboard.type("The 08:15 crossing is booked. Shall we meet at the pier at 7:45?")
      // The picture: the question over the message.
      await esc()
      ensure(await keep.evaluate((el) => el === document.activeElement), "focus is not on Keep editing the second time")
    },
  },
  {
    // The recipient field (ADR-0089; briefs M6 and 1.4): people as chips in the Text Field box, with up to
    // six suggestions under it. Enter and a comma take the highlighted person; a pasted list splits;
    // Backspace takes the last chip off; text that is not an address is a critical chip and Send says why.
    name: "mail-recipients",
    sean: { kind: "undrawn", area: "mail", screen: "recipients" },
    run: async (app) => {
      const { page } = app
      const form = await compose(app)
      const field = form.locator('[data-slot="recipient-field"]').first()
      const to = form.getByRole("combobox", { name: "To" })
      const list = page.getByRole("listbox", { name: "Suggestions" })
      const chips = async () => (await field.locator('[data-slot="chip"]').allInnerTexts()).map((t) => t.replace(/\s+/g, " ").replace(/ ,/g, ",").trim())
      const expectChips = async (want, when) => {
        await app.settle()
        const have = await chips()
        ensure(JSON.stringify(have) === JSON.stringify(want), `${when}: the field holds ${JSON.stringify(have)}, not ${JSON.stringify(want)}`)
      }
      const send = form.getByRole("button", { name: "Send", exact: true })
      const reason = form.getByText("Fix or remove the address in red.")

      // Typing lists people under the field: six at most, each a tile, a name and an address.
      await to.pressSequentially("mar")
      await list.waitFor()
      await app.settle()
      ensure((await to.getAttribute("aria-expanded")) === "true" && (await to.getAttribute("aria-controls")) === (await list.getAttribute("id")), "the field does not say its list is open")
      const options = list.getByRole("option")
      ensure((await options.count()) >= 1 && (await options.count()) <= 6, `the list shows ${await options.count()} people, not one to six`)
      ensure((await to.getAttribute("aria-activedescendant")) === (await options.first().getAttribute("id")), "the first person is not the highlighted one")
      ensure(await options.first().locator('[data-slot="initial-tile"]').count(), "a suggestion has no initial tile")
      ensure(/Marcus Lee\s*marcus@example\.com/.test(await options.first().innerText()), "a suggestion is not a name and an address")
      const box = await field.locator('[data-slot="chip-field-box"]').boundingBox()
      const under = await list.boundingBox()
      ensure(under.y >= box.y + box.height - 1 && Math.abs(under.x - box.x) < 24, "the list does not hang under the field's box")
      // Esc closes the list, not the message.
      await page.keyboard.press("Escape")
      await app.settle()
      ensure(!(await list.count()), "Esc did not close the list")
      ensure(await form.isVisible(), "Esc in the list closed the message")
      // Typing on opens it again. Enter takes the highlighted person: a chip with the name; the address is said after it.
      await to.pressSequentially("c")
      await list.waitFor()
      await page.keyboard.press("Enter")
      await expectChips(["Marcus Lee, marcus@example.com"], "after Enter")
      ensure((await to.inputValue()) === "", "the typed text stayed after Enter")
      ensure(!(await list.count()), "the list stayed open after a pick")
      ensure(await field.getByRole("button", { name: "Remove Marcus Lee", exact: true }).count(), "the chip has no remove button named for the person")
      // A comma takes the highlighted person too.
      await to.pressSequentially("ana")
      await list.waitFor()
      ensure(!(await list.getByRole("option", { name: /marcus@example\.com/ }).count()), "the list offers someone already in the field")
      await page.keyboard.press(",")
      await expectChips(["Marcus Lee, marcus@example.com", "Ana Duarte, ana@example.com"], "after a comma")
      // An address typed out in full is kept as typed.
      await to.pressSequentially("kit@example.org,")
      await expectChips(["Marcus Lee, marcus@example.com", "Ana Duarte, ana@example.com", "kit@example.org"], "after an address and a comma")
      // A pasted list splits on commas and semicolons.
      await to.evaluate((el) => {
        const data = new DataTransfer()
        data.setData("text/plain", "lena@example.org; omar@example.org")
        el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }))
      })
      await expectChips(["Marcus Lee, marcus@example.com", "Ana Duarte, ana@example.com", "kit@example.org", "lena@example.org", "omar@example.org"], "after pasting two")
      // Backspace in the empty input takes the last chip off; each chip's own button takes that chip off.
      await to.press("Backspace")
      await expectChips(["Marcus Lee, marcus@example.com", "Ana Duarte, ana@example.com", "kit@example.org", "lena@example.org"], "after Backspace")
      await press(app, field.getByRole("button", { name: "Remove kit@example.org", exact: true }))
      await expectChips(["Marcus Lee, marcus@example.com", "Ana Duarte, ana@example.com", "lena@example.org"], "after a chip's remove button")
      ensure(!(await reason.count()) && !(await send.isDisabled()), "Send is off although every chip is an address")
      // Text that is not an address: a critical chip, said in words too, and Send gives the reason.
      await to.pressSequentially("the ferry people")
      await to.press("Enter")
      await expectChips(["Marcus Lee, marcus@example.com", "Ana Duarte, ana@example.com", "lena@example.org", "the ferry people, not an address"], "after text that is not an address")
      ensure((await field.locator('[data-slot="chip"][data-tone="critical"]').count()) === 1, "the wrong chip is not the one critical chip")
      ensure(await send.isDisabled(), "Send is on with a wrong address in the field")
      ensure(await reason.isVisible(), "Send does not say why it is off")
      if (!app.phone) ensure((await send.getAttribute("aria-describedby")) === (await reason.getAttribute("id")), "the reason is not tied to Send")
      // Ctrl+Enter does not send it either.
      await page.keyboard.press("Control+Enter")
      await app.settle()
      ensure(await form.isVisible(), "Ctrl+Enter sent a message with a wrong address")
      // Backspace removes the wrong one, and Send works again.
      await to.press("Backspace")
      await app.settle()
      ensure(!(await reason.count()) && !(await send.isDisabled()), "Send stayed off after the wrong address was removed")
      // The picture: the wrong chip, its reason, and the list open on what is being typed.
      await to.pressSequentially("the ferry people")
      await to.press("Enter")
      await to.pressSequentially("pr")
      await list.waitFor()
      // No tooltip from the pointer's last press in the picture.
      await page.mouse.move(0, 0)
      await app.settle()
    },
  },
  {
    // The format bar in the message field (ADR-0089; briefs M6 and 1.4): unicron's Toolbar of toggles on the
    // box's bottom edge. One Tab stop; Bold toggles; Link opens its address in a popover (a sheet on a phone).
    name: "mail-format-bar",
    run: async (app) => {
      const { page } = app
      const form = await compose(app)
      // By its class, not its role: a phone's link sheet hides the message from roles while it is open.
      const text = form.locator(".ProseMirror")
      ensure((await text.getAttribute("aria-label")) === "Message", "the message field is not named Message")
      await text.click()
      await page.keyboard.type("The 08:15 crossing is booked.")
      const bar = await formatBar(app, form, ["Bold", "Italic", "Link", "Bulleted list", "Numbered list", "Quote", "Code"])
      ensure((await form.locator('[data-slot="format-bar"]').getAttribute("data-mode")) === "field", "the message's format bar is not on its field")
      // Link: its address in a layer of its own; a scheme that is not the web or mail is refused in words.
      await text.selectText()
      // The editor hears of a new selection a moment after the browser makes it.
      await app.settle()
      ensure(await text.evaluate((el) => String(window.getSelection()).trim() === el.textContent.trim()), "the message's words are not selected")
      await press(app, bar.getByRole("button", { name: "Link", exact: true }))
      const link = page.getByRole("dialog", { name: "Link" })
      const address = link.getByRole("textbox", { name: "Link address" })
      ensure(await address.isVisible(), "Link did not open the link's address")
      ensure(await link.getByRole("button", { name: "Remove", exact: true }).isDisabled(), "Remove is on although the words have no link")
      await address.fill("ftp://example.org")
      await press(app, link.getByRole("button", { name: "Apply", exact: true }))
      ensure(await link.getByText("Only web and email links.").isVisible(), "a refused link does not say why")
      await address.fill("example.org/ferry")
      await address.press("Enter")
      await link.waitFor({ state: "detached" })
      await app.settle()
      ensure((await text.locator('a[href="https://example.org/ferry"]').count()) && (await text.locator('a[href="https://example.org/ferry"]').innerText()).trim() === "The 08:15 crossing is booked.", "Apply did not link the selected words")
      ensure(await form.isVisible(), "applying a link closed the message")
      ensure(await text.evaluate((el) => el === document.activeElement), "focus did not return to the message after Apply")
      // On a link, the toggle is on, the layer opens on its address, and Remove takes it off.
      ensure((await bar.getByRole("button", { name: "Link", exact: true }).getAttribute("aria-pressed")) === "true", "Link is not on while the cursor is in a link")
      await press(app, bar.getByRole("button", { name: "Link", exact: true }))
      ensure((await address.inputValue()) === "https://example.org/ferry", "the layer did not open on the link's address")
      await press(app, link.getByRole("button", { name: "Remove", exact: true }))
      await link.waitFor({ state: "detached" })
      ensure(!(await text.locator("a").count()), "Remove did not take the link off")
      // Focus is back in the message before the layer opens again.
      await page.waitForFunction(() => document.activeElement?.classList.contains("ProseMirror"))
      await app.settle()
      // The picture: the layer open on an address.
      await press(app, bar.getByRole("button", { name: "Link", exact: true }))
      await address.fill("example.org/ferry")
      await app.settle()
      ensure((await page.locator(".composer-body").first().evaluate((el) => el.textContent)).trim() === "The 08:15 crossing is booked.", "typing a link's address changed the message")
    },
  },
  {
    // The form layer at its compose size (ADR-0087; brief 3.2): a dialog of 720 with the subject as its
    // title; the whole screen on a phone, with Send as the top row's float button.
    name: "form-layer-compose",
    sizes: ["desktop", "phone", "medium"],
    sean: { kind: "undrawn", area: "shell", screen: "form-layer-compose" },
    run: async (app) => {
      const { page } = app
      const message = page.getByRole("dialog", { name: "New message" })
      const write = async (form) => {
        await form.getByRole("combobox", { name: "To" }).pressSequentially("Marcus")
        await press(app, page.getByRole("option", { name: /Marcus Lee/ }))
        await form.getByRole("textbox", { name: "Subject" }).fill("Saturday ferry")
        await form.getByRole("textbox", { name: "Message" }).click()
        await page.keyboard.type("The 08:15 crossing is booked. Shall we meet at the pier at 7:45?")
      }
      // Ctrl+Enter from the message's own text sends it.
      await formLayer(app, { open: compose, write, primary: "Send", width: 720 })
      // Sent: take it back, so the picture is the form as it was written.
      await page.evaluate(() => document.activeElement?.blur())
      await page.keyboard.press("Control+KeyZ")
      await app.settle()
      ensure((await message.getByRole("textbox", { name: "Subject" }).inputValue()) === "Saturday ferry", "Ctrl+Enter did not send the message, or Undo did not bring it back")
      if (!app.phone) ensure(/Saturday ferry/.test(await message.locator('[data-slot="dialog-title"]').innerText()), "the header does not show the subject as typed")
      // Send later is still there: beside Send on a desktop, in the tools on a phone.
      ensure(await message.getByRole("button", { name: "Send later", exact: true }).isVisible(), "Send later is not reachable from the form")
    },
  },
  {
    // A split in the form layer; editing one adds DELETE at the start of the footer.
    name: "form-layer-split",
    sizes: ["desktop", "phone", "medium"],
    run: async (app) => {
      const { page } = app
      const open = async () => {
        await press(app, newSplit(page))
        return page.getByRole("dialog", { name: "New split" })
      }
      const write = async (form) => {
        await form.getByRole("textbox", { name: "Name" }).fill("Bills")
        await form.getByRole("textbox", { name: "Subject has" }).fill("invoice")
      }
      await formLayer(app, { open, write, primary: "Create split" })
      await toastGone(app)
      ensure(await chip(page, "Bills").isVisible(), "Ctrl+Enter did not add the split")
      ensure(await chip(page, "Bills").isChecked(), "the new split is not the chosen chip")
      await press(app, button(page, "Edit split"))
      ensure(await page.getByRole("dialog", { name: "Edit split" }).getByRole("button", { name: "Delete", exact: true }).isVisible(), "an edited split has no Delete")
    },
  },
  {
    // The Inbox's filters (ADR-0091; brief M2): one row of single-choice chips under the page head, All, People,
    // Updates, Newsletters and a chip per split with its unread count, then New split. Above the first conversation
    // the Screener's pointer (where the sidebar can't show its count) and the newsletter bundle. A split's chip filters.
    name: "mail-chips",
    sean: { kind: "undrawn", area: "mail", screen: "inbox-filters" },
    path: "/?newsletters&screener",
    scenario: ["splits", "screener-waiting"],
    run: async (app) => {
      const { page } = app
      const names = (await chips(page).getByRole("radio").allInnerTexts()).map((t) => t.trim().split(/\s+/)[0])
      ensure(JSON.stringify(names) === JSON.stringify(["ALL", "PEOPLE", "UPDATES", "NEWSLETTERS", "STUDIO", "TRAVEL"]), `the chips read ${JSON.stringify(names)}`)
      ensure(await chip(page, "All").isChecked(), "All is not the chosen chip")
      ensure(!(await button(page, "Edit split").count()), "Edit split shows with no split chosen")
      ensure(/\b01\b|\b02\b/.test(await chip(page, "Studio").innerText()), "the Studio chip has no unread count")
      ensure(await bundle(page).isVisible(), "the newsletter bundle is not above the conversations")
      const pointer = screenerPointer(page)
      if (app.size === "desktop") {
        ensure(!(await pointer.count()), "the desktop shows the Screener's pointer row besides the sidebar's count")
        ensure(await page.getByRole("navigation", { name: "Vale" }).getByRole("button", { name: /^Screener, 3 new senders waiting/ }).count(), "the sidebar's Screener item does not carry the count")
      } else ensure(await pointer.isVisible(), "no Screener pointer row on the Inbox")
      // Studio's chip filters the Inbox: only the studio's mail, no bundle, and Edit split appears.
      await press(app, chip(page, "Studio"))
      const list = page.getByRole("list", { name: "Inbox", exact: true })
      await list.getByRole("button", { name: /Token audit/ }).first().waitFor()
      ensure(!(await list.getByRole("button", { name: /Your booking is confirmed/ }).count()), "the Studio chip still lists the ferry's mail")
      ensure(!(await bundle(page).count()), "the bundle shows inside a split")
      ensure(await button(page, "Edit split").isVisible(), "a chosen split has no Edit split")
      // Back to All for the picture.
      await press(app, chip(page, "All"))
      await page.mouse.move(0, 0)
      await app.settle()
    },
  },
  {
    // The bundle row's tap chooses NEWSLETTERS (brief M2).
    name: "mail-newsletters",
    path: "/?newsletters",
    run: async (app) => {
      const { page } = app
      await press(app, bundle(page).locator('[data-slot="list-row-main"]'))
      ensure(await chip(page, "Newsletters").isChecked(), "a tap on the bundle did not choose Newsletters")
      await page.getByRole("list", { name: "Inbox", exact: true }).getByRole("button", { name: /October at the studio/ }).first().waitFor()
      await page.mouse.move(0, 0)
      await app.settle()
    },
  },
  {
    // The bundle's two actions from its overflow button (brief M2; decisions §10): on a phone it always shows. MARK
    // READ takes the unread square away; ARCHIVE ALL empties it with a toast whose Undo brings it back. On a phone a
    // left swipe shows the same two tiles. The picture: the menu open.
    name: "mail-bundle-menu",
    sean: { kind: "undrawn", area: "mail", screen: "bundle" },
    path: "/?newsletters",
    run: async (app) => {
      const { page } = app
      const row = bundle(page)
      const open = async () => {
        if (!app.phone) await row.hover()
        const more = moreOf(row)
        ensure(await more.isVisible(), "the bundle has no overflow button")
        await press(app, more)
        await menu(page).waitFor()
        return menu(page)
      }
      if (app.phone) {
        await drag(app, row, -120)
        ensure(JSON.stringify(await tiles(row)) === JSON.stringify(["MARK READ", "ARCHIVE ALL"]), `the bundle's tiles read ${JSON.stringify(await tiles(row))}`)
        await pressOutside(app)
      }
      let m = await open()
      const items = (await m.getByRole("menuitem").allInnerTexts()).map((t) => t.trim())
      ensure(JSON.stringify(items) === JSON.stringify(["Mark read", "Archive all"]), `the bundle's menu reads ${JSON.stringify(items)}`)
      await press(app, m.getByRole("menuitem", { name: "Mark read", exact: true }))
      await page.waitForTimeout(300)
      ensure(!(await row.locator('[data-slot="list-row-unread"]').count()), "Mark read left the unread square")
      m = await open()
      ensure(!(await m.getByRole("menuitem", { name: "Mark read", exact: true }).count()), "Mark read is offered with nothing unread")
      await press(app, m.getByRole("menuitem", { name: "Archive all", exact: true }))
      const toast = page.locator("[data-sonner-toast]").filter({ hasText: "Archived 2 newsletters" })
      await toast.waitFor()
      ensure(!(await row.count()), "Archive all left the bundle")
      await press(app, toast.getByRole("button", { name: "Undo", exact: true }))
      await row.waitFor()
      for (const t of await page.locator("[data-sonner-toast]").all()) await t.waitFor({ state: "detached", timeout: 15_000 }).catch(() => {})
      // The picture: the Inbox as it starts, with the bundle's menu open.
      await page.reload()
      await app.settle()
      await open()
    },
  },
  {
    // The split form (brief M2), new and empty: the line, NAME, FROM with its helper, SUBJECT HAS, the two toggles.
    name: "mail-split-new",
    sean: { kind: "undrawn", area: "mail", screen: "split-form" },
    run: async (app) => {
      const { page } = app
      await press(app, newSplit(page))
      const form = page.getByRole("dialog", { name: "New split" })
      ensure(await form.getByText("Mail must match everything you fill in.").isVisible(), "the form has no line saying how it matches")
      ensure(await form.getByText("An address, or a domain with @ in front.").isVisible(), "From has no helper")
      for (const t of ["Only with attachments", "Keep out of All"]) ensure(await form.getByRole("switch", { name: t }).count(), `the form has no ${t}`)
      ensure(await form.getByRole("button", { name: "Change", exact: false }).count(), "the form has no Account row with Change")
      ensure(!(await form.getByRole("button", { name: "Delete", exact: true }).count()), "a new split offers Delete")
    },
  },
  {
    // A split edited (brief M2; X6): it saves under a new name, and its DELETE has an Undo that makes it again from
    // what was saved. A wrong address is a red chip and stops the save. The picture: the form for an existing split.
    name: "mail-split-edit",
    scenario: "splits",
    run: async (app) => {
      const { page } = app
      const form = page.getByRole("dialog", { name: "Edit split" })
      const edit = async (name) => {
        await press(app, chip(page, name))
        await press(app, button(page, "Edit split"))
        await form.waitFor()
      }
      await edit("Studio")
      ensure((await form.getByRole("textbox", { name: "Name" }).inputValue()) === "Studio", "the form did not open with the split's name")
      ensure(await form.getByRole("button", { name: "Remove @studio.example", exact: true }).count(), "From does not hold the split's domain as a chip")
      // A wrong address is a red chip, and the save stops.
      const from = form.getByRole("combobox", { name: "From" }).or(form.getByRole("textbox", { name: "From" })).first()
      await from.fill("ferry")
      await from.press("Enter")
      ensure(await form.getByText("Fix or remove the address in red.").isVisible(), "a wrong address does not say what to fix")
      await press(app, form.getByRole("button", { name: "Remove ferry", exact: true }))
      await form.getByRole("textbox", { name: "Name" }).fill("Studio crew")
      await press(app, form.getByRole("button", { name: "Save", exact: true }))
      await form.waitFor({ state: "detached" })
      await toastGone(app)
      ensure(await chip(page, "Studio crew").isChecked(), "the saved split is not the chosen chip under its new name")
      // DELETE, then UNDO: the split comes back, chosen.
      await press(app, button(page, "Edit split"))
      await press(app, form.getByRole("button", { name: "Delete", exact: true }))
      await form.waitFor({ state: "detached" })
      const toast = page.locator("[data-sonner-toast]").filter({ hasText: "Deleted Studio crew" })
      await toast.waitFor()
      ensure(!(await chip(page, "Studio crew").count()), "Delete left the chip")
      ensure(await chip(page, "All").isChecked(), "after Delete the Inbox is not on All")
      await press(app, toast.getByRole("button", { name: "Undo", exact: true }))
      await chip(page, "Studio crew").waitFor()
      ensure(await chip(page, "Studio crew").isChecked(), "Undo did not bring the split back as the chosen chip")
      for (const t of await page.locator("[data-sonner-toast]").all()) await t.waitFor({ state: "detached", timeout: 15_000 }).catch(() => {})
      // The picture: Travel's form.
      await edit("Travel")
      await page.mouse.move(0, 0)
      await app.settle()
    },
  },
  {
    // The Screener lane (brief M3): `SCREENER // 03 WAITING`, the rows as every lane. LET IN runs on a full swipe on a
    // phone (from the row's menu on a desktop) and its toast's UNDO puts the sender back; SCREEN OUT opens and stops,
    // its tile runs it, and its toast says what stays archived, with an UNDO that puts the sender back too.
    name: "mail-screener",
    sean: { kind: "undrawn", area: "mail", screen: "screener" },
    path: "/?screener",
    scenario: "screener-waiting",
    run: async (app) => {
      const { page } = app
      await lane(app, "Screener")
      const head = (await page.locator('[data-slot="page-head-overline"]:visible').first().innerText()).trim()
      ensure(/^SCREENER\s*\/\/\s*03 WAITING/.test(head), `the Screener's overline reads ${head}`)
      const list = page.getByRole("list", { name: "Screener", exact: true })
      const toast = (text) => page.locator("[data-sonner-toast]").filter({ hasText: text })
      const row = rowOf(page, /Wholesale order for spring/, "Screener")
      if (app.phone) await drag(app, row, 330)
      else {
        await row.hover()
        await press(app, moreOf(row))
        await press(app, menu(page).getByRole("menuitem", { name: "Let in", exact: true }))
      }
      await toast("Jonas Weber can reach your inbox").waitFor()
      ensure(!(await list.getByRole("button", { name: /Wholesale order/ }).count()), "Let in left the sender in the Screener")
      await press(app, toast("Jonas Weber can reach your inbox").getByRole("button", { name: "Undo", exact: true }))
      await list.getByRole("button", { name: /Wholesale order/ }).first().waitFor()
      // SCREEN OUT: on a phone its tile, once the swipe has opened the row; the row's menu on a desktop.
      const out = rowOf(page, /Risograph proofs/, "Screener")
      if (app.phone) {
        await drag(app, out, -330)
        await press(app, out.locator('[data-slot="swipe-action"]').filter({ hasText: /screen out/i }))
      } else {
        await out.hover()
        await press(app, moreOf(out))
        await press(app, menu(page).getByRole("menuitem", { name: "Screen out", exact: true }))
      }
      await toast("Screened out Lena Ortiz").waitFor()
      ensure(await toast("Screened out Lena Ortiz").getByText("Mail already archived stays in Archive").isVisible(), "the Screen out toast does not say what stays archived")
      ensure(!(await list.getByRole("button", { name: /Risograph proofs/ }).count()), "Screen out left the sender in the Screener")
      await press(app, toast("Screened out Lena Ortiz").getByRole("button", { name: "Undo", exact: true }))
      for (const t of await page.locator("[data-sonner-toast]").all()) await t.waitFor({ state: "detached", timeout: 15_000 }).catch(() => {})
      // Undo forgets the decision; her mail, archived by screening out, stays in Archive as the toast said.
      await settings(app, "Mail")
      ensure(!(await page.getByText(/lena@printhaus\.example|Lena Ortiz/).count()), "Undo did not forget the Screen out decision")
      // The picture: the lane as it starts.
      await page.reload()
      await app.settle()
      await area(app, "Mail")
      await lane(app, "Screener")
    },
  },
  {
    // The phone's pointer to the Screener (brief M3): a compact row at the top of the Inbox; a tap opens the lane.
    name: "mail-screener-pointer",
    sizes: ["phone", "medium"],
    path: "/?screener",
    scenario: "screener-waiting",
    run: async (app) => {
      const { page } = app
      const pointer = screenerPointer(page)
      ensure(await pointer.isVisible(), "no Screener pointer row on the Inbox")
      await press(app, pointer)
      ensure((await headTitle(page)) === "Screener", "the pointer did not open the Screener")
      await page.getByRole("list", { name: "Screener", exact: true }).waitFor()
      // The picture: the Inbox with the pointer.
      await lane(app, "Inbox")
    },
  },
  {
    // The Screener off and empty is not listed; on and empty, brief 5.2's words (ADR-0018 turns it on in Settings).
    name: "mail-screener-empty",
    run: async (app) => {
      const { page } = app
      const folders = await groups(app)
      ensure(!(await folders.locator('[aria-label="Screener"], [aria-label^="Screener, "]').count()), "the Screener is listed while it is off and empty")
      if (await switcherLayer(page).count()) await leaveLayer(app)
      await settings(app, "Mail")
      await page.getByRole("switch", { name: "Screen first-time senders" }).click()
      await toastGone(app)
      await area(app, "Mail")
      await lane(app, "Screener")
      const empty = page.getByRole("region", { name: "Mail", exact: true }).locator('[data-slot="empty"]')
      ensure(/SCREENER\s*\/\/\s*00/.test(await empty.innerText()) && /No new senders\./.test(await empty.innerText()), "the empty Screener does not use brief 5.2's words")
    },
  },
  { name: "mail-unread", sean: { kind: "undrawn", area: "mail", screen: "lane-unread" }, run: (app) => lane(app, "Unread") },
  { name: "mail-starred", sean: { kind: "undrawn", area: "mail", screen: "lane-starred" }, run: (app) => lane(app, "Starred") },
  {
    name: "mail-snoozed", // nothing is snoozed in the sample data, so the scene snoozes one conversation
    sean: { kind: "undrawn", area: "mail", screen: "lane-snoozed" },
    run: async (app) => {
      await conversation(app, /Cabin weekend/)
      await press(app, button(app.page, "Snooze"))
      await app.page.getByRole("menuitem", { name: /^Tomorrow/ }).click()
      await toastGone(app)
      await lane(app, "Snoozed")
    },
    // The lane says when each row comes back, after the glyph that says why.
    assert: async ({ page }) => ensure(/^PERSONAL\s*\/\/\s*FRI 08:00$/.test((await page.getByRole("list", { name: "Snoozed" }).locator('[data-slot="list-row-time"]').first().innerText()).trim()), "a snoozed row does not say when it comes back"),
  },
  { name: "mail-waiting", sean: { kind: "undrawn", area: "mail", screen: "lane-waiting" }, run: (app) => lane(app, "Waiting") },
  { name: "mail-scheduled", run: (app) => lane(app, "Scheduled") }, // empty in the sample data: a lane's empty state
  { name: "mail-team", run: (app) => lane(app, "Team") },
  {
    name: "mail-team-open-link",
    run: async (app) => {
      await lane(app, "Team")
      await press(app, app.page.getByRole("button", { name: "Open a link…" }).first())
    },
  },
  { name: "mail-archive", sean: { kind: "undrawn", area: "mail", screen: "lane-archive" }, run: (app) => lane(app, "Archive") },
  {
    // Mobile / 07 and Desktop / 05 (ADR-0090): the account that stopped syncing, in the server's words and with when its
    // mail stops; OPEN ACCOUNTS for an account with a password. On a desktop its sidebar row is critical and the detail
    // column's nothing-open line names it.
    name: "mail-sync-error",
    scenario: "sync-error",
    sean: { kind: "drawn", area: "mail", screen: "sync-error" },
    assert: async (app) => {
      const { page } = app
      const banner = page.locator('[data-slot="banner"]:visible').first()
      ensure(/Work account stopped syncing/.test(await banner.innerText()), "the banner does not name the account")
      ensure(/refused the sign-in.*Work mail stops at 08:36\./s.test(await banner.innerText()), "the banner does not give the server's words and when Work's mail stops")
      ensure(await banner.getByRole("button", { name: "Open accounts", exact: true }).isVisible(), "the banner has no Open accounts")
      ensure(!(await banner.getByRole("button", { name: "Sign in", exact: true }).count()), "a password account offers Sign in")
      ensure(await page.getByRole("list", { name: "Inbox", exact: true }).getByRole("listitem").first().isVisible(), "the list did not carry on under the banner")
      // The detail column stands beside the list only at the full width.
      if (app.size === "desktop") ensure(await page.getByRole("region", { name: "Mail: nothing open" }).getByText("Work mail stops at 08:36.").isVisible(), "the detail column does not name the stopped account")
    },
  },
  {
    // An account signed in with its provider: SIGN IN, through the core's reauth. The demo cannot sign in, so its
    // refusal shows in the banner, beside the button (cross-app decisions §9).
    name: "mail-sync-error-sign-in",
    sizes: ["desktop", "phone"],
    scenario: "sync-error-sign-in",
    run: async (app) => {
      const banner = app.page.locator('[data-slot="banner"]:visible').first()
      ensure(!(await banner.getByRole("button", { name: "Open accounts", exact: true }).count()), "an account signed in with its provider offers Open accounts")
      await press(app, banner.getByRole("button", { name: "Sign in", exact: true }))
      ensure(/Signing in again needs the desktop app\./.test(await banner.innerText()), "a failed sign-in does not say why beside the button")
    },
  },
  {
    // Mobile / 06 and Desktop / 04: INBOX ZERO with the time, the snoozed sentence (the handled count is not
    // there: W1), OPEN ARCHIVE; on a desktop the snoozed mail beside, in the order it comes back.
    name: "mail-inbox-zero",
    scenario: "inbox-zero",
    sean: { kind: "drawn", area: "mail", screen: "inbox-zero" },
    assert: async (app) => {
      const { page } = app
      const empty = page.getByRole("region", { name: "Mail", exact: true }).locator('[data-slot="empty"]')
      const words = await empty.innerText()
      ensure(/INBOX ZERO \/\/ 09:16/.test(words) && /Nothing left today\./.test(words), "the empty Inbox is not INBOX ZERO // 09:16, Nothing left today.")
      ensure(/Snoozed mail comes back at 8:00\sAM tomorrow\./.test(words), "the empty Inbox does not say when snoozed mail comes back")
      ensure(!/handled/.test(words), "the empty Inbox counts handled mail, which the core does not know (W1)")
      ensure(await empty.getByRole("button", { name: "Open archive", exact: true }).isVisible(), "the empty Inbox has no Open archive")
      if (app.size === "desktop") {
        const beside = page.getByRole("region", { name: "Mail: nothing open" })
        ensure(/SNOOZED \/\/ BACK AT FRI 08:00\s*02/.test(await beside.innerText()), "the detail column does not list the snoozed mail")
        ensure((await beside.getByRole("listitem").count()) === 2, "the detail column does not list both snoozed conversations")
      }
    },
  },
  {
    // States / 04: five skeleton rows, two bars 20 apart, while the lane's first read is out, and the check for new
    // mail the person asked for as live status (the phone's strip, the desktop's status line).
    name: "mail-loading",
    scenario: ["slow", "syncing"],
    loading: true,
    sean: { kind: "drawn", area: "mail", screen: "loading" },
    run: async (app) => {
      const { page } = app
      if (app.phone) await press(app, tabBar(page).getByRole("tab", { name: "Mail", exact: true }))
      else await press(app, page.locator('[data-slot="app-frame-status-line"]').getByRole("button", { name: "Check again", exact: true }))
      await page.mouse.move(0, 0)
      await app.settle()
    },
    assert: async ({ page, phone }) => {
      const live = phone ? page.locator('[data-slot="accessory"]:visible').first() : page.locator('[data-slot="app-frame-status-line"]')
      ensure(/syncing|checking/i.test(await live.innerText()), "the check the person asked for does not show as live status")
      const rows = page.getByRole("region", { name: "Mail", exact: true }).locator('[data-slot="skeleton"][data-variant="row"]')
      ensure((await rows.count()) === 5, `the list shows ${await rows.count()} skeleton rows, not five`)
      const bars = await rows.first().locator('[data-slot="skeleton-bar"]').evaluateAll((els) => els.map((el) => el.getBoundingClientRect()))
      ensure(bars.length === 2 && Math.round(bars[1].top - bars[0].bottom) === 20, "a skeleton row is not two bars 20 apart")
    },
  },
  {
    // No account yet: one way on, to the first run.
    name: "mail-no-account",
    scenario: "no-account",
    sean: { kind: "undrawn", area: "mail", screen: "no-account" },
    assert: async ({ page }) => {
      const empty = page.getByRole("region", { name: "Mail", exact: true }).locator('[data-slot="empty"]')
      ensure(/Add your first account\./.test(await empty.innerText()), "Mail with no account does not ask for one")
      ensure(await empty.getByRole("button", { name: "Add account", exact: true }).isVisible(), "Mail with no account has no Add account")
    },
  },
  {
    // States / 01, trailing: the person's slots as the drawn tiles, STAR, SNOOZE and ARCHIVE (the full swipe's, in
    // the identity fill). The swipes-drawn scenario sets the two slots the core leaves at Nothing (Q4).
    name: "mail-swipe-left",
    scenario: "swipes-drawn",
    sean: { kind: "drawn", area: "mail", screen: "swipe-actions" },
    run: async (app) => {
      const row = rowOf(app.page, /Design crit/)
      await drag(app, row, -200)
      await app.page.mouse.move(0, 0)
    },
    assert: async ({ page }) => {
      const row = rowOf(page, /Design crit/)
      ensure((await row.getAttribute("data-open")) === "trailing", "the row did not stay open on its trailing tiles")
      const words = await tiles(row)
      ensure(JSON.stringify(words) === JSON.stringify(["STAR", "SNOOZE", "ARCHIVE"]), `the tiles read ${JSON.stringify(words)}, not STAR, SNOOZE, ARCHIVE`)
      ensure((await row.locator('[data-slot="swipe-action"]').last().getAttribute("data-tone")) === "primary", "ARCHIVE, the full swipe's tile, is not the primary one")
    },
  },
  {
    // States / 01, leading: READ, started clear of the screen's back edge.
    name: "mail-swipe-right",
    scenario: "swipes-drawn",
    sean: { kind: "drawn", area: "mail", screen: "swipe-actions-leading" },
    run: async (app) => {
      await drag(app, rowOf(app.page, /Your booking is confirmed/), 100)
      await app.page.mouse.move(0, 0)
    },
    assert: async ({ page }) => {
      const row = rowOf(page, /Your booking is confirmed/)
      ensure((await row.getAttribute("data-open")) === "leading", "the row did not stay open on its leading tile")
      ensure(JSON.stringify(await tiles(row)) === JSON.stringify(["READ"]), "the leading tile is not READ")
    },
  },
  {
    // The swipe's rules, with a finger (ADR-0090; contract 6.4): the default slots show ARCHIVE alone; a vertical drag
    // scrolls and opens nothing; a full swipe archives, and UNDO brings the conversation back.
    name: "mail-swipe-checks",
    sizes: ["phone"],
    run: async (app) => {
      const { page } = app
      const list = page.getByRole("list", { name: "Inbox", exact: true })
      const scroller = page.getByRole("region", { name: "Mail", exact: true })
      // The core's own defaults: READ leading, ARCHIVE trailing, the other two slots Nothing, so no tile for them.
      let row = rowOf(page, /Token audit/)
      await drag(app, row, -200)
      ensure(JSON.stringify(await tiles(row)) === JSON.stringify(["ARCHIVE"]), `the default trailing tiles read ${JSON.stringify(await tiles(row))}, not ARCHIVE alone`)
      await pressOutside(app)
      await drag(app, row, 100)
      ensure(JSON.stringify(await tiles(row)) === JSON.stringify(["READ"]), `the leading tile reads ${JSON.stringify(await tiles(row))}, not READ`)
      // A press outside an open row closes it.
      await pressOutside(app)
      ensure(!(await list.locator('[data-slot="swipe-row"][data-open]').count()), "a press outside the open row did not close it")
      // A vertical drag scrolls the list and opens nothing.
      const before = await scroller.evaluate((el) => el.scrollTop)
      await drag(app, rowOf(page, /Cabin weekend/), 0, -260)
      ensure(!(await list.locator('[data-slot="swipe-row"][data-open]').count()), "a vertical drag opened a row")
      ensure(!(await page.getByRole("button", { name: "Back", exact: true }).count()), "a vertical drag opened a conversation")
      ensure((await scroller.evaluate((el) => el.scrollTop)) > before, "a vertical drag did not scroll the list")
      await scroller.evaluate((el) => el.scrollTo(0, 0))
      await app.settle()
      // A full swipe runs ARCHIVE, the outermost tile; the toast names the conversation, and UNDO brings it back.
      row = rowOf(page, /Token audit/)
      await drag(app, row, -320)
      const toast = page.locator("[data-sonner-toast]").filter({ hasText: "Archived Re: Token audit" })
      await toast.waitFor()
      ensure(!(await list.getByRole("button", { name: /Token audit/ }).count()), "a full swipe did not archive the conversation")
      await press(app, toast.getByRole("button", { name: "Undo", exact: true }))
      await list.getByRole("button", { name: /Token audit/ }).first().waitFor()
      await app.settle()
    },
  },
  {
    // The Screener's pair: LET IN leads, SCREEN OUT trails and never runs on a full swipe: the row opens and stops.
    name: "mail-screener-swipe",
    sizes: ["phone"],
    // The demo's first-time sender, waiting in the Screener (it is on).
    path: "/?screener",
    run: async (app) => {
      const { page } = app
      await lane(app, "Screener")
      const first = page.getByRole("list", { name: "Screener", exact: true }).getByRole("listitem").first()
      const subject = (await first.locator('[data-slot="list-row-subject"]').innerText()).trim()
      const row = first.locator('[data-slot="swipe-row"]')
      await drag(app, row, -330)
      ensure((await row.getAttribute("data-open")) === "trailing", "a full swipe on SCREEN OUT did not leave the row open")
      ensure(JSON.stringify(await tiles(row)) === JSON.stringify(["SCREEN OUT"]), `the Screener's trailing tile reads ${JSON.stringify(await tiles(row))}`)
      await page.waitForTimeout(400)
      ensure(!(await page.locator("[data-sonner-toast]").filter({ hasText: /Screened out/ }).count()), "a full swipe screened the sender out")
      ensure(await page.getByRole("list", { name: "Screener", exact: true }).getByText(subject).count(), "the row left the Screener on a full swipe")
      await pressOutside(app)
      await drag(app, row, 100)
      ensure(JSON.stringify(await tiles(row)) === JSON.stringify(["LET IN"]), "the Screener's leading tile is not LET IN")
    },
  },
  {
    // A row's actions without a gesture (cross-app decisions §10; brief M1): the overflow button, and Shift+F10 on the
    // focused row. Each works: Star, Mark read, Snooze, Remind, Always in Newsletters, Archive with its Undo, and the
    // picker for any date and time. The picture: the menu open on a row.
    name: "mail-row-menu",
    sean: { kind: "undrawn", area: "mail", screen: "row-menu" },
    run: async (app) => {
      const { page } = app
      const list = page.getByRole("list", { name: "Inbox", exact: true })
      const toast = (text) => page.locator("[data-sonner-toast]").filter({ hasText: text })
      const openMenu = async (subject, { keys = false } = {}) => {
        const row = rowOf(page, subject)
        if (keys) {
          await row.locator('[data-slot="list-row-main"]').focus()
          await page.keyboard.press("Shift+F10")
        } else await row.hover().then(() => moreOf(row).click())
        await menu(page).waitFor()
        await app.settle()
        return menu(page)
      }
      const item = (m, name) => m.getByRole("menuitem", { name, exact: true })
      // The items: the swipe slots' first (READ or UNREAD, ARCHIVE), then the rest.
      let m = await openMenu(/Token audit/)
      const names = (await m.getByRole("menuitem").allInnerTexts()).map((t) => t.trim())
      for (const want of ["Read", "Archive", "Snooze until", "Remind me in 3 days", "Always in Newsletters"]) ensure(names.includes(want), `the row's menu has no ${want}: ${JSON.stringify(names)}`)
      ensure(names.filter((n) => n === "Star" || n === "Unstar").length === 1, `the row's menu has no single Star or Unstar: ${JSON.stringify(names)}`)
      ensure(names.filter((n) => n === "Archive").length === 1 && !names.includes("Mark read"), "the row's menu lists an action twice")
      // Unstar from the menu (the row is starred), then Star again from the keys.
      await press(app, item(m, "Unstar").or(item(m, "Star")).first())
      const starred = () => rowOf(page, /Token audit/).getByRole("img", { name: "Starred" }).count()
      const was = await starred()
      m = await openMenu(/Token audit/, { keys: true })
      await press(app, item(m, was ? "Unstar" : "Star"))
      ensure((await starred()) !== was, "Star from Shift+F10 did not change the star")
      // Read from the keys: the unread square goes.
      m = await openMenu(/Token audit/, { keys: true })
      await press(app, item(m, "Read"))
      ensure(!(await rowOf(page, /Token audit/).locator('[data-slot="list-row-unread"]').count()), "Read did not mark the conversation read")
      // Always in Newsletters says it is done (Remind me in 3 days is checked in mail-row-facts, on your own mail).
      m = await openMenu(/Your booking is confirmed/, { keys: true })
      await press(app, item(m, "Always in Newsletters"))
      await toast("goes to Newsletters").waitFor()
      // Snooze until ▸ Tomorrow from the keys: the conversation leaves, the toast names it, and Undo brings it back.
      m = await openMenu(/Cabin weekend/, { keys: true })
      await item(m, "Snooze until").click()
      await press(app, page.getByRole("menuitem", { name: /^Tomorrow/ }))
      await toast("Snoozed Re: Cabin weekend").waitFor()
      ensure(!(await list.getByRole("button", { name: /Cabin weekend/ }).count()), "Snooze did not take the conversation out of the Inbox")
      await press(app, toast("Snoozed Re: Cabin weekend").getByRole("button", { name: "Undo", exact: true }))
      await list.getByRole("button", { name: /Cabin weekend/ }).first().waitFor()
      // Pick date and time…: the shared picker, titled Snooze; Esc puts it away and focus returns to the row.
      m = await openMenu(/Cabin weekend/)
      await item(m, "Snooze until").click()
      await press(app, page.getByRole("menuitem", { name: "Pick date and time…" }))
      const picker = page.getByRole("dialog", { name: "Snooze" })
      ensure(await picker.getByRole("button", { name: "Snooze", exact: true }).isVisible(), "Pick date and time… did not open the picker")
      await page.keyboard.press("Escape")
      await app.settle()
      ensure(!(await picker.count()), "Esc did not close the picker")
      ensure(await rowOf(page, /Cabin weekend/).locator('[data-slot="list-row-main"]').evaluate((el) => el === document.activeElement), "focus did not return to the row")
      // Archive from the keys, and its Undo.
      m = await openMenu(/Cabin weekend/, { keys: true })
      await press(app, item(m, "Archive"))
      await toast("Archived Re: Cabin weekend").waitFor()
      ensure(!(await list.getByRole("button", { name: /Cabin weekend/ }).count()), "Archive did not take the conversation out of the Inbox")
      await press(app, toast("Archived Re: Cabin weekend").getByRole("button", { name: "Undo", exact: true }))
      await list.getByRole("button", { name: /Cabin weekend/ }).first().waitFor()
      for (const t of await page.locator("[data-sonner-toast]").all()) await t.waitFor({ state: "detached", timeout: 15_000 }).catch(() => {})
      await page.mouse.move(0, 0)
      await app.settle()
      // The picture: the Inbox as it starts, with the menu open from a row's overflow button.
      await page.reload()
      await app.settle()
      await openMenu(/Token audit/)
    },
  },
  {
    // Mobile / 05: Mail's folders and accounts (ADR-0084). A sheet from the page head on a phone, a
    // popover at medium width, the sidebar's groups on a desktop. The rows are the core's lanes.
    name: "mail-folders-sheet",
    sizes: ["phone", "desktop", "medium"],
    sean: { kind: "drawn", area: "mail", screen: "folders-sheet" },
    run: async (app) => {
      const { page } = app
      const rows = page.getByRole("list", { name: "Inbox" }).getByRole("button")
      const everyone = await rows.count()
      // The Account radio group filters the list, and picking closes the layer.
      await press(app, (await groups(app)).getByRole("radio", { name: "Work", exact: true }))
      ensure(!(await switcherLayer(page).count()), "picking an account left the layer open")
      const work = await rows.count()
      ensure(work > 0 && work < everyone, `the Work account shows ${work} of ${everyone} conversations: it did not filter the list`)
      ensure(/Inbox\s*\/\/\s*Work/i.test(await page.locator('[data-slot="page-head-overline"]:visible').first().innerText()), "the page head does not name the account")
      // A place is a history entry: another folder, then Back, is the Inbox again, still on Work.
      await lane(app, "Starred")
      ensure((await headTitle(page)) === "Starred", "Starred did not open from the folders")
      ensure(!(await switcherLayer(page).count()), "picking a folder left the layer open")
      await goBack(app)
      ensure((await headTitle(page)) === "Today", "Back from Starred did not return to the Inbox")
      ensure((await rows.count()) === work, "Back from Starred lost the account")
      await goBack(app)
      ensure((await rows.count()) === everyone, "Back from the Work account did not return to all accounts")
      if (await switcher(page).count()) {
        // A pushed screen: Back returns to the list, in the same place.
        await conversation(app, /Token audit/)
        ensure(await page.getByRole("button", { name: "Back", exact: true }).first().isVisible(), "the conversation is not a pushed screen")
        await goBack(app)
        ensure(await page.getByRole("list", { name: "Inbox" }).isVisible(), "Back from a conversation did not return to the list")
        ensure((await headTitle(page)) === "Today", "Back from a conversation changed the place")
      }
      if (app.size === "phone") {
        // Scrolled, the small title the head collapses to is the same button (cross-app decisions §7).
        const list = page.getByRole("region", { name: "Mail", exact: true })
        await list.evaluate((el) => el.scrollTo(0, 400))
        await app.settle()
        const small = page.locator('button[data-slot="app-frame-top-row-title"]')
        ensure((await small.getAttribute("aria-label")) === "Inbox, All accounts. Change folder or account.", `the small title is not the switcher: ${await small.getAttribute("aria-label")}`)
        await press(app, small)
        ensure(await switcherLayer(page).isVisible(), "the small title did not open the folders")
        await leaveLayer(app)
        await list.evaluate((el) => el.scrollTo(0, 0))
        await app.settle()
        // A sideways swipe on the head steps the account; its keys are the arrows while the head has focus.
        await switcher(page).first().focus()
        await page.keyboard.press("ArrowRight")
        await app.settle()
        ensure(/Inbox\s*\/\/\s*Personal/i.test(await page.locator('[data-slot="page-head-overline"]:visible').first().innerText()), "stepping the account from the head did not go from All to the first account")
        await page.keyboard.press("ArrowLeft")
        await app.settle()
        ensure(/Inbox\s*\/\/\s*All accounts/i.test(await page.locator('[data-slot="page-head-overline"]:visible').first().innerText()), "stepping back did not return to all accounts")
        await page.evaluate(() => document.activeElement?.blur())
      }
      await groups(app)
    },
    assert: async (app) => {
      const { page } = app
      const list = await groups(app)
      ensure((await oneCurrent(list, "Mail's folders")) === "Inbox", "the Inbox is not the current place")
      for (const gone of ["Drafts", "Sent", "Spam"]) ensure(!(await list.getByRole("button", { name: gone, exact: true }).count()), `${gone} is listed, and the core has no such folder`)
      for (const row of ["Unread", "Starred", "Snoozed", "Waiting", "Scheduled", "Archive", "Team", "Add an account…"]) ensure(await list.getByRole("button", { name: row, exact: true }).count(), `${row} is not in Mail's folders`)
      const accounts = list.getByRole("radiogroup", { name: /Account/ })
      ensure((await accounts.getByRole("radio").count()) === 3, "the Account group is not All and the two accounts")
      ensure(await accounts.getByRole("radio", { name: "All", exact: true }).isChecked(), "All is not the checked account")
      ensure(!(await list.locator('[role="radio"][aria-current]').count()), "an account says it is the current place: it is a filter")
      if (await switcherLayer(page).count()) {
        ensure(/Mail\s*\/\/\s*All accounts/i.test(await list.innerText()), "the layer's overline does not name the section and the account")
        ensure(/Change folder or account\.$/.test(await switcher(page).first().getAttribute("aria-label")), "the page head button does not say what it changes")
      } else ensure(!(await switcher(page).count()), "the page head is a switcher although the sidebar lists the folders")
    },
  },
]
