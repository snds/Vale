// Mail: the lanes, a conversation, reading and writing. Search is in search.mjs.
import { area, button, closeForm, tabBar, discardQuestion, ensure, formatBar, formLayer, formPrimary, goBack, groups, headTitle, sidebar, leaveLayer, oneCurrent, pick, press, switcher, switcherLayer, toastGone } from "./helpers.mjs"
import { settings } from "./settings.mjs"

/** Opens a conversation in the Inbox list by its subject. */
export const conversation = async (app, subject) => {
  await press(app, app.page.getByRole("list", { name: "Inbox" }).getByRole("button", { name: subject }).first())
  // The pointer leaves the row it pressed: once the conversation is pushed over the list, a message row stands there.
  await app.page.mouse.move(0, 0)
}
/** Opens a lane (Unread, Starred, Snoozed…) from Mail's folders: the sidebar, or the page head's sheet or popover. */
export const lane = async (app, name) => {
  await pick(app, name)
  // The press lands where a row now stands: the pointer leaves it, so no hover is in the picture by chance.
  await app.page.mouse.move(0, 0)
  await app.settle()
}
/**
 * Opens the Outbox. On a phone while a send waits out its window, by the sending strip's text area (ADR-0095): a
 * toast raised then stands under the top row, over the page head, until it is closed.
 */
const openOutbox = async (app) => {
  const open = app.page.locator('[data-slot="accessory-open"]:visible')
  if (app.phone && (await open.count())) {
    await press(app, open.first())
    await app.page.mouse.move(0, 0)
  } else await lane(app, "Outbox")
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
/** The open conversation: the detail column beside the list, or the screen pushed over it. */
const reader = (page) => page.getByRole("region", { name: "Mail: what is open" })
/** The needs-you blocks on the screen that show. */
const needsYou = (page) => page.locator('[data-slot="needs-you"]:visible')
/** A toast by its words. */
const toastSaying = (page, words) => page.locator("[data-sonner-toast]").filter({ hasText: words })
/** The share form (brief M9), in the form layer. */
const shareForm = (page) => page.getByRole("dialog", { name: /Share with teammates/ })
/** The open shared conversation in the Team lane. */
const teamView = (page) => page.locator("article").filter({ has: page.getByRole("tablist", { name: "Team" }) }).first()
/** Scrolls a part of the open conversation to the top of its column, with no focus ring and no hover left in the picture. */
const toTop = async (app, locator) => {
  await locator.evaluate((el) => el.scrollIntoView({ block: "start" }))
  await app.page.evaluate(() => document.activeElement?.blur())
  await app.page.mouse.move(0, 0)
  await app.settle()
}
/** Opens a shared conversation from the Team lane by its title. */
const openTeam = async (app, title) => {
  await lane(app, "Team")
  await press(app, app.page.getByRole("list", { name: "Team" }).getByRole("button", { name: title }))
  await app.page.mouse.move(0, 0)
}
/** A Field Row by its label, in the open conversation. */
const fieldRow = (page, label) => reader(page).getByRole("group", { name: label, exact: true })
/** The reply field pinned at the conversation's foot (a phone's bottom row). */
const replyField = (page) => page.getByRole("textbox", { name: /^Reply to / })
/** A conversation's own action by name: in the toolbar on a desktop, in the top bar on a phone (ADR-0092). */
const action = (app, name) =>
  (app.phone ? app.page.locator('[data-slot="app-frame-top-row"]') : app.page.getByRole("toolbar", { name: "Conversation" })).getByRole("button", { name, exact: true })
/** Opens the conversation's More: a menu on a desktop, a sheet on a phone. Returns it. */
const more = async (app) => {
  await press(app, action(app, "More"))
  return app.page.getByRole(app.phone ? "dialog" : "menu", { name: "More" })
}
/** A row of a menu that is a menu on a desktop and a sheet on a phone (unicron's AdaptiveMenu). */
const row = (app, within, name) => within.getByRole(app.phone ? "button" : "menuitem", { name, exact: typeof name === "string" })
/** More, then one of its rows. */
const moreItem = async (app, name) => press(app, row(app, await more(app), name))
/** The snooze times: the toolbar's Snooze on a desktop; More's Snooze… on a phone. */
const snoozeMenu = async (app) => {
  if (app.phone) await moreItem(app, "Snooze…")
  else await press(app, action(app, "Snooze"))
  return app.page.getByRole(app.phone ? "dialog" : "menu", { name: "Snooze until" })
}
/** Opens a conversation and asks for its summary from More; `ready` waits for the points. */
const summarize = async (app, subject, ready = true) => {
  await conversation(app, subject)
  await moreItem(app, "Summarize")
  if (ready) await reader(app.page).locator('[data-slot="summary-block-lines"]').first().waitFor()
  await app.page.mouse.move(0, 0)
}
/** Every toast that is up leaves (an UNDO pressed takes its own toast away, so there may be none). */
const toastsGone = async ({ page }) => {
  await page.mouse.move(0, 0)
  for (const t of await page.locator("[data-sonner-toast]").all()) await t.waitFor({ state: "detached", timeout: 15_000 }).catch(() => {})
}
/** Archives a conversation from its own action: a finished action, so a toast with Undo. */
const archive = async (app, subject) => {
  await conversation(app, subject)
  // The conversation's own action: Mail's folders have an Archive too, in the sidebar (ADR-0084).
  await action(app, "Archive").click()
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

/**
 * One of the message's tools (ADR-0094; brief M6): a button of the footer's Toolbar on a desktop; on a
 * phone, a row of More at the foot (a sheet). Returns what it opened, when it opened something.
 */
const messageTool = async (app, form, name) => {
  const { page } = app
  if (!app.phone) {
    await press(app, form.getByRole("toolbar", { name: "Message tools" }).getByRole("button", { name, exact: true }))
    return page.getByRole("menu", { name })
  }
  await press(app, form.getByRole("button", { name: "More", exact: true }))
  const sheet = page.getByRole("dialog", { name: "More" })
  const words = { Templates: "Templates…", "Remind me if no reply": "Remind me if no reply…", "Send later": "Send later…" }
  if (name === "Formatting" || name === "Ask for a read receipt") {
    await press(app, sheet.getByRole("checkbox", { name, exact: true }))
    await page.keyboard.press("Escape")
    await app.settle()
    return null
  }
  await press(app, sheet.getByRole("button", { name: words[name] ?? name, exact: true }))
  return page.getByRole("dialog", { name })
}
/** Turns Formatting on: the toolbar's toggle on a desktop, More's row on a phone. */
const formatting = (app, form) => messageTool(app, form, "Formatting")
/** Opens Send later: the chevron beside Send on a desktop; More's Send later… on a phone (or a long press on Send). */
export const sendLater = async (app, form) => {
  if (app.phone) return messageTool(app, form, "Send later")
  await press(app, form.getByRole("button", { name: "Send later", exact: true }))
  return app.page.getByRole("menu")
}
/** A row of the message's menus: a menu item on a desktop, a sheet row on a phone. */
export const toolRow = (app, within, name, kind = "item") =>
  within.getByRole(app.phone ? { item: "button", radio: "radio", check: "checkbox" }[kind] : { item: "menuitem", radio: "menuitemradio", check: "menuitemcheckbox" }[kind], { name, exact: true })
/** Drags a file the scene makes over the message and drops it: `bytes` long, named `name`. `hold` stops before the drop. */
const dropFile = async (app, form, name, bytes, hold = false) => {
  await form.locator('[data-slot="rich-editor"]').evaluate(
    (el, { name, bytes, hold }) => {
      const data = new DataTransfer()
      data.items.add(new File([new Uint8Array(bytes)], name, { type: "application/zip" }))
      const fire = (type) => el.dispatchEvent(new DragEvent(type, { dataTransfer: data, bubbles: true, cancelable: true }))
      fire("dragenter")
      fire("dragover")
      if (!hold) fire("drop")
    },
    { name, bytes, hold },
  )
  await app.settle()
}
/** Writes the drawn message (Desktop / 02, Mobile / 03), with the demo's own person: To, Subject and the words. */
const writeMessage = async (app, form, { to = "Marcus", who = /Marcus Lee/, subject = "Saturday ferry", words = "The 08:15 crossing is booked. Shall we meet at the pier at 7:45?" } = {}) => {
  await form.getByRole("combobox", { name: "To" }).pressSequentially(to)
  await press(app, app.page.getByRole("option", { name: who }))
  await form.getByRole("textbox", { name: "Subject" }).fill(subject)
  await form.getByRole("textbox", { name: "Message" }).click()
  await app.page.keyboard.type(words)
}
/** The form's Send: the footer's on a desktop, the top row's float button on a phone. */
const sendButton = (form) => form.getByRole("button", { name: /^(Send|Schedule)$/ })

export const scenes = [
  {
    // Mobile / 01 and Desktop / 01's list (ADR-0113; brief M1): message rows with no face, the time as the
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
      ensure(await rows.filter({ has: page.locator('[data-slot="list-row-count"]', { hasText: /^00[2-9]$/ }) }).count(), "no row shows its thread's count")
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
      await page.locator("[data-sonner-toast]").filter({ hasText: "Comes back in 3 days if nobody replies" }).waitFor()
      ensure(!(await page.getByRole("list", { name: "Inbox", exact: true }).locator('[data-slot="badge"]').count()), "Remind me in 3 days left the row in the Inbox with No reply yet")
      await toastGone(app)
      // The picture: the Inbox with the reminder come due again, as the scenario starts.
      await page.reload()
      await app.settle()
    },
  },
  {
    // Desktop / 01's detail column, Mobile / 02 (ADR-0092; brief M4): a thread of three. The meta line with the
    // toolbar beside it on a desktop, the title, the messages as rows and rules, the reply field at the foot.
    name: "mail-conversation",
    sizes: ["desktop", "phone", "medium"],
    run: (app) => conversation(app, /Token audit/),
    assert: async (app) => {
      const { page } = app
      const meta = await reader(page).locator('[data-slot="meta-list"]').innerText()
      for (const label of ["FROM", "MESSAGES", "LATEST"]) ensure(meta.toUpperCase().includes(label), `the meta line has no ${label}`)
      ensure(/\b003\b/.test(meta), "the meta line does not count the thread's three messages")
      ensure((await reader(page).getByRole("region", { name: /^Message from / }).count()) === 3, "the thread does not show its three messages")
      ensure(await replyField(page).isVisible(), "no reply field")
      ensure((await replyField(page).getAttribute("placeholder")) === "Reply to Priya", "the reply field does not say whom it answers")
      ensure((await page.locator('[data-slot="composer"]:visible').count()) === 1, "more than one Composer on the screen")
      if (app.phone) {
        for (const name of ["Back", "Archive", "More"]) ensure(await button(page, name).isVisible(), `the top bar has no ${name}`)
        ensure(!(await page.getByRole("toolbar", { name: "Conversation" }).count()), "a phone shows the desktop toolbar")
      } else {
        const bar = page.getByRole("toolbar", { name: "Conversation" })
        for (const name of ["Archive", "Snooze", "Unstar", "Mark unread", "More"]) ensure(await bar.getByRole("button", { name, exact: true }).isVisible(), `the toolbar has no ${name}`)
        // One Tab stop: the arrow keys move along it.
        ensure((await bar.locator('button:not([tabindex="-1"])').count()) === 1, "the toolbar is more than one Tab stop")
      }
    },
  },
  {
    // The drawn frames' content, on the demo's own mail: one message with a file, summarized (AI set up, and asked).
    name: "mail-conversation-drawn",
    sizes: ["desktop"],
    sean: { kind: "drawn", area: "mail", screen: "inbox-message" },
    scenario: "ai-on",
    run: (app) => summarize(app, /Your booking is confirmed/),
  },
  {
    name: "mail-conversation-drawn-phone",
    sizes: ["phone"],
    sean: { kind: "drawn", area: "mail", screen: "message" },
    scenario: "ai-on",
    run: (app) => summarize(app, /Your booking is confirmed/),
  },
  {
    // A conversation of five (brief M4): the older read ones as rows that open, the newest (and anything unread) open.
    // Enter on a row opens it and again closes it; each message is a region named for its sender.
    name: "mail-thread-5",
    scenario: "thread-5",
    sean: { kind: "undrawn", area: "mail", screen: "thread" },
    run: async (app) => {
      const { page } = app
      await conversation(app, /Token audit/)
      const messages = reader(page).getByRole("region", { name: /^Message from / })
      ensure((await messages.count()) === 5, `the thread shows ${await messages.count()} messages, not five`)
      const toggles = (state) => messages.locator(`[aria-expanded="${state}"]`)
      const closed = toggles(false)
      // Four are read; the newest is unread.
      ensure((await closed.count()) === 4, `${await closed.count()} messages start closed, not the four older read ones`)
      ensure((await toggles(true).count()) === 1, "the newest does not start open")
      const meta = await reader(page).locator('[data-slot="meta-list"]').innerText()
      ensure(/\b005\b/.test(meta), "the meta line does not count five messages")
      await closed.first().focus()
      await page.keyboard.press("Enter")
      await app.settle()
      ensure((await toggles(true).count()) === 2, "Enter did not open a closed message")
      await toggles(true).first().focus()
      await page.keyboard.press("Enter")
      await app.settle()
      ensure((await toggles(false).count()) === 4, "Enter did not close the open message again")
      await page.evaluate(() => document.activeElement?.blur())
      await page.mouse.move(0, 0)
    },
  },
  {
    // Opening takes a moment: a title bar and three lines (brief 4.0), never the agent's motion.
    name: "mail-conversation-loading",
    scenario: "thread-slow",
    loading: true,
    run: (app) => conversation(app, /Token audit/),
    assert: async ({ page }) => ensure(await reader(page).getByRole("status", { name: "Opening the conversation" }).isVisible(), "no loading lines while the conversation opens"),
  },
  {
    // A conversation deleted on another device: its row is still listed, and it says so when opened.
    name: "mail-conversation-gone",
    scenario: "thread-gone",
    run: (app) => conversation(app, /Token audit/),
    assert: async ({ page }) => ensure(await reader(page).getByText("That conversation is gone.").isVisible(), "a conversation that is gone does not say so"),
  },
  {
    // An invitation to answer (ADR-0093; brief M5): the needs-you block in the notice slot, and the invitation's rows in its message.
    name: "mail-invitation",
    run: (app) => conversation(app, /Invitation: Design crit/),
    assert: async ({ page }) => ensure(await needsYou(page).filter({ hasText: /^Invitation \/\//i }).isVisible(), "the invitation has no needs-you block"),
  },
  {
    // Files as chips (brief M4): press one to see it, Save saves it ("Saved {name}").
    name: "mail-attachments",
    run: async (app) => {
      await conversation(app, /Your booking is confirmed/)
      const files = reader(app.page).getByRole("group", { name: "Attachments" })
      ensure((await files.locator('[data-slot="file-chip"]').count()) === 2, "the message does not show its two files")
      await press(app, files.getByRole("button", { name: "Save booking-confirmation.pdf", exact: true }))
      await app.page.locator("[data-sonner-toast]").filter({ hasText: "Saved booking-confirmation.pdf" }).waitFor()
      await toastGone(app)
    },
  },
  {
    // An HTML message in its sandboxed frame, set in the app's type and ink; its script never ran.
    name: "mail-html",
    run: (app) => conversation(app, /Design Systems Weekly/),
    assert: async ({ page }) => {
      const body = page.frameLocator('iframe[title="Message body"]').locator("body")
      ensure(/Variable fonts in production/.test(await body.innerText()), "the HTML message did not render")
      ensure(!/pwned/.test(await body.innerText()), "the message's script ran")
    },
  },
  {
    // Remote images held back until asked (ADR-0055): a compact info banner over that body, with LOAD IMAGES.
    name: "mail-blocked-images",
    run: (app) => conversation(app, /Design Systems Weekly/),
    assert: async ({ page }) => {
      const banner = reader(page).locator('[data-slot="banner"]').filter({ hasText: "Remote images are blocked." })
      ensure(await banner.isVisible(), "no notice that remote images are blocked")
      ensure(await banner.getByRole("button", { name: "Load images", exact: true }).isVisible(), "the notice has no Load images")
      ensure(!(await page.frameLocator('iframe[title="Message body"]').locator('img[src^="http"]').count()), "a remote image is in the frame before it was asked for")
    },
  },
  {
    // The sender panel (ADR-0093; brief M5; DC5), from the FROM value: at 1440 the detail column is 648 wide, short of the
    // 960 a third column needs, so it is a sheet from the side; a sheet on a phone and at medium width too.
    name: "mail-sender",
    sizes: ["desktop", "phone", "medium"],
    sean: { kind: "undrawn", area: "mail", screen: "sender-panel" },
    run: async (app) => {
      await conversation(app, /Token audit/)
      await press(app, app.page.getByRole("button", { name: "About Priya Raman", exact: true }))
      await app.page.getByRole("dialog", { name: "About Priya Raman" }).getByRole("region", { name: "Mail" }).waitFor()
      await app.page.mouse.move(0, 0)
    },
    assert: async (app) => {
      const { page } = app
      const panel = page.getByRole("dialog", { name: "About Priya Raman" })
      ensure(await panel.isVisible(), "FROM did not open the sender panel as a sheet")
      for (const name of ["Write", "Open card"]) ensure(await panel.getByRole("button", { name, exact: true }).isVisible(), `the panel has no ${name}`)
      ensure(/there \/\/ /.test(await panel.locator('[data-slot="sender-local-time"]').innerText()), "the panel does not say the sender's local time")
      ensure(await panel.getByRole("list", { name: /^Recent mail with / }).locator('[data-slot="list-row"]').count(), "the panel lists no recent mail")
      if (app.size === "desktop") {
        // The sheet makes the page behind it inert, so the column is found by its label, not its role.
        const detail = Math.round((await page.locator('[aria-label="Mail: what is open"] article').first().boundingBox()).width)
        ensure(Math.abs(detail - 648) <= 2, `the detail column is ${detail} wide at 1440, not 648`)
        const box = await panel.boundingBox()
        ensure(Math.round(box.x + box.width) >= 1438 && box.x > 1000, "the panel is not a sheet at the right edge")
      }
    },
  },
  {
    // With room (a 2200 wide window), the sender panel stands as a third column beside the conversation, not a sheet (DC5).
    name: "mail-sender-column",
    sizes: ["desktop"],
    viewport: { width: 2200, height: 1000 },
    run: async (app) => {
      await conversation(app, /Token audit/)
      await press(app, app.page.getByRole("button", { name: "About Priya Raman", exact: true }))
      await app.page.getByRole("complementary", { name: "About Priya Raman" }).waitFor()
      await app.page.mouse.move(0, 0)
    },
    assert: async ({ page }) => {
      ensure(!(await page.getByRole("dialog", { name: "About Priya Raman" }).count()), "with room, the sender panel is still a sheet")
      ensure(Math.round((await reader(page).boundingBox()).width) >= 960, "the conversation keeps less than 960 beside the panel")
    },
  },
  {
    // Opt-in AI (ADR-0059; brief M5): asked for from More; SUMMARY // NN POINTS, the points, the model, the caveat.
    name: "mail-summary",
    scenario: "ai-on",
    sean: { kind: "undrawn", area: "mail", screen: "summary" },
    run: (app) => summarize(app, /Token audit/),
    assert: async ({ page }) => {
      const block = reader(page).locator('[data-slot="summary-block"]').first()
      const text = await block.innerText()
      ensure(/SUMMARY\s*\/\/\s*003 POINTS/.test(text), "the summary's overline does not count its points")
      ensure(text.includes("It can be wrong. Check what matters."), "the summary does not say it can be wrong")
      ensure(/llama3\.2/i.test(text), "the summary does not say which model wrote it")
      for (const name of ["Copy", "Close"]) ensure(await block.getByRole("button", { name, exact: true }).isVisible(), `the summary has no ${name}`)
      ensure(await reader(page).getByRole("button", { name: "Suggest replies", exact: true }).isVisible(), "no Suggest replies with AI set up")
    },
  },
  {
    // While the model writes: skeleton lines with the agent's own motion.
    name: "mail-summary-loading",
    scenario: ["ai-on", "ai-slow"],
    loading: true,
    run: (app) => summarize(app, /Token audit/, false),
    assert: async ({ page }) => ensure((await reader(page).locator('[data-slot="summary-block"]').getAttribute("aria-busy")) === "true", "the summary is not busy while it loads"),
  },
  {
    // The model cannot be reached: one critical line, TRY AGAIN and OPEN SETTINGS.
    name: "mail-summary-error",
    scenario: ["ai-on", "ai-fails"],
    run: (app) => summarize(app, /Token audit/, false),
    assert: async ({ page }) => {
      const block = reader(page).locator('[data-slot="summary-block"]')
      ensure(/didn.t answer/.test(await block.innerText()), "the failed summary does not say why")
      for (const name of ["Try again", "Open settings"]) ensure(await block.getByRole("button", { name, exact: true }).isVisible(), `the failed summary has no ${name}`)
    },
  },
  {
    // Suggested replies (brief M5): REPLIES // 03, rows to press; a pick fills the reply field and sends nothing.
    name: "mail-summary-replies",
    scenario: "ai-on",
    run: async (app) => {
      const { page } = app
      await conversation(app, /Token audit/)
      await press(app, reader(page).getByRole("button", { name: "Suggest replies", exact: true }))
      const block = reader(page).locator('[data-slot="summary-block"]')
      await block.getByRole("list", { name: "Suggested replies" }).waitFor()
      ensure(/REPLIES\s*\/\/\s*003/.test(await block.innerText()), "the replies' overline does not count them")
      await press(app, block.getByRole("button", { name: /^Thanks, Priya\. That works for me\./ }))
      ensure((await replyField(page).inputValue()) === "Thanks, Priya. That works for me.", "picking a reply did not fill the reply field")
      ensure(!(await strip(page).count()) && !(await page.getByText(/^Sending/i).count()), "picking a reply sent something")
    },
  },
  {
    name: "mail-snooze-menu",
    sean: { kind: "undrawn", area: "mail", screen: "snooze" },
    run: async (app) => {
      await conversation(app, /Token audit/)
      await snoozeMenu(app)
    },
    // The presets, then any date and time (ADR-0088; brief M8).
    assert: async (app) => ensure(await row(app, app.page.getByRole(app.phone ? "dialog" : "menu", { name: "Snooze until" }), "Pick date and time…").isVisible(), "the snooze menu has no custom time"),
  },
  {
    // Snooze until any date and time: the shared picker, titled for the job, with its one primary.
    name: "mail-snooze-time",
    run: async (app) => {
      await conversation(app, /Token audit/)
      await press(app, row(app, await snoozeMenu(app), "Pick date and time…"))
      const picker = app.page.getByRole("dialog", { name: "Snooze" })
      // Tomorrow, at the hour it opens on: the conversation leaves the inbox until then.
      await press(app, picker.getByRole("gridcell", { name: /^Friday, November 13/ }))
      await press(app, picker.getByRole("button", { name: "Snooze", exact: true }))
      ensure(!(await picker.count()), "Snooze did not close the picker")
      await toasts(app.page).filter({ hasText: /Snoozed/ }).first().waitFor()
      await toastGone(app)
      // The picture: the picker again, on another conversation.
      await conversation(app, /Cabin weekend/)
      await press(app, row(app, await snoozeMenu(app), "Pick date and time…"))
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
    // The viewer (brief M4): viewer 960, a full sheet on a phone. TXT // 63 B, the name, close; one secondary SAVE.
    name: "mail-attachment-preview",
    sizes: ["desktop", "phone", "medium"],
    sean: { kind: "undrawn", area: "mail", screen: "attachment-preview" },
    run: async (app) => {
      await conversation(app, /Your booking is confirmed/)
      await press(app, reader(app.page).getByRole("button", { name: /what-to-bring\.txt/ }).first())
      await app.page.mouse.move(0, 0)
    },
    assert: async (app) => {
      const viewer = app.page.getByRole("dialog", { name: "what-to-bring.txt" })
      ensure(/TXT\s*\/\/\s*\d+ B/.test(await viewer.innerText()), "the viewer's overline is not TYPE // SIZE")
      ensure(/Passports/.test(await viewer.innerText()), "the viewer does not show the file")
      ensure(await viewer.getByRole("button", { name: "Save", exact: true }).isVisible(), "the viewer has no Save")
      // The viewer size, capped at the window less 48 (contract C10): 960 on a desktop, 720 at 768.
      const want = Math.min(960, app.page.viewportSize().width - 48)
      if (!app.phone) ensure(Math.round((await viewer.boundingBox()).width) === want, `the viewer is ${Math.round((await viewer.boundingBox()).width)} wide, not ${want}`)
    },
  },
  {
    // Unsubscribe (ADR-0093; brief M5): one question, its body by method (one-click here), focus on Cancel.
    name: "mail-unsubscribe",
    sean: { kind: "undrawn", area: "mail", screen: "unsubscribe" },
    run: async (app) => {
      await conversation(app, /Design Systems Weekly/)
      await moreItem(app, "Unsubscribe…")
      await app.page.getByRole("dialog", { name: "Unsubscribe from Design Systems Weekly?" }).waitFor()
    },
    assert: async ({ page }) => {
      const question = page.getByRole("dialog", { name: "Unsubscribe from Design Systems Weekly?" })
      ensure(/Vale asks the sender to remove you, in one request\./.test(await question.innerText()), "the question does not say what one-click does")
      ensure(await question.getByRole("button", { name: "Cancel", exact: true }).evaluate((el) => el === document.activeElement), "focus does not start on Cancel")
    },
  },
  {
    // By mail: the body names the address the request goes to. Yes, then the toast with ARCHIVE.
    name: "mail-unsubscribe-mail",
    path: "/?newsletters",
    run: async (app) => {
      const { page } = app
      // Two newsletters bundle in the Inbox: the bundle opens them (ADR-0114).
      await press(app, bundle(page).locator('[data-slot="list-row-main"]'))
      await conversation(app, /October at the studio/)
      await moreItem(app, "Unsubscribe…")
      const question = page.getByRole("dialog", { name: "Unsubscribe from Clay Club?" })
      ensure(/Vale sends an unsubscribe message to leave@clayclub\.example from this account\./.test(await question.innerText()), "the question does not say a message goes to the list's address")
      await press(app, question.getByRole("button", { name: "Unsubscribe", exact: true }))
      const toast = page.locator("[data-sonner-toast]").filter({ hasText: "Unsubscribe request sent" })
      await toast.waitFor()
      ensure(await toast.getByRole("button", { name: "Archive", exact: true }).isVisible(), "the toast has no Archive")
      await page.mouse.move(0, 0)
    },
  },
  {
    // A reminder that came due (ADR-0093; brief M5): NO REPLY YET in the notice slot, with a solid DONE and a text REMIND AGAIN.
    name: "mail-needs-you",
    scenario: "follow-up-due",
    sean: { kind: "undrawn", area: "mail", screen: "needs-you" },
    run: (app) => conversation(app, /Oak shelves for the kitchen/),
    assert: async ({ page }) => {
      const block = needsYou(page)
      ensure((await block.count()) === 1, `${await block.count()} needs-you blocks show, not one`)
      ensure(/^No reply yet$/i.test((await block.locator('[data-slot="needs-you-title"]').innerText()).trim()), "the block's title is not NO REPLY YET")
      ensure(/You asked to be reminded /.test(await block.innerText()), "the block does not say when you asked to be reminded")
      ensure(await block.getByRole("button", { name: "Done", exact: true }).isVisible(), "the block has no Done")
      ensure(await block.getByRole("button", { name: "Remind again", exact: true }).isVisible(), "the block has no Remind again")
    },
  },
  {
    // What waits on you and can wait (cross-app settlement): a needs-you count on the way into Mail, and the block on
    // Mail's home screen, the Inbox. OPEN opens the conversation, whose own block takes over.
    name: "mail-waiting-on-you",
    scenario: "follow-up-due",
    sizes: ["desktop", "phone"],
    sean: { kind: "undrawn", area: "mail", screen: "waiting-on-you" },
    run: (app) => area(app, "Mail"),
    assert: async (app) => {
      const { page } = app
      const block = page.locator('[data-role="waiting-on-you"] [data-slot="needs-you"]')
      ensure((await block.count()) === 1, "the Inbox has no needs-you block for the reminder that came due")
      ensure(/^No reply yet/i.test((await block.locator('[data-slot="needs-you-title"]').innerText()).trim()), "the block's title is not NO REPLY YET")
      const way = app.phone ? page.getByRole("tab", { name: /^Mail, .*no reply yet/ }) : sidebar(page).getByRole("button", { name: /^Mail, .*no reply yet/ })
      ensure(await way.count(), "the way into Mail has no needs-you count")
    },
  },
  {
    // OPEN on the Inbox's block opens the conversation, whose own block takes over: one yellow block on screen.
    name: "mail-waiting-on-you-open",
    scenario: "follow-up-due",
    sizes: ["desktop", "phone"],
    run: async (app) => {
      const { page } = app
      await area(app, "Mail")
      await press(app, page.locator('[data-role="waiting-on-you"]').getByRole("button", { name: "Open", exact: true }))
      await needsYou(page).first().waitFor()
    },
    assert: async ({ page }) => {
      ensure(!(await page.locator('[data-role="waiting-on-you"]:visible').count()), "the Inbox's block stays beside the open conversation's")
      ensure((await needsYou(page).count()) === 1, `${await needsYou(page).count()} needs-you blocks show, not one`)
    },
  },
  {
    // DONE archives the conversation (a toast with UNDO); UNDO brings it back to the Inbox, and the
    // reminder with it (Vale 33): the row says NO REPLY YET again and the block is back.
    name: "mail-needs-you-done",
    scenario: "follow-up-due",
    run: async (app) => {
      const { page } = app
      await conversation(app, /Oak shelves for the kitchen/)
      await press(app, needsYou(page).getByRole("button", { name: "Done", exact: true }))
      const toast = toastSaying(page, /^Archived /)
      await toast.waitFor()
      const inbox = page.getByRole("list", { name: "Inbox", exact: true })
      await inbox.getByRole("button", { name: /Oak shelves for the kitchen/ }).waitFor({ state: "detached" })
      await press(app, toast.getByRole("button", { name: "Undo", exact: true }))
      await inbox.getByRole("button", { name: /Oak shelves for the kitchen/ }).first().waitFor()
      await toastsGone(app)
    },
    assert: async (app) => {
      const { page } = app
      const row = page.getByRole("list", { name: "Inbox", exact: true }).locator('[data-slot="list-row"]').filter({ hasText: /Oak shelves for the kitchen/ }).first()
      ensure(/No reply yet/i.test(await row.innerText()), "UNDO after DONE brought the conversation back without its reminder")
      if (app.phone) await conversation(app, /Oak shelves for the kitchen/)
      else if (!(await needsYou(page).count())) await conversation(app, /Oak shelves for the kitchen/)
      await needsYou(page).first().waitFor()
      ensure(/^No reply yet$/i.test((await needsYou(page).locator('[data-slot="needs-you-title"]').innerText()).trim()), "the conversation's NO REPLY YET block did not come back")
    },
  },
  {
    // Two things wait in one conversation: one block (the reminder, its title ending // +1), the invitation a row under WAITING ON YOU.
    name: "mail-needs-you-two",
    scenario: ["follow-up-due", "invite-waiting"],
    run: (app) => conversation(app, /Oak shelves for the kitchen/),
    assert: async ({ page }) => {
      const block = needsYou(page)
      ensure((await block.count()) === 1, `${await block.count()} needs-you blocks show when two things wait, not one`)
      ensure(/\/\/ \+1\b/.test((await block.locator('[data-slot="needs-you-title"]').innerText()).trim()), "the block's title does not end // +1")
      const rows = reader(page).getByRole("list", { name: "Waiting on you" })
      ensure(await rows.getByText("Measure the alcoves", { exact: true }).isVisible(), "the invitation is not a row under Waiting on you")
      ensure(await rows.getByRole("button", { name: "Respond", exact: true }).isVisible(), "the invitation's row has no Respond")
    },
  },
  {
    // An invitation to answer, as Sean sees it: the block (ACCEPT, MAYBE, DECLINE) and the invitation's rows.
    name: "mail-invite-request",
    sean: { kind: "undrawn", area: "mail", screen: "invitation-request" },
    run: (app) => conversation(app, /Invitation: Design crit/),
    assert: async ({ page }) => {
      const block = needsYou(page)
      ensure(/^Invitation \/\/ [A-Za-z]{3} \d\d\.\d\d/i.test((await block.locator('[data-slot="needs-you-title"]').innerText()).trim()), "the block's title is not INVITATION // DAY MM.DD")
      ensure(/^Design crit, \d\d:\d\d – \d\d:\d\d, Studio, room 2$/.test((await block.locator('[data-slot="needs-you-body"]').innerText()).trim()), "the block's body is not {title}, {time}, {place}")
      for (const name of ["Accept", "Maybe", "Decline"]) ensure(await block.getByRole("button", { name, exact: true }).isVisible(), `the block has no ${name}`)
      for (const label of ["When", "Where", "Organizer", "Your calendar", "Calendar"]) ensure(await fieldRow(page, label).isVisible(), `the invitation has no ${label} row`)
      ensure(/3 invited, 1 going/.test(await fieldRow(page, "Organizer").innerText()), "ORGANIZER does not count who is invited and going")
      ensure(await fieldRow(page, "When").getByRole("button", { name: "Propose new time" }).isVisible(), "WHEN has no Propose new time")
    },
  },
  {
    // Each answer raises its toast: ACCEPT from the block (and the calendar it went into), then MAYBE and DECLINE from YOUR ANSWER's CHANGE.
    name: "mail-invite-answered",
    run: async (app) => {
      const { page } = app
      await conversation(app, /Invitation: Design crit/)
      await press(app, needsYou(page).getByRole("button", { name: "Accept", exact: true }))
      await toastSaying(page, "Accepted Design crit · added to Work").waitFor()
      ensure(!(await needsYou(page).count()), "the block stays once the invitation is answered")
      await toastsGone(app)
      for (const [answer, words] of [["Maybe", "Replied maybe to Design crit"], ["Not going", "Declined Design crit"]]) {
        await press(app, fieldRow(page, "Your answer").getByRole("button", { name: "Change" }))
        await press(app, page.getByRole(app.phone ? "dialog" : "menu", { name: "Your answer" }).getByRole(app.phone ? "radio" : "menuitemradio", { name: answer, exact: true }))
        await toastSaying(page, words).waitFor()
        await toastsGone(app)
      }
      ensure(/Not going/.test(await fieldRow(page, "Your answer").innerText()), "YOUR ANSWER does not say Not going")
    },
  },
  {
    // A guest proposes another time for your event (the `?counter` mail): NOW struck through, PROPOSED, the note, two answers.
    name: "mail-invite-counter",
    path: "/?counter",
    sean: { kind: "undrawn", area: "mail", screen: "invitation-counter" },
    run: (app) => conversation(app, /New time proposed: Studio sync/),
    assert: async ({ page }) => {
      ensure(await fieldRow(page, "Now").locator("s").isVisible(), "NOW is not struck through")
      ensure(await fieldRow(page, "Proposed").isVisible(), "no PROPOSED row")
      for (const name of ["Accept new time", "Keep original"]) ensure(await reader(page).getByRole("button", { name, exact: true }).isVisible(), `no ${name}`)
    },
  },
  {
    // ACCEPT NEW TIME moves the event and says so; the answered caption takes the buttons' place.
    name: "mail-invite-counter-answered",
    path: "/?counter",
    run: async (app) => {
      const { page } = app
      await conversation(app, /New time proposed: Studio sync/)
      await press(app, reader(page).getByRole("button", { name: "Accept new time", exact: true }))
      await toastSaying(page, "Moved Studio sync and told everyone").waitFor()
      await reader(page).getByText("You moved the event to this time").waitFor()
      await toastsGone(app)
    },
  },
  {
    // The organizer canceled: REMOVE FROM CALENDAR, which removes it and says so.
    name: "mail-invite-cancel",
    path: "/?counter",
    scenario: "invite-states",
    run: async (app) => {
      const { page } = app
      await conversation(app, /Canceled: Intro call with Dana Wells/)
      ensure(await reader(page).getByText("Dana Wells canceled this event.").isVisible(), "the cancellation does not say who canceled")
      await press(app, reader(page).getByRole("button", { name: "Remove from calendar", exact: true }))
      await toastSaying(page, "Removed Intro call with Dana Wells from your calendar").waitFor()
      await reader(page).getByRole("button", { name: "Remove from calendar", exact: true }).waitFor({ state: "detached" })
      await toastsGone(app)
    },
  },
  {
    // A guest answered your invitation, with a note: UPDATE YOUR EVENT.
    name: "mail-invite-reply",
    path: "/?counter",
    scenario: "invite-states",
    run: async (app) => {
      const { page } = app
      await conversation(app, /Accepted: Studio sync/)
      ensure(await reader(page).getByText("Ana Duarte accepted your invitation.").isVisible(), "the reply does not say who answered how")
      ensure(await reader(page).locator("blockquote").filter({ hasText: "glaze samples" }).isVisible(), "the guest's note is not quoted")
      await press(app, reader(page).getByRole("button", { name: "Update your event", exact: true }))
      await toastSaying(page, "Updated Studio sync").waitFor()
      await toastsGone(app)
    },
  },
  {
    // The organizer kept the original time: one line.
    name: "mail-invite-kept",
    path: "/?counter",
    scenario: "invite-states",
    run: (app) => conversation(app, /Original time kept: Design review/),
    assert: async ({ page }) => ensure(await reader(page).getByText("Priya Raman kept the original time.").isVisible(), "no line saying the time was kept"),
  },
  {
    // An older copy of an invitation: one caption, no block.
    name: "mail-invite-outdated",
    path: "/?counter",
    scenario: "invite-states",
    run: (app) => conversation(app, /Updated invitation: Design review/),
    assert: async ({ page }) => {
      ensure(await reader(page).getByText("Your calendar has a newer version of this event.").isVisible(), "no caption for an outdated invitation")
      ensure(!(await needsYou(page).count()), "an outdated invitation shows a needs-you block")
    },
  },
  {
    // Propose a new time (brief M5): the form layer with NEW DATE, STARTS, ENDS, the note, and YOUR CALENDAR for the new time.
    // An end before the start says so; the picture is the form with a good time.
    name: "mail-propose-time",
    sean: { kind: "undrawn", area: "mail", screen: "propose-time" },
    run: async (app) => {
      const { page } = app
      await conversation(app, /Invitation: Design crit/)
      await press(app, fieldRow(page, "When").getByRole("button", { name: "Propose new time" }))
      const form = page.getByRole("dialog", { name: /Propose a new time/ })
      await form.waitFor()
      await form.getByLabel("Ends", { exact: true }).fill("09:00")
      await form.getByText("The new time ends before it starts.").waitFor()
      await form.getByLabel("Starts", { exact: true }).fill("10:00")
      await form.getByLabel("Ends", { exact: true }).fill("10:45")
      ensure(!(await form.getByText("The new time ends before it starts.").count()), "the error stays once the time is right")
      ensure(await form.getByRole("group", { name: "Your calendar" }).isVisible(), "the form has no YOUR CALENDAR line for the new time")
      // The picture shows the form at rest: no field in the middle of an edit.
      await page.evaluate(() => document.activeElement?.blur())
      await page.mouse.move(0, 0)
    },
  },
  {
    // PROPOSE sends it: the toast names the organizer and the time, and WHEN says what you proposed.
    name: "mail-propose-time-sent",
    run: async (app) => {
      const { page } = app
      await conversation(app, /Invitation: Design crit/)
      await press(app, fieldRow(page, "When").getByRole("button", { name: "Propose new time" }))
      const form = page.getByRole("dialog", { name: /Propose a new time/ })
      await form.getByLabel("Starts", { exact: true }).fill("10:00")
      await form.getByLabel("Ends", { exact: true }).fill("10:45")
      await press(app, app.phone ? form.getByRole("button", { name: "Propose", exact: true }) : form.getByRole("button", { name: "Propose", exact: true }))
      await toastSaying(page, /^Asked Priya Raman about [A-Za-z]{3} \d\d\.\d\d 10:00$/).waitFor()
      ensure(/You proposed .* 10:00 – 10:45/.test(await fieldRow(page, "When").innerText()), "WHEN does not say what you proposed")
      ensure(await fieldRow(page, "When").getByRole("button", { name: "Propose another" }).isVisible(), "WHEN has no Propose another")
      await toastsGone(app)
    },
  },
  {
    // A signature with details you don't have (brief M5): a compact info banner with REVIEW (the contact form, filled in) and dismiss.
    name: "mail-signature-suggestion",
    run: async (app) => {
      const { page } = app
      await conversation(app, /Photos from the trip/)
      const banner = reader(page).getByRole("status", { name: "Contact details in the signature" })
      await banner.waitFor()
      ensure(/signature has a phone number|isn’t in your contacts/.test(await banner.innerText()), "the banner does not say what the signature has")
      ensure(await banner.getByRole("button", { name: "Review", exact: true }).isVisible(), "the banner has no Review")
      ensure(await banner.getByRole("button", { name: "Not now", exact: true }).isVisible(), "the banner cannot be dismissed")
    },
  },
  {
    // A Vale share link in a message: a Field Row SHARED WITH YOU with its title and OPEN IN NOTES.
    name: "mail-shared-link",
    path: "/?shared=https://notes.studio.example/share%23eyJ2IjoxLCJyZWxheSI6IndzczovL25vdGVzLnN0dWRpby5leGFtcGxlIiwiaWQiOiJkZXNpZ25yZXZpZXdhZ2VuZGEwMSIsIm1vZGUiOiJ2aWV3IiwidG9rZW4iOiJkZW1vLXNoYXJlLXRva2VuIiwidGl0bGUiOiJEZXNpZ24gcmV2aWV3IGFnZW5kYSIsImZyb20iOiJTYW0gT2thZm9yIn0",
    run: (app) => conversation(app, /Design review agenda/),
    assert: async ({ page }) => {
      const row = reader(page).getByRole("group", { name: "Shared with you", exact: true }).first()
      ensure(/Design review agenda/.test(await row.innerText()), "the shared link's row does not show its title")
      ensure(await row.getByRole("button", { name: "Open in Notes" }).isVisible(), "the shared note's row has no Open in Notes")
    },
  },
  {
    // Share with teammates with no notes relay (brief M9): the form says sharing goes through it, with OPEN SYNC.
    name: "mail-share",
    run: async (app) => {
      await conversation(app, /Token audit/)
      await moreItem(app, "Share with teammates…")
      const form = shareForm(app.page)
      ensure(/Sharing goes through your notes relay, the same one that syncs your notes\./.test(await form.innerText()), "the form does not say sharing needs a notes relay")
      ensure(await form.getByRole("button", { name: "Open sync", exact: true }).isVisible(), "the form has no Open sync")
    },
  },
  {
    // With a relay and not shared yet: what a link gives, the two captions, and CREATE LINK as the one primary.
    name: "mail-share-create",
    scenario: "team-shared",
    run: async (app) => {
      await conversation(app, /Cabin weekend/)
      await moreItem(app, "Share with teammates…")
      const form = shareForm(app.page)
      const words = await form.innerText()
      ensure(/People with the link read it, comment, and help write the reply\. Only you send it\./.test(words), "the form does not say what the link gives")
      ensure(/Teammates get the text, not attachments or images\./.test(words) && /Your relay can read it, as it can read your notes\./.test(words), "the form is missing a caption")
      ensure(await form.getByRole("button", { name: "Create link", exact: true }).isVisible(), "the form has no Create link")
    },
  },
  {
    // Shared (brief M9): LINK cut in the middle with COPY LINK, EMAIL IT, and STOP SHARING, which asks first with focus on Cancel.
    name: "mail-share-link",
    scenario: "team-shared",
    sean: { kind: "undrawn", area: "mail", screen: "share-form" },
    run: async (app) => {
      const { page } = app
      await conversation(app, /Token audit/)
      await moreItem(app, "Shared with teammates…")
      const form = shareForm(page)
      ensure(await form.getByRole("group", { name: "Link", exact: true }).isVisible(), "the shared form has no LINK row")
      ensure(await form.getByRole("button", { name: "Email it", exact: true }).isVisible(), "the shared form has no Email it")
      await press(app, form.getByRole("button", { name: "Stop sharing", exact: true }))
      const ask = page.getByRole("alertdialog", { name: "Stop sharing?" }).or(page.getByRole("dialog", { name: "Stop sharing?" }))
      ensure(await ask.isVisible(), "Stop sharing did not ask")
      ensure(/The link stops working\./.test(await ask.innerText()), "the question does not say the link stops working")
      ensure((await page.evaluate(() => document.activeElement?.textContent?.trim())) === "Cancel", "the question's focus is not on Cancel")
      await press(app, ask.getByRole("button", { name: "Cancel", exact: true }))
      await page.evaluate(() => document.activeElement?.blur())
    },
  },
  {
    // The reply field (brief M4): a reply sent in place goes through the outbox like any other, so the
    // sending strip (a phone) or the status line (wider) shows it with UNDO, and the field empties.
    name: "mail-reply",
    sizes: ["desktop", "phone", "medium"],
    run: async (app) => {
      const { page } = app
      await conversation(app, /Token audit/)
      await replyField(page).fill("Thursday at 10 works. I'll bring the sheet.")
      await press(app, page.locator('[data-slot="composer-send"]:visible'))
      await page.getByRole("button", { name: "Undo", exact: true }).first().waitFor()
      await page.mouse.move(0, 0)
    },
    assert: async (app) => {
      const { page } = app
      ensure((await replyField(page).inputValue()) === "", "the reply field kept the text after Send")
      if (app.phone) ensure(/SENDING/.test(await strip(page).first().innerText()), "the sending strip did not appear")
      else ensure(/SENDING/i.test(await page.locator('[data-slot="app-frame-status-line"]').innerText()), "the status line does not say it is sending")
    },
  },
  {
    // Expand (the reply field's second leading action) opens the full message with the words carried over.
    name: "mail-reply-expand",
    run: async (app) => {
      const { page } = app
      await conversation(app, /Token audit/)
      await replyField(page).fill("Thursday at 10 works.")
      await press(app, page.getByRole("button", { name: "Expand", exact: true }))
      const form = page.getByRole("dialog", { name: /Re: Token audit/ })
      ensure(/Thursday at 10 works\./.test(await form.getByRole("textbox", { name: "Message" }).innerText()), "Expand did not carry the words into the message")
      ensure(/priya@studio\.example|Priya Raman/.test(await form.innerText()), "Expand did not address the reply")
      ensure((await replyField(page).count()) === 0 || (await replyField(page).inputValue()) === "", "the words stayed in the reply field too")
    },
  },
  {
    // More (brief M4) on a desktop's toolbar and a phone's top bar; a phone's sheet starts with Star, Snooze and Mark unread.
    name: "mail-more-menu",
    sean: { kind: "undrawn", area: "mail", screen: "more-menu" },
    run: async (app) => {
      await conversation(app, /Token audit/)
      await more(app)
      await app.page.mouse.move(0, 0)
    },
    assert: async (app) => {
      const menu = app.page.getByRole(app.phone ? "dialog" : "menu", { name: "More" })
      const rows = ["Reply in full", "Forward", "Remind me if no reply…", "Share with teammates…", "About Priya Raman", "Quick note about this", "Screen out sender", "Block sender", "New split for studio.example"]
      // The token audit is starred, so a phone's sheet offers Unstar.
      for (const name of app.phone ? ["Unstar", "Snooze…", "Mark unread", ...rows] : rows)
        ensure(await row(app, menu, name).count(), `More has no ${name}`)
      ensure(!(await row(app, menu, "Summarize").count()), "Summarize is offered with AI not set up")
      ensure(!(await row(app, menu, "Unsubscribe…").count()), "Unsubscribe… is offered where the sender offers none")
      ensure(await menu.getByRole(app.phone ? "radio" : "menuitemradio", { name: "Always in People" }).count(), "More has no category choice for the sender")
    },
  },
  {
    // Remind me if no reply, on a thread with your mail in it (ADR-0095; brief M8): the snooze times, then any date and time.
    name: "mail-remind-no-reply",
    sean: { kind: "undrawn", area: "mail", screen: "remind" },
    run: async (app) => {
      await conversation(app, /Token audit/)
      await moreItem(app, "Remind me if no reply…")
      await app.page.mouse.move(0, 0)
    },
    assert: async (app) => {
      const list = app.page.getByRole(app.phone ? "dialog" : "menu", { name: "Remind me if no reply" })
      if (!app.phone) ensure(/^REMIND ME IF NO REPLY$/i.test((await list.locator('[data-slot="dropdown-menu-label"]').first().innerText()).trim()), "the menu does not start with its label")
      ensure(/Fri 08:00/.test(await row(app, list, /^Tomorrow/).innerText()), "Tomorrow does not give its time")
      ensure(await row(app, list, "Pick date and time…").count(), "the reminder has no Pick date and time…")
    },
  },
  {
    // Each of More's rows does its job (brief M4).
    name: "mail-more-actions",
    scenario: "ai-on",
    run: async (app) => {
      const { page } = app
      const toast = (text) => page.locator("[data-sonner-toast]").filter({ hasText: text }).first()
      const dialog = (name) => page.getByRole("dialog", { name })
      const closeDialog = async () => {
        await page.keyboard.press("Escape")
        await app.settle()
      }
      await conversation(app, /Token audit/)
      // Reply in full and Forward open the message form, addressed and quoted.
      await moreItem(app, "Reply in full")
      ensure(await dialog(/Re: Token audit/).isVisible(), "Reply in full did not open the reply")
      await closeForm(app)
      await moreItem(app, "Forward")
      ensure(await dialog(/Fwd: Re: Token audit/).isVisible(), "Forward did not open the forward")
      await closeForm(app)
      // Remind me if no reply…: its own times; picking one sets the reminder, and the menu then offers to cancel it.
      await moreItem(app, "Remind me if no reply…")
      await press(app, row(app, page.getByRole(app.phone ? "dialog" : "menu", { name: "Remind me if no reply" }), /^Tomorrow/))
      await toast("Comes back tomorrow if nobody replies").waitFor()
      ensure(/REMINDER .* IF NO REPLY/.test(await reader(page).innerText()), "the title's line does not say a reminder is set")
      await moreItem(app, "Cancel reminder")
      await toast("Cancelled the reminder").waitFor()
      // Summarize asks the model.
      await moreItem(app, "Summarize")
      await reader(page).locator('[data-slot="summary-block"]').first().waitFor()
      // Share, About, Quick note: each opens its layer.
      await moreItem(app, "Share with teammates…")
      ensure(await page.getByRole("dialog").filter({ hasText: /teammates/i }).first().isVisible(), "Share with teammates… opened nothing")
      await closeDialog()
      await moreItem(app, "About Priya Raman")
      ensure(await dialog("About Priya Raman").isVisible(), "About did not open the sender's panel")
      await closeDialog()
      await moreItem(app, "Quick note about this")
      ensure(await page.getByRole("dialog").filter({ hasText: /Token audit/ }).first().isVisible(), "Quick note about this opened nothing")
      await closeDialog()
      // The sender: a category, a split, screening out.
      await press(app, (await more(app)).getByRole(app.phone ? "radio" : "menuitemradio", { name: "Always in Updates" }))
      await toast("Mail from Priya Raman goes to Updates").waitFor()
      await press(app, toast("Mail from Priya Raman goes to Updates").getByRole("button", { name: "Undo", exact: true }))
      await moreItem(app, "New split for studio.example")
      const split = dialog("New split")
      ensure(await split.isVisible(), "New split did not open the split form")
      ensure((await split.getByRole("textbox", { name: "Name" }).inputValue()) === "Studio", "the split form is not filled in")
      await closeDialog()
      // Screening out and blocking archive the sender's mail, and Undo leaves it archived: each on a sender of its own.
      if (app.phone) await press(app, button(page, "Back"))
      await conversation(app, /Photos from the trip/)
      await moreItem(app, "Screen out sender")
      await toast("Screened out Ana Duarte").waitFor()
      ensure(!(await reader(page).getByRole("heading", { name: "Photos from the trip" }).count()), "Screen out sender left the conversation open")
      await press(app, toast("Screened out Ana Duarte").getByRole("button", { name: "Undo", exact: true }))
      await toastsGone(app)
      // Block asks first; BLOCK blocks, closes the conversation, and its toast can take it back.
      await conversation(app, /Cabin weekend/)
      await moreItem(app, "Block sender")
      const question = dialog("Block Marcus Lee?")
      await press(app, question.getByRole("button", { name: "Block", exact: true }))
      await toast("Blocked Marcus Lee").waitFor()
      ensure(!(await reader(page).getByRole("heading", { name: /Cabin weekend/ }).count()), "Block sender left the conversation open")
      await press(app, toast("Blocked Marcus Lee").getByRole("button", { name: "Undo", exact: true }))
      await toastsGone(app)
      // Unsubscribe… where the sender offers it.
      await conversation(app, /Design Systems Weekly/)
      await moreItem(app, "Unsubscribe…")
      ensure(await dialog(/^Unsubscribe from /).isVisible(), "Unsubscribe… did not ask")
      await closeDialog()
    },
  },
  {
    // Block sender asks (brief X6): "Block {name}?", what happens, BLOCK; focus starts on Cancel.
    name: "mail-block-sender",
    run: async (app) => {
      await conversation(app, /Token audit/)
      await moreItem(app, "Block sender")
      await app.page.mouse.move(0, 0)
    },
    assert: async ({ page }) => {
      const question = page.getByRole("dialog", { name: "Block Priya Raman?" })
      ensure(/Their mail goes straight to the archive\./.test(await question.innerText()), "the question does not say what blocking does")
      ensure(await question.getByRole("button", { name: "Block", exact: true }).isVisible(), "the question's yes is not Block")
      ensure((await page.evaluate(() => document.activeElement?.textContent?.trim())) === "Cancel", "focus does not start on Cancel")
    },
  },
  {
    // The Screener's notice in the conversation's notice slot (brief M3): NEW SENDER, the question, LET IN and
    // SCREEN OUT. LET IN keeps the conversation open; SCREEN OUT closes it. Both toast with UNDO.
    name: "mail-screener-notice",
    sizes: ["desktop", "phone", "medium"],
    path: "/?screener",
    scenario: "screener-waiting",
    run: async (app) => {
      const { page } = app
      const toast = (text) => page.locator("[data-sonner-toast]").filter({ hasText: text }).first()
      const open = async () => {
        await lane(app, "Screener")
        await press(app, page.getByRole("list", { name: "Screener", exact: true }).getByRole("button", { name: /Quick question about your studio/ }).first())
      }
      const notice = () => reader(page).getByRole("region", { name: "New sender" })
      await open()
      ensure(/Let Riley Growth.s mail into your inbox\?/.test(await notice().innerText()), "the notice does not ask the question")
      await press(app, notice().getByRole("button", { name: "Let in", exact: true }))
      await toast("Riley Growth can reach your inbox").waitFor()
      ensure(await reader(page).getByRole("heading", { name: "Quick question about your studio" }).isVisible(), "Let in closed the conversation")
      await press(app, toast("Riley Growth can reach your inbox").getByRole("button", { name: "Undo", exact: true }))
      await toastsGone(app)
      // A pushed conversation (a phone, medium width) goes back to the list before the lane is picked again.
      if (app.phone || app.size === "medium") await press(app, button(page, "Back").first())
      await open()
      await press(app, notice().getByRole("button", { name: "Screen out", exact: true }))
      await toast("Screened out Riley Growth").waitFor()
      ensure(!(await reader(page).getByRole("region", { name: "New sender" }).count()), "Screen out left the conversation open")
      await press(app, toast("Screened out Riley Growth").getByRole("button", { name: "Undo", exact: true }))
      await toastsGone(app)
      // The picture: the notice, as the conversation opens.
      await page.reload()
      await app.settle()
      await open()
      await page.mouse.move(0, 0)
    },
  },
  {
    // Desktop / 02 and Mobile / 03 (ADR-0094; brief M6): the 720 dialog over the scrim, NEW MESSAGE // PERSONAL, the
    // subject as its title, FROM with CHANGE (two accounts), TO, SUBJECT, the message of six lines at least, and the
    // footer: the tools at the left, SEND with its Send later half at the right. No Cancel and no Save draft (W2).
    // A phone: close, the title and Send in the top row; FROM stacked; the body with no box; Attach and More at the foot.
    name: "mail-compose",
    sizes: ["desktop", "phone", "medium"],
    sean: { kind: "drawn", area: "mail", screen: "compose" },
    run: async (app) => {
      const form = await compose(app)
      await writeMessage(app, form)
      await app.page.mouse.move(0, 0)
    },
    assert: async (app) => {
      const { page } = app
      const form = page.getByRole("dialog", { name: "New message" })
      if (app.phone) {
        // Mobile / 03: the top row names the form; the account is in FROM, the subject in its field.
        const top = (await form.locator('[data-slot="top-bar-title"]').first().innerText()).trim()
        ensure(top === "New message", `the phone's top row reads “${top}”, not New message`)
      } else {
        const overline = (await form.locator('[data-slot="dialog-overline"]').first().textContent()).trim()
        ensure(/^New message \/\/ Personal$/i.test(overline), `the overline reads “${overline}”, not New message // Personal`)
      }
      ensure(await form.getByRole("group", { name: "From", exact: true }).isVisible(), "the message has no FROM row")
      ensure(await form.getByRole("group", { name: "From", exact: true }).getByRole("button", { name: /^Change/ }).isVisible(), "FROM has no Change with two accounts")
      ensure(!(await form.getByRole("button", { name: "Cancel", exact: true }).count()), "the message has a Cancel besides its close button")
      ensure(!(await form.getByRole("button", { name: /save draft/i }).count()), "the message offers Save draft, which has no store (W2)")
      ensure(!(await form.getByRole("textbox", { name: /^Bcc/ }).count()), "the message has a Bcc field (W2)")
      const body = await form.locator(".ProseMirror").boundingBox()
      ensure(body.height >= 144, `the message is ${Math.round(body.height)} tall, not six lines (144) at least`)
      ensure(/Demo\. Nothing leaves\./.test(await form.innerText()), "the demo does not say that nothing leaves")
      if (app.phone) {
        ensure((await form.locator('[data-slot="rich-editor"][data-bare]').count()) === 1, "the phone's body sits in a box")
        ensure(await form.getByRole("button", { name: "Attach files", exact: true }).isVisible(), "the phone has no Attach at its foot")
        ensure(await form.getByRole("button", { name: "More", exact: true }).isVisible(), "the phone has no More at its foot")
        ensure(/Shift\+Enter/.test(await sendButton(form).getAttribute("aria-keyshortcuts")), "Send has no long press for Send later")
      } else {
        const tools = form.getByRole("toolbar", { name: "Message tools" })
        const names = await tools.locator('[data-slot="toolbar-button"], [data-slot="toolbar-toggle"]').evaluateAll((list) => list.map((el) => el.getAttribute("aria-label")))
        ensure(JSON.stringify(names) === JSON.stringify(["Attach files", "Formatting", "Templates", "Remind me if no reply", "More"]), `the tools read ${names.join(", ")}`)
        ensure((await form.locator('[data-slot="split-button"]').count()) === 1, "Send is not the split button")
        ensure((await form.locator('[data-slot="format-bar"]').count()) === 0, "the format bar shows before Formatting is on")
      }
    },
  },
  {
    // Send later from the message: the chevron's menu on a desktop; More's Send later… (a sheet) on a phone.
    name: "mail-send-later",
    sean: { kind: "undrawn", area: "mail", screen: "send-later" },
    run: async (app) => {
      const form = await compose(app)
      await sendLater(app, form)
      await app.page.mouse.move(0, 0)
    },
    // The mono label, the presets each with a time in mono, then any date and time (ADR-0095; brief M7).
    assert: async (app) => {
      const later = app.phone ? app.page.getByRole("dialog", { name: "Send later" }) : app.page.getByRole("menu")
      if (!app.phone) ensure(/^SEND LATER$/i.test((await later.locator('[data-slot="dropdown-menu-label"]').first().innerText()).trim()), "the menu does not start with SEND LATER")
      for (const name of [/^Tomorrow morning/, /^Tomorrow afternoon/, /^Monday morning/]) ensure(await toolRow(app, later, name).count(), `Send later has no ${name}`)
      ensure(/Fri 08:00/.test(await toolRow(app, later, /^Tomorrow morning/).innerText()), "Tomorrow morning does not give its time as rows write it")
      ensure(await toolRow(app, later, "Pick date and time…").count(), "Send later has no Pick date and time…")
    },
  },
  {
    name: "mail-send-later-time",
    run: async (app) => {
      const form = await compose(app)
      const later = await sendLater(app, form)
      await press(app, toolRow(app, later, "Pick date and time…"))
      await app.page.mouse.move(0, 0)
    },
    assert: async ({ page }) => {
      const picker = page.getByRole("dialog", { name: "Send later" })
      ensure(await picker.getByText("If the desktop app is closed then, it sends when it next opens. A gateway sends on time.").isVisible(), "the picker does not say when it sends")
      ensure(await picker.getByRole("button", { name: "Schedule", exact: true }).isVisible(), "the picker has no Schedule")
    },
  },
  {
    // Send now (ADR-0095; brief M7, X4): the sending strip or status line with UNDO, which takes it back into the
    // message; sent again, the window runs out and the toast says "Sent {subject}". Scheduled: a toast with UNDO.
    name: "mail-send-undo",
    run: async (app) => {
      const { page } = app
      const undo = () => (app.phone ? page.locator('[data-slot="accessory"]') : page.locator('[data-slot="app-frame-status-line"]')).getByRole("button", { name: "Undo", exact: true })
      await send(app, "Saturday ferry")
      ensure(await undo().isVisible(), "the send shows no UNDO")
      await press(app, undo())
      const again = page.getByRole("dialog", { name: /Saturday ferry/ })
      ensure(await again.isVisible(), "UNDO did not reopen the message")
      ensure((await again.getByRole("textbox", { name: "Subject" }).inputValue()) === "Saturday ferry", "the message came back without its subject")
      // Sent from where it came back; ten seconds on, it has gone.
      await press(app, sendButton(again))
      await again.waitFor({ state: "detached" })
      const now = await page.evaluate(() => Date.now())
      await page.clock.setFixedTime(new Date(now + 12_000))
      await toastSaying(page, "Sent Saturday ferry").waitFor()
      ensure(!(await undo().count()), "UNDO stayed once the message had gone")
      await toastGone(app)
      // Send later: picked from the menu, then SCHEDULE; the toast names the message and its time, with UNDO.
      const form = await compose(app)
      await writeMessage(app, form, { subject: "Pier parking" })
      await press(app, toolRow(app, await sendLater(app, form), /^Tomorrow morning/))
      await press(app, sendButton(form))
      await form.waitFor({ state: "detached" })
      const scheduled = toastSaying(page, "Scheduled Pier parking for Fri 08:00")
      await scheduled.waitFor()
      ensure(await scheduled.getByRole("button", { name: "Undo", exact: true }).isVisible(), "the scheduled toast has no UNDO")
      await page.mouse.move(0, 0)
    },
  },
  {
    // "Discard changes?" (ADR-0087; brief X6): a message asks whenever it holds a recipient, a subject,
    // text or a file, one reopened by Undo send too; a reply only once it differs from what Reply filled
    // in (Vale 22). KEEP EDITING is the no and takes focus.
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
      // The close button asks too (the message has no Cancel: brief M6).
      await press(app, message.getByRole("button", { name: "Close", exact: true }))
      ensure(await question.isVisible(), "closing a message with text by its button did not ask")
      // DISCARD closes it.
      await press(app, discard)
      ensure(!(await message.count()) && !(await question.count()), "Discard did not close the message")
      // An untouched reply closes without asking: Reply filled in its recipient, subject and quote (Vale 22).
      await conversation(app, /Token audit/)
      const reply = page.getByRole("dialog", { name: /Re: Token audit/ })
      await moreItem(app, "Reply in full")
      await reply.waitFor()
      await esc()
      ensure(!(await question.count()), "an untouched reply asked before closing")
      ensure(!(await reply.count()), "Esc did not close an untouched reply")
      // Once something is typed, it asks.
      await moreItem(app, "Reply in full")
      await reply.getByRole("textbox", { name: "Message" }).click()
      await page.keyboard.type("Thanks, ")
      await esc()
      ensure(await question.isVisible(), "a reply with typed text closed without asking")
      await press(app, discard)
      ensure(!(await reply.count()), "Discard did not close the reply")
      if (app.phone) await goBack(app)
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
      // The bar shows once Formatting is on (brief M6): the toolbar's toggle on a desktop, More's row on a phone.
      ensure(!(await form.locator('[data-slot="format-bar"]').count()), "the format bar shows before Formatting is on")
      await formatting(app, form)
      if (!app.phone) ensure((await form.getByRole("button", { name: "Formatting", exact: true }).getAttribute("aria-pressed")) === "true", "Formatting does not say it is on")
      await text.click()
      await page.keyboard.type("The 08:15 crossing is booked.")
      const bar = await formatBar(app, form, ["Bold", "Italic", "Link", "Bulleted list", "Numbered list", "Quote", "Code"])
      // On the message's box on a desktop; at the foot on a phone, where it takes the foot's place above the keyboard.
      const mode = app.phone ? "keyboard" : "field"
      ensure((await form.locator('[data-slot="format-bar"]').getAttribute("data-mode")) === mode, `the message's format bar is not in its ${mode} place`)
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
      await formLayer(app, { open: compose, write, primary: "Send", width: 720, cancel: false })
      // Sent: take it back, so the picture is the form as it was written.
      await page.evaluate(() => document.activeElement?.blur())
      await page.keyboard.press("Control+KeyZ")
      await app.settle()
      ensure((await message.getByRole("textbox", { name: "Subject" }).inputValue()) === "Saturday ferry", "Ctrl+Enter did not send the message, or Undo did not bring it back")
      if (!app.phone) ensure(/Saturday ferry/.test(await message.locator('[data-slot="dialog-title"]').innerText()), "the header does not show the subject as typed")
      // Send later is still there: beside Send on a desktop; held on Send, or from More, on a phone.
      if (app.phone) ensure(/Shift\+Enter/.test(await message.getByRole("button", { name: "Send", exact: true }).getAttribute("aria-keyshortcuts")), "Send has no long press for Send later")
      else ensure(await message.getByRole("button", { name: "Send later", exact: true }).isVisible(), "Send later is not reachable from the form")
    },
  },
  {
    // The composer sends what it holds (ADR-0094; brief M6): people as chips, Cc, a file dropped on it, a template.
    // UNDO brings it all back. A file's own button takes it off.
    name: "mail-compose-cc",
    run: async (app) => {
      const { page } = app
      const form = await compose(app)
      await writeMessage(app, form)
      ensure(!(await form.getByRole("combobox", { name: "Cc" }).count()), "Cc shows before it is asked for")
      await press(app, form.getByRole("button", { name: "Cc", exact: true }))
      const cc = form.getByRole("combobox", { name: "Cc" })
      ensure(await cc.isVisible(), "the Cc button did not add the Cc field")
      ensure(!(await form.getByRole("button", { name: "Cc", exact: true }).count()), "the Cc button stayed once Cc shows")
      await cc.pressSequentially("Ana")
      await press(app, page.getByRole("option", { name: /Ana Duarte/ }))
      // Two files dropped on the message; the second taken off by its own button.
      await dropFile(app, form, "Ferry timetable.zip", 48 * 1024)
      await dropFile(app, form, "Old timetable.zip", 12 * 1024)
      const files = form.getByRole("list", { name: "Attachments" })
      ensure((await files.locator('[data-slot="file-chip"]').count()) === 2, "the dropped files are not listed")
      await press(app, files.getByRole("button", { name: "Remove Old timetable.zip", exact: true }))
      ensure((await files.locator('[data-slot="file-chip"]').count()) === 1, "Remove did not take the file off")
      // A template goes in where the writer is.
      await form.getByRole("textbox", { name: "Message" }).press("Control+End")
      const templates = await messageTool(app, form, "Templates")
      await press(app, toolRow(app, templates, "Thanks, will reply soon"))
      ensure(/Thanks for this/.test(await form.getByRole("textbox", { name: "Message" }).innerText()), "the template did not go into the message")
      // Remind me if no reply: a delay after it goes out, then a chip with its own remove. A read receipt from More.
      await press(app, toolRow(app, await messageTool(app, form, "Remind me if no reply"), "In 3 days", "radio"))
      ensure(await form.getByText("Remind in 3 days", { exact: true }).isVisible(), "the reminder shows no chip")
      if (app.phone) await messageTool(app, form, "Ask for a read receipt")
      else {
        const more = await messageTool(app, form, "More")
        await press(app, toolRow(app, more, "Ask for a read receipt", "check"))
        await page.keyboard.press("Escape")
        await app.settle()
      }
      // Ctrl+Enter sends it, then UNDO brings it back as it was.
      await form.getByRole("textbox", { name: "Subject" }).focus()
      await page.keyboard.press("Control+Enter")
      await form.waitFor({ state: "detached" })
      await app.settle()
      await page.evaluate(() => document.activeElement?.blur())
      await page.keyboard.press("Control+KeyZ")
      await app.settle()
      const again = page.getByRole("dialog", { name: "New message" })
      const chipsOf = async (name) => (await again.locator('[data-slot="recipient-field"]').filter({ has: page.getByRole("combobox", { name }) }).locator('[data-slot="chip"]').allInnerTexts()).map((t) => t.trim())
      ensure((await chipsOf("To")).some((t) => /Marcus Lee/.test(t)), "Undo lost the To chip")
      ensure((await chipsOf("Cc")).some((t) => /Ana Duarte/.test(t)), "Undo lost Cc")
      ensure(/Ferry timetable\.zip/.test(await again.getByRole("list", { name: "Attachments" }).innerText()), "Undo lost the file")
      ensure(/Thanks for this/.test(await again.getByRole("textbox", { name: "Message" }).innerText()), "Undo lost the template's words")
      ensure(await again.getByText("Remind in 3 days", { exact: true }).isVisible(), "Undo lost the reminder")
      if (app.phone) {
        await press(app, again.getByRole("button", { name: "More", exact: true }))
        ensure((await page.getByRole("dialog", { name: "More" }).getByRole("checkbox", { name: "Ask for a read receipt" }).getAttribute("aria-checked")) === "true", "Undo lost the read receipt")
      } else {
        await press(app, again.getByRole("toolbar", { name: "Message tools" }).getByRole("button", { name: "More", exact: true }))
        ensure((await page.getByRole("menu", { name: "More" }).getByRole("menuitemcheckbox", { name: "Ask for a read receipt" }).getAttribute("aria-checked")) === "true", "Undo lost the read receipt")
      }
      await page.keyboard.press("Escape")
      await app.settle()
      // Focus returns to More: no ring in the picture.
      await page.evaluate(() => document.activeElement?.blur())
      await page.mouse.move(0, 0)
    },
  },
  {
    // A wrong address (brief M6, 4.0): a critical chip, the line under the field, and Send off with that line as its
    // reason. On a desktop Send stays in the tab order and says the reason with its name.
    name: "mail-compose-invalid",
    run: async (app) => {
      const { page } = app
      const form = await compose(app)
      await writeMessage(app, form)
      const to = form.getByRole("combobox", { name: "To" })
      await to.pressSequentially("the ferry people")
      await to.press("Enter")
      await app.settle()
      await page.mouse.move(0, 0)
    },
    assert: async (app) => {
      const { page } = app
      const form = page.getByRole("dialog", { name: "New message" })
      const reason = form.getByText("Fix or remove the address in red.")
      const send = sendButton(form)
      ensure(await reason.isVisible(), "the reason is not on screen")
      ensure(await send.isDisabled(), "Send is on with a wrong address")
      ensure((await send.getAttribute("aria-describedby"))?.split(" ").includes(await reason.getAttribute("id")), "Send does not point at its reason")
      if (!app.phone) ensure(await send.evaluate((el) => (el.focus(), el === document.activeElement)), "Send left the tab order while it is off")
      await page.evaluate(() => document.activeElement?.blur())
    },
  },
  {
    // Over 25 MB attached (brief M6): the critical line, and Send off with it as its reason. Files dragged over the
    // message draw the 2 px primary edge and "Drop to attach" first. The file is made by the scene.
    name: "mail-compose-big",
    run: async (app) => {
      const { page } = app
      const form = await compose(app)
      await writeMessage(app, form)
      await dropFile(app, form, "Ferry terminal photos.zip", 1024, true)
      const drop = page.locator('[data-slot="composer-drop"]')
      ensure(await drop.isVisible() && /Drop to attach/.test(await drop.innerText()), "files over the message do not say Drop to attach")
      await dropFile(app, form, "Ferry terminal photos.zip", 31 * 1024 * 1024)
      await form.getByText("31 MB attached. Most servers take 25 MB.").waitFor()
      ensure(!(await drop.count()), "Drop to attach stayed after the drop")
      await page.mouse.move(0, 0)
    },
    assert: async (app) => {
      const { page } = app
      const form = page.getByRole("dialog", { name: "New message" })
      const line = form.getByText("31 MB attached. Most servers take 25 MB.")
      const send = sendButton(form)
      ensure(await send.isDisabled(), "Send is on with 31 MB attached")
      ensure((await send.getAttribute("aria-describedby"))?.split(" ").includes(await line.getAttribute("id")), "Send does not point at the 25 MB line")
      if (!app.phone) ensure(await send.evaluate((el) => (el.focus(), el === document.activeElement)), "Send left the tab order while it is off")
      await page.evaluate(() => document.activeElement?.blur())
    },
  },
  {
    // No account (brief M6): the info notice "Add an account to send." with OPEN ACCOUNTS, and Send off with it as its
    // reason. OPEN ACCOUNTS leaves for the Accounts section.
    name: "mail-compose-no-account",
    // Past first run with Not now (ADR-0107): Mail itself, with no account.
    scenario: ["no-account", "first-run-skipped"],
    run: async (app) => {
      const { page } = app
      const form = await compose(app)
      const notice = form.getByRole("status").filter({ hasText: "Add an account to send." })
      ensure(await notice.isVisible(), "no notice says to add an account")
      const send = sendButton(form)
      ensure(await send.isDisabled(), "Send is on with no account")
      ensure((await send.getAttribute("aria-describedby"))?.split(" ").includes(await notice.getAttribute("id")), "Send does not point at the notice")
      if (!app.phone) ensure(await send.evaluate((el) => (el.focus(), el === document.activeElement)), "Send left the tab order while it is off")
      ensure(await notice.getByRole("button", { name: "Open accounts", exact: true }).isVisible(), "the notice has no Open accounts")
      await page.evaluate(() => document.activeElement?.blur())
      await page.mouse.move(0, 0)
    },
  },
  {
    // Closing asks (ADR-0087; brief X6) by the close button, the only way out: the message has no Cancel. A message
    // reopened by UNDO asks too.
    name: "mail-compose-discard",
    run: async (app) => {
      const { page } = app
      const question = discardQuestion(page)
      let form = await compose(app)
      await writeMessage(app, form)
      await press(app, form.getByRole("button", { name: "Close", exact: true }))
      ensure(await question.isVisible(), "closing a written message did not ask")
      await press(app, question.getByRole("button", { name: "Keep editing", exact: true }))
      ensure(await form.isVisible(), "Keep editing closed the message")
      await press(app, sendButton(form))
      await form.waitFor({ state: "detached" })
      await app.settle()
      await page.evaluate(() => document.activeElement?.blur())
      await page.keyboard.press("Control+KeyZ")
      await app.settle()
      form = page.getByRole("dialog", { name: "New message" })
      ensure((await form.getByRole("textbox", { name: "Subject" }).inputValue()) === "Saturday ferry", "Undo did not reopen the message")
      await press(app, form.getByRole("button", { name: "Close", exact: true }))
      ensure(await question.isVisible(), "a message reopened by Undo closed without asking")
      ensure(await question.getByRole("button", { name: "Keep editing", exact: true }).evaluate((el) => el === document.activeElement), "focus is not on Keep editing")
    },
  },
  {
    // The notices (brief M6), one at a time between the fields and the message: the server's error (critical), a
    // send time with SEND NOW INSTEAD, and the hour where the recipient lives with their morning (useLocalTimes).
    // The picture: the recipient's hour.
    name: "mail-compose-notices",
    scenario: "send-refused",
    sean: { kind: "undrawn", area: "mail", screen: "compose-notices" },
    run: async (app) => {
      const { page } = app
      const notices = (form) => form.locator('[data-slot="banner"]')
      const priya = { to: "Priya", who: /Priya Raman/, subject: "Proofs for the catalogue", words: "The proofs are in. Can you look before Friday?" }
      let form = await compose(app)
      await writeMessage(app, form, priya)
      await form.getByText(/for Priya\. Night there\./).waitFor()
      ensure((await notices(form).count()) === 1, "more than one notice shows")
      // The server refuses it: its words, in the critical notice, in place of the other.
      await page.keyboard.press("Control+Enter")
      await app.settle()
      const refused = form.getByRole("alert").filter({ hasText: "Relay access denied" })
      ensure(await refused.isVisible(), "the server's refusal does not show")
      ensure((await notices(form).count()) === 1, "the refusal shows beside another notice")
      await closeForm(app)
      // A send time: "Sends …" with SEND NOW INSTEAD, and Send reads Schedule.
      form = await compose(app)
      await writeMessage(app, form, priya)
      const theirs = form.getByRole("button", { name: /^Send 9:00 AM for Priya$/ })
      await press(app, theirs)
      ensure(await form.getByText(/^Sends .*\.$/).isVisible(), "a send time does not say when it sends")
      ensure(await form.getByRole("button", { name: "Schedule", exact: true }).isVisible(), "Send does not read Schedule with a time set")
      await press(app, form.getByRole("button", { name: "Send now instead", exact: true }))
      ensure(await form.getByRole("button", { name: "Send", exact: true }).isVisible(), "Send now instead did not take the time off")
      await form.getByText(/for Priya\. Night there\./).waitFor()
      await page.evaluate(() => document.activeElement?.blur())
      await page.mouse.move(0, 0)
    },
  },
  {
    // Save as template (brief M6), in the form layer over the message: NAME, then SAVE TEMPLATE; the toast "Saved
    // {name}"; the template is then in Templates. The picture: the form, named as typed.
    name: "mail-template-save",
    sean: { kind: "undrawn", area: "mail", screen: "template" },
    run: async (app) => {
      const { page } = app
      const form = await compose(app)
      await form.getByRole("textbox", { name: "Message" }).click()
      await page.keyboard.type("The 08:15 crossing is booked. Meet at the pier at 7:45.")
      const save = page.getByRole("dialog", { name: /Save as template/ })
      const open = async () => {
        await press(app, toolRow(app, await messageTool(app, form, "Templates"), "Save as template…"))
        await save.waitFor()
      }
      await open()
      const primary = save.getByRole("button", { name: "Save template", exact: true })
      ensure(await primary.isDisabled(), "Save template is on with no name")
      const name = save.getByRole("textbox", { name: "Name" })
      ensure(await name.evaluate((el) => el === document.activeElement), "the name does not take focus")
      await name.fill("Ferry plans")
      await press(app, primary)
      await save.waitFor({ state: "detached" })
      ensure(await page.locator("[data-sonner-toast]").filter({ hasText: /^Saved Ferry plans$/ }).count(), "no toast says Saved Ferry plans")
      await toastGone(app)
      const list = await messageTool(app, form, "Templates")
      ensure(await toolRow(app, list, "Ferry plans").isVisible(), "the new template is not in Templates")
      await page.keyboard.press("Escape")
      await app.settle()
      ensure(await form.isVisible(), "Esc in Templates closed the message")
      await open()
      await name.fill("Ferry plans for Saturday")
      await page.mouse.move(0, 0)
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
    // The Inbox's filters (ADR-0114; brief M2): one row of single-choice chips under the page head, All, People,
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
      ensure(/\b001\b|\b002\b/.test(await chip(page, "Studio").innerText()), "the Studio chip has no unread count")
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
    // The Screener lane (brief M3): `SCREENER // 003 WAITING`, the rows as every lane. LET IN runs on a full swipe on a
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
      ensure(/^SCREENER\s*\/\/\s*003 WAITING/.test(head), `the Screener's overline reads ${head}`)
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
      // Settings saves the switch silently (ADR-0110): no toast to wait for.
      await page.getByRole("switch", { name: "Screener" }).click()
      await app.settle()
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
      await row(app, await snoozeMenu(app), /^Tomorrow/).click()
      await toastGone(app)
      await lane(app, "Snoozed")
    },
    // The lane says when each row comes back, after the glyph that says why.
    assert: async ({ page }) => ensure(/^PERSONAL\s*\/\/\s*FRI 08:00$/.test((await page.getByRole("list", { name: "Snoozed" }).locator('[data-slot="list-row-time"]').first().innerText()).trim()), "a snoozed row does not say when it comes back"),
  },
  { name: "mail-waiting", sean: { kind: "undrawn", area: "mail", screen: "lane-waiting" }, run: (app) => lane(app, "Waiting") },
  {
    // The Outbox with nothing in it (ADR-0095; brief M7, 5.2): the lane the Scheduled lane became.
    name: "mail-scheduled",
    run: (app) => lane(app, "Outbox"),
    assert: async ({ page }) => {
      ensure((await headTitle(page)) === "Outbox", "the lane is not called Outbox")
      ensure(await page.getByText("Nothing waiting to go.", { exact: true }).isVisible(), "the empty Outbox does not say so")
      ensure(await page.getByText("Use the arrow beside Send to send later.", { exact: true }).isVisible(), "the empty Outbox does not say how to send later")
    },
  },
  {
    // SENDING, NOT SENT and SCHEDULED, one of each (ADR-0095; brief M7): OUTBOX // 03, the seconds, the critical badge, the send time.
    name: "mail-outbox",
    scenario: "outbox",
    sean: { kind: "undrawn", area: "mail", screen: "outbox" },
    run: (app) => openOutbox(app),
    assert: async (app) => {
      const { page } = app
      ensure((await headTitle(page)) === "Outbox", "the lane is not called Outbox")
      ensure(/^OUTBOX\s*\/\/\s*003/i.test(await page.locator('[data-slot="page-head-overline"]:visible').first().innerText()), "the overline does not count what waits")
      const heads = (await page.locator('[data-slot="section-header"]:visible').allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim().toUpperCase())
      ensure(JSON.stringify(heads.map((h) => h.replace(/\s*\d+$/, ""))) === JSON.stringify(["SENDING", "NOT SENT", "SCHEDULED"]), `the sections read ${heads.join(", ")}`)
      const list = (name) => page.getByRole("list", { name, exact: true })
      ensure(/08 S/.test(await list("Sending").innerText()), "the sending row does not count its seconds")
      ensure((await list("Sending").getByRole("button", { name: "Undo", exact: true }).count()) === 1, "the sending row has no UNDO")
      ensure(await list("Not sent").locator('[data-slot="badge"]', { hasText: /not sent/i }).isVisible(), "the failed row has no NOT SENT")
      ensure(/over its sending limit/.test(await list("Not sent").innerText()), "the failed row does not give the error")
      ensure(/MON 08:00/i.test(await list("Scheduled").locator('[data-slot="list-row-time"]').innerText()), "the scheduled row does not give its time")
      // Opening the Outbox counts as seeing the failed send: no banner, no toast, no critical tone.
      ensure(!(await page.locator('[data-slot="banner"]:visible').count()), "the Outbox still shows the not-sent banner")
      ensure(!(await toastSaying(page, "Not sent:").count()), "the Outbox still shows the not-sent toast")
      ensure(!(await page.locator('[data-slot="nav-item"][data-tone="critical"]').count()), "the Outbox is still critical once opened")
    },
  },
  {
    // An Outbox message opened, read-only (ADR-0095; brief M7): TO, FROM, SENDS; the subject; the body; its actions.
    name: "mail-outbox-row",
    scenario: "outbox",
    run: async (app) => {
      await openOutbox(app)
      await press(app, app.page.getByRole("list", { name: "Scheduled", exact: true }).getByRole("button", { name: /^To .*November invoice$/ }))
      await app.page.mouse.move(0, 0)
    },
    assert: async ({ page }) => {
      const open = reader(page)
      for (const label of ["To", "From", "Sends"]) ensure(await open.locator("dt", { hasText: new RegExp(`^${label}$`, "i") }).count(), `the message has no ${label}`)
      ensure(await open.getByRole("heading", { name: "November invoice" }).isVisible(), "the subject is not the title")
      ensure(await open.getByText(/the November invoice is below/).isVisible(), "the body is not shown")
      for (const name of ["Send now", "Change time", "Edit", "Delete"]) ensure(await open.getByRole("button", { name, exact: true }).isVisible(), `the message has no ${name}`)
    },
  },
  {
    // A scheduled message is sent now, moved, edited (closing it unchanged puts it back) and deleted with UNDO (brief M7).
    name: "mail-scheduled-actions",
    scenario: "outbox",
    run: async (app) => {
      const { page } = app
      const scheduled = () => page.getByRole("list", { name: "Scheduled", exact: true })
      const invoice = () => rowOf(page, /November invoice/, "Scheduled")
      const rowMenu = async () => {
        await press(app, moreOf(invoice()))
        return menu(page)
      }
      await openOutbox(app)
      // The reply in its window goes first: on a phone a strip with UNDO holds every toast until it ends.
      const now = await page.evaluate(() => Date.now())
      await page.clock.setFixedTime(new Date(now + 12_000))
      await toastSaying(page, "Sent Re: Saturday ferry").waitFor()
      await toastsGone(app)
      // Swipe tiles on a touch screen: EDIT inner, DELETE outer.
      if (app.touch) {
        await drag(app, invoice(), -120)
        ensure(JSON.stringify(await tiles(invoice())) === JSON.stringify(["EDIT", "DELETE"]), `the row's tiles read ${(await tiles(invoice())).join(", ")}`)
        await pressOutside(app)
      }
      // CHANGE TIME, from the row's menu: the send-later times; the toast names the new time.
      await press(app, (await rowMenu()).getByRole("menuitem", { name: "Change time…" }))
      await press(app, row(app, page.getByRole(app.phone ? "dialog" : "menu", { name: "Send later" }), /^Tomorrow afternoon/))
      // A toast is a sentence: the device's format, not the row's (Vale 35).
      await toastSaying(page, /^Moved November invoice to Fri, Nov 13, 1:00\s?PM/).waitFor()
      ensure(/FRI 13:00/i.test(await scheduled().locator('[data-slot="list-row-time"]').innerText()), "the row did not move to its new time")
      await toastsGone(app)
      // EDIT: out of the Outbox, open with its time; closed unchanged, no question, and it goes back.
      await press(app, scheduled().getByRole("button", { name: /^To .*November invoice$/ }))
      await press(app, reader(page).getByRole("button", { name: "Edit", exact: true }))
      const form = page.getByRole("dialog", { name: /November invoice/ })
      ensure(await form.isVisible(), "EDIT did not open the message")
      ensure(await form.getByRole("button", { name: "Schedule", exact: true }).count(), "the message lost its time")
      ensure(!(await scheduled().count()), "the message stayed in the Outbox while open")
      await page.keyboard.press("Escape")
      await app.settle()
      ensure(!(await discardQuestion(page).count()), "closing it unchanged asked to discard")
      await toastSaying(page, /^Back in Outbox for Fri, Nov 13, 1:00\s?PM/).waitFor()
      ensure(await scheduled().getByRole("button", { name: /^To .*November invoice$/ }).isVisible(), "closing it unchanged did not put it back")
      await toastsGone(app)
      // DELETE, then UNDO: it is queued again with its time.
      await press(app, (await rowMenu()).getByRole("menuitem", { name: "Delete", exact: true }))
      const deleted = toastSaying(page, "Deleted November invoice")
      await deleted.waitFor()
      ensure(!(await scheduled().count()), "DELETE left the message listed")
      await press(app, deleted.getByRole("button", { name: "Undo", exact: true }))
      await scheduled().getByRole("button", { name: /^To .*November invoice$/ }).waitFor()
      ensure(/FRI 13:00/i.test(await scheduled().locator('[data-slot="list-row-time"]').innerText()), "UNDO did not keep its time")
      await toastsGone(app)
      // SEND NOW: it goes at once, and the toast says so.
      await press(app, (await rowMenu()).getByRole("menuitem", { name: "Send now", exact: true }))
      await toastSaying(page, "Sent November invoice").waitFor()
      ensure(!(await scheduled().count()), "SEND NOW left the message scheduled")
      await page.mouse.move(0, 0)
    },
  },
  {
    // A send that failed (ADR-0095; brief M7): in Mail, the Mail banner with EDIT, the NOT SENT row and the Outbox in
    // the critical tone, each once, and no toast beside the banner (cross-app decisions §1, ADR-0115). The brief's
    // unit test with a client stub is this scenario.
    name: "mail-send-fails",
    scenario: "send-fails",
    sean: { kind: "undrawn", area: "mail", screen: "not-sent" },
    assert: async (app) => {
      const { page } = app
      ensure(!(await toastSaying(page, "Not sent:").count()), "a not-sent toast stands beside Mail's banner")
      const banners = page.locator('[data-slot="banner"]:visible')
      ensure((await banners.count()) === 1, `${await banners.count()} banners, not one`)
      ensure(/Not sent: Estimate for the spring catalogue/.test(await banners.innerText()) && /over its sending limit/.test(await banners.innerText()), "the banner does not name the message and the error")
      ensure(await banners.getByRole("button", { name: "Edit", exact: true }).isVisible(), "the banner has no EDIT")
      if (app.size === "desktop") ensure(await page.getByRole("navigation", { name: "Vale" }).getByRole("button", { name: /^Outbox, a message not sent/ }).isVisible(), "the Outbox is not in the critical tone")
    },
  },
  {
    // Seen once: after the Outbox is opened, the banner, toast and tone are gone, and stay gone after a reload; the row stays (W9).
    name: "mail-send-fails-seen",
    scenario: "send-fails",
    run: async (app) => {
      const { page } = app
      await lane(app, "Outbox")
      ensure((await page.getByRole("list", { name: "Not sent", exact: true }).getByRole("listitem").count()) === 1, "the NOT SENT row does not show once")
      ensure(!(await toastSaying(page, "Not sent:").count()), "opening the Outbox left the toast")
      await page.reload()
      await page.waitForFunction(() => !!document.getElementById("root")?.innerText.trim())
      await app.settle()
      await lane(app, "Inbox")
    },
    assert: async ({ page }) => {
      ensure(!(await toastSaying(page, "Not sent:").count()), "the toast came back after a reload")
      ensure(!(await page.locator('[data-slot="banner"]:visible').count()), "the banner came back after a reload")
      ensure(!(await page.locator('[data-slot="nav-item"][data-tone="critical"]').count()), "the Outbox is critical again after a reload")
    },
  },
  {
    // EDIT on a failed send opens a copy and the failed row stays; DELETE clears it, with UNDO (W9, Vale 35).
    name: "mail-send-fails-edit",
    scenario: "send-fails",
    sizes: ["desktop", "phone"],
    run: async (app) => {
      const { page } = app
      await press(app, page.locator('[data-slot="banner"]:visible').getByRole("button", { name: "Edit", exact: true }))
      const form = page.getByRole("dialog", { name: /Estimate for the spring catalogue/ })
      ensure(await form.isVisible(), "EDIT did not open a copy of the message")
      ensure(!(await toastSaying(page, "Not sent:").count()), "EDIT left the toast")
      await closeForm(app)
      await lane(app, "Outbox")
      const notSent = page.getByRole("list", { name: "Not sent", exact: true })
      ensure((await notSent.getByRole("listitem").count()) === 1, "the failed row left after EDIT")
      // DELETE, from the message beside the list (pushed on a phone): the row goes, and the toast's UNDO puts it back.
      await press(app, notSent.getByRole("listitem").first().locator('[data-slot="list-row"]').first())
      await press(app, page.getByRole("button", { name: "Delete", exact: true }).first())
      const deleted = toastSaying(page, /^Deleted /)
      await deleted.waitFor()
      ensure(!(await notSent.count()), "DELETE left the failed row in the Outbox")
      await press(app, deleted.getByRole("button", { name: "Undo", exact: true }))
      await notSent.getByRole("listitem").first().waitFor()
      ensure((await notSent.getByRole("listitem").count()) === 1, "UNDO did not put the failed send back")
      await toastsGone(app)
      await page.mouse.move(0, 0)
    },
  },
  {
    // The Team lane (brief M9): TEAM // 003, the head's OPEN A LINK…, and inline rows: the title, who shared it, STOPPED, the time.
    name: "mail-team",
    scenario: "team-shared",
    sean: { kind: "undrawn", area: "mail", screen: "team-lane" },
    run: (app) => lane(app, "Team"),
    assert: async (app) => {
      const { page } = app
      const rows = page.getByRole("list", { name: "Team" }).getByRole("listitem")
      ensure((await rows.count()) === 3, `the Team lane lists ${await rows.count()} conversations, not 3`)
      ensure(/You shared/.test(await rows.filter({ hasText: "Token audit" }).innerText()), "your own share does not say You shared")
      ensure(/From Noor Haddad/.test(await rows.filter({ hasText: "Supplier contract" }).innerText()), "a teammate's share does not say who it is from")
      ensure(/stopped/i.test(await rows.filter({ hasText: "Venue shortlist" }).innerText()), "the stopped share has no STOPPED")
      ensure(/TEAM \/\/ 003/.test((await page.locator('[data-slot="page-head"]:visible').first().innerText()).toUpperCase()), "the overline is not TEAM // 003")
    },
  },
  {
    // Nothing shared yet (brief 5.2): TEAM // 00 with OPEN A LINK….
    name: "team-empty",
    run: (app) => lane(app, "Team"),
    assert: async (app) => {
      const empty = app.page.locator('[data-slot="empty"]:visible').first()
      ensure(/Nothing shared\./.test(await empty.innerText()), "the empty lane does not say Nothing shared.")
      ensure(await empty.getByRole("button", { name: "Open a link…", exact: true }).isVisible(), "the empty lane has no Open a link…")
    },
  },
  {
    // OPEN A LINK… is a form: LINK and the primary OPEN. A note's link says where it opens instead.
    name: "mail-team-open-link",
    run: async (app) => {
      const { page } = app
      await lane(app, "Team")
      await press(app, page.getByRole("button", { name: "Open a link…" }).first())
      const form = page.getByRole("dialog", { name: /Open a shared conversation/ })
      ensure(await form.getByRole("textbox", { name: "Link" }).isVisible(), "the form has no LINK field")
      ensure(await formPrimary(form, "Open").isDisabled(), "OPEN is on with no link")
    },
  },
  {
    // A teammate's shared conversation (brief M9): SHARED BY · STATE, the title, LEAVE, and the four line tabs. MESSAGES is
    // read-only; COMMENTS adds one through a plain field and its secondary button. No Composer anywhere on the screen.
    name: "team-shared",
    scenario: "team-shared",
    sean: { kind: "undrawn", area: "mail", screen: "team-shared" },
    run: async (app) => {
      const { page } = app
      await openTeam(app, "Supplier contract renewal")
      const view = teamView(page)
      for (const label of ["Shared by", "State"]) ensure(await view.getByText(label, { exact: true }).first().isVisible(), `the MetaList has no ${label}`)
      ensure(/Noor Haddad/.test(await view.innerText()), "SHARED BY does not name Noor Haddad")
      const tabs = view.getByRole("tablist", { name: "Team" })
      const names = (await tabs.getByRole("tab").allInnerTexts()).map((t) => t.trim().toUpperCase())
      ensure(names.join(" ") === "MESSAGES COMMENTS 001 REPLY FILES", `the tabs read ${names.join(", ")}`)
      ensure((await view.locator('[data-role="team-message"]').count()) === 2, "MESSAGES does not show the two shared messages")
      ensure(!(await page.locator('[data-slot="composer"]:visible').count()), "a shared conversation has a Composer")
      await press(app, tabs.getByRole("tab", { name: /^Comments/ }))
      await view.getByRole("textbox", { name: "Comment" }).fill("Asked for the minimum order. I'll share their answer here.")
      await press(app, view.getByRole("button", { name: "Add comment", exact: true }))
      ensure((await view.locator('[data-role="team-comment"]').count()) === 2, "ADD COMMENT did not add the comment")
      ensure(/Comments stay with the team\./.test(await view.innerText()), "COMMENTS has no caption")
      // Your own comment can be taken back; the others' cannot.
      ensure((await view.getByRole("button", { name: "Delete comment" }).count()) === 1, "a comment that is not yours can be deleted")
      await press(app, tabs.getByRole("tab", { name: "Reply", exact: true }))
      ensure(await view.getByRole("textbox", { name: "Reply together" }).isVisible(), "REPLY has no shared field")
      ensure(!(await view.getByRole("button", { name: "Use as reply" }).count()), "a teammate is offered Use as reply")
      await press(app, tabs.getByRole("tab", { name: /^Comments/ }))
      // Your comment carries your own name, not the account's label "Personal" (Vale 43).
      const mine = view.locator('[data-role="team-comment"]').filter({ hasText: "Asked for the minimum order" })
      ensure(!/\bPersonal\b/.test(await mine.innerText()), "your comment is signed with the account's label")
      await page.evaluate(() => document.activeElement?.blur())
      await page.mouse.move(0, 0)
    },
  },
  {
    // LEAVE asks first, with focus on Cancel (Vale 43): leaving cannot be undone without a new invitation.
    name: "team-leave-asks",
    scenario: "team-shared",
    sizes: ["desktop"],
    run: async (app) => {
      await openTeam(app, "Supplier contract renewal")
      await press(app, teamView(app.page).getByRole("button", { name: "Leave", exact: true }))
    },
    assert: async ({ page }) => {
      const question = page.getByRole("dialog").filter({ hasText: "Leave Supplier contract renewal?" })
      ensure(await question.isVisible(), "LEAVE did not ask")
      ensure((await page.evaluate(() => document.activeElement?.textContent?.trim())) === "Cancel", "focus is not on Cancel")
      ensure(await question.getByRole("button", { name: "Leave", exact: true }).isVisible(), "the yes does not repeat the verb")
    },
  },
  {
    // The Team lane's time is the newest message's, newest first (Vale 43).
    name: "team-row-time",
    scenario: "team-shared",
    sizes: ["desktop"],
    run: (app) => lane(app, "Team"),
    assert: async ({ page }) => {
      const times = await page.getByRole("list", { name: "Team" }).getByRole("listitem").evaluateAll((els) => els.map((el) => el.querySelector('[data-slot="list-row-status"], [data-slot="list-row-time"]')?.textContent?.trim() ?? ""))
      ensure(times.every((t) => t.length > 0), `a Team row has no time: ${JSON.stringify(times)}`)
    },
  },
  {
    // Your own copy in the Inbox (brief M9): COMMENTS, REPLY and FILES under TEAM // NOT SENT, after the messages; the
    // pinned reply field stays the only Composer. FILES: the sheet to share, and the recording over 10 MB in the critical state.
    name: "team-owner-copy",
    scenario: "team-shared",
    sean: { kind: "undrawn", area: "mail", screen: "team-owner-copy" },
    run: async (app) => {
      const { page } = app
      await conversation(app, /Token audit/)
      const team = reader(page).getByRole("region", { name: "Team, not sent" })
      await team.scrollIntoViewIfNeeded()
      ensure(/TEAM \/\/ NOT SENT/.test((await team.innerText()).toUpperCase()), "the team block has no TEAM // NOT SENT")
      const tabs = team.getByRole("tablist", { name: "Team" })
      const names = (await tabs.getByRole("tab").allInnerTexts()).map((t) => t.trim().toUpperCase())
      ensure(names.join(" ") === "COMMENTS 003 REPLY FILES", `the owner's tabs read ${names.join(", ")}`)
      ensure((await page.locator('[data-slot="composer"]:visible').count()) === 1, "the owner's copy has more or fewer than one Composer")
      await press(app, tabs.getByRole("tab", { name: "Files", exact: true }))
      ensure((await team.locator('[data-role="team-file"]').count()) === 2, "FILES does not list the two attachments")
      ensure(/too big to share/i.test(await team.innerText()), "the recording over 10 MB is not in the critical state")
      await press(app, tabs.getByRole("tab", { name: "Reply", exact: true }))
      ensure(await team.getByRole("button", { name: "Use as reply" }).isVisible(), "the owner has no Use as reply")
      await press(app, team.getByRole("button", { name: "Use as reply" }))
      const composer = page.getByRole("dialog", { name: /Re: Token audit/ })
      ensure(/Thursday at 10 works/.test(await composer.innerText()), "USE AS REPLY did not bring the team's reply into the composer")
      await closeForm(app)
      await press(app, tabs.getByRole("tab", { name: /^Comments/ }))
      await toTop(app, team)
    },
  },
  {
    // Stopped for a guest (brief M9, States): the compact info Banner, STOPPED, REMOVE, and nothing to type into.
    name: "team-stopped",
    scenario: "team-shared",
    run: async (app) => {
      const { page } = app
      await openTeam(app, "Venue shortlist")
      const view = teamView(page)
      ensure(/The owner stopped sharing\./.test(await view.locator('[data-slot="banner"]').first().innerText()), "the stopped copy has no banner")
      await press(app, view.getByRole("tab", { name: /^Comments/ }))
      ensure(!(await view.getByRole("textbox").count()), "a stopped copy still takes comments")
      ensure(app.phone || (await page.getByRole("toolbar", { name: "Shared conversation" }).getByRole("button", { name: "Remove", exact: true }).isVisible()), "a stopped copy has no Remove")
    },
  },
  {
    // The owner deleted the conversation from their mail (brief M9, States): the line and REMOVE.
    name: "team-removed",
    scenario: ["team-shared", "team-removed"],
    run: async (app) => {
      await openTeam(app, "Token audit")
      ensure(/That conversation isn't in your mail any more\./.test(await teamView(app.page).locator('[data-slot="banner"]').first().innerText()), "the removed copy has no banner")
    },
  },
  {
    // A shared inbox for a team member (brief M9 B): Assigned to me, and under TEAM // NOT SENT ASSIGNED TO with ASSIGN, the
    // team's notes and a plain field with ADD NOTE. The reply field stays the only Composer.
    name: "team-assigned",
    scenario: ["member", "shared-inbox"],
    run: async (app) => {
      const { page } = app
      await lane(app, "Assigned to me")
      const rows = page.getByRole("list", { name: "Assigned to me" }).getByRole("button", { name: /Token audit/ })
      ensure((await rows.count()) >= 1, "Token audit is not in Assigned to me")
      await press(app, rows.first())
      await page.mouse.move(0, 0)
      const team = reader(page).getByRole("region", { name: "Team, not sent" })
      await team.scrollIntoViewIfNeeded()
      ensure(/Noor Haddad/.test(await team.getByRole("group", { name: "Assigned to", exact: true }).innerText()), "ASSIGNED TO does not name Noor")
      ensure((await team.locator('[data-role="team-comment"]').count()) === 2, "the two team notes are not shown")
      ensure(/Notes stay with the team\. They never go to anyone on the conversation\./.test(await team.innerText()), "the notes have no caption")
      ensure((await team.getByRole("button", { name: "Delete note" }).count()) === 1, "a member can delete a note that is not theirs")
      ensure((await page.locator('[data-slot="composer"]:visible').count()) === 1, "the conversation has more or fewer than one Composer")
      await press(app, team.getByRole("button", { name: "Assign", exact: true }))
      const menu = page.getByRole(app.phone ? "dialog" : "menu", { name: "Assign" })
      for (const n of ["Me", "Nobody"]) ensure(await menu.getByText(n, { exact: true }).isVisible(), `ASSIGN has no ${n}`)
      await page.keyboard.press("Escape")
      await app.settle()
      await toTop(app, team)
    },
  },
  { name: "mail-archive", sean: { kind: "undrawn", area: "mail", screen: "lane-archive" }, run: (app) => lane(app, "Archive") },
  {
    // Mobile / 07 and Desktop / 05 (ADR-0113): the account that stopped syncing, in the server's words and with when its
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
      // Desktop / 05: the sidebar's Work row and its sync-problem mark are in sight, inside the scrolling middle.
      if (app.size === "desktop") {
        const work = sidebar(page).getByRole("radio", { name: "Work, sync problem", exact: true })
        const seen = await work.evaluate((el) => {
          const box = el.getBoundingClientRect()
          const middle = el.closest('[data-slot="app-frame-sidebar-middle"]').getBoundingClientRect()
          return box.top >= middle.top && box.bottom <= middle.bottom
        })
        ensure(seen, "the Work account and its sync problem are out of sight in the sidebar")
      }
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
        ensure(/SNOOZED \/\/ BACK AT FRI 08:00\s*002/.test(await beside.innerText()), "the detail column does not list the snoozed mail")
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
      else await press(app, page.locator('[data-slot="app-frame-status-line"]').getByRole("button", { name: /\. Check again$/ }))
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
    // Past first run with Not now (ADR-0107): Mail's own way on.
    scenario: ["no-account", "first-run-skipped"],
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
    // The swipe's rules, with a finger (ADR-0113; contract 6.4): the default slots show ARCHIVE alone; a vertical drag
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
      // Vale 1: while an account is chosen, the ACCOUNTS heading has ALL, the visible way back to every account.
      await press(app, (await groups(app)).getByRole("radio", { name: "Work", exact: true }))
      const all = (await groups(app)).getByRole("button", { name: "Show all accounts", exact: true })
      ensure(await all.isVisible(), "ACCOUNTS has no ALL while an account is chosen")
      ensure(/^all$/i.test((await all.innerText()).trim()), `ALL reads "${await all.innerText()}"`)
      await press(app, all)
      ensure((await rows.count()) === everyone, "ALL did not return to all accounts")
      await groups(app)
    },
    assert: async (app) => {
      const { page } = app
      const list = await groups(app)
      ensure((await oneCurrent(list, "Mail's folders")) === "Inbox", "the Inbox is not the current place")
      for (const gone of ["Drafts", "Sent", "Spam"]) ensure(!(await list.getByRole("button", { name: gone, exact: true }).count()), `${gone} is listed, and the core has no such folder`)
      for (const row of ["Unread", "Starred", "Snoozed", "Waiting", "Outbox", "Archive", "Team", "Add an account…"]) ensure(await list.getByRole("button", { name: row, exact: true }).count(), `${row} is not in Mail's folders`)
      const accounts = list.getByRole("radiogroup", { name: /Account/ })
      // As drawn (Mobile / 05): the two accounts and no "All" row; none chosen is all of them.
      ensure((await accounts.getByRole("radio").count()) === 2, "the Account group is not the two accounts")
      ensure(!(await accounts.locator('[role="radio"][aria-checked="true"]').count()), "an account is chosen while the Inbox shows all accounts")
      ensure(!(await list.getByRole("button", { name: "Show all accounts", exact: true }).count()), "ALL shows while every account is already shown")
      ensure(!(await list.locator('[role="radio"][aria-current]').count()), "an account says it is the current place: it is a filter")
      if (await switcherLayer(page).count()) {
        ensure(/Mail\s*\/\/\s*All accounts/i.test(await list.innerText()), "the layer's overline does not name the section and the account")
        ensure(/Change folder or account\.$/.test(await switcher(page).first().getAttribute("aria-label")), "the page head button does not say what it changes")
      } else ensure(!(await switcher(page).count()), "the page head is a switcher although the sidebar lists the folders")
    },
  },
]
