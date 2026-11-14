// Settings (ADR-0104): the page on unicron's SettingsFrame, each section the demo shows, Accounts.
import { area, button, ensure, press, settingsButton, sidebar } from "./helpers.mjs"

/** The list of sections: the frame's own nav. */
const sectionList = (page) => page.getByRole("navigation", { name: "Settings sections" })

/** Opens Settings, and one section of it when given. Mail's, calendar's and search's scenes use it too. */
export const settings = async (app, section) => {
  await press(app, settingsButton(app.page))
  if (section) await press(app, sectionList(app.page).getByRole("button", { name: section, exact: true }))
}

/** The way back from a pushed section: the phone's top bar, or the status line's leading slot at medium width. */
const back = (app) => press(app, app.page.getByRole("button", { name: "Back", exact: true }).first())

/** The open section's column: named by the section, headed by its title (cross-app decisions §5). */
const sectionShows = async (page, name) => (await page.getByRole("region", { name, exact: true }).count()) > 0 && (await page.getByRole("heading", { name, level: 2, exact: true }).isVisible())

/** The section list's names, in order. */
const listed = (page) => sectionList(page).getByRole("button").evaluateAll((els) => els.map((el) => el.textContent.trim()))

/** The Manage screen of the account named `name`, from Settings › Accounts. */
const manage = async (app, name) => {
  await settings(app, "Accounts")
  await press(app, app.page.getByRole("group", { name }).getByRole("button", { name: "Manage", exact: true }))
}

export const scenes = [
  {
    // Desktop / 12 and Mobile / 16: Accounts beside the list on a desktop; on a phone and at medium
    // width the drawn ACCOUNTS rows, then every section. The work account has lost its Google sign-in,
    // as drawn. On the way, every section is reached from the list and comes back (brief T0).
    name: "settings",
    scenario: "sign-in-needed",
    sizes: ["desktop", "phone", "medium"],
    sean: { kind: "drawn", area: "settings", screen: "settings" },
    run: async (app) => {
      const { page } = app
      await settings(app)
      const names = await listed(page)
      ensure(names.length === 8, `the demo lists ${names.length} sections: ${names.join(", ")}`)
      const split = !!(await sidebar(page).count()) && app.size === "desktop"
      for (const name of names) {
        await press(app, sectionList(page).getByRole("button", { name, exact: true }))
        ensure(await sectionShows(page, name), `${name} did not open from the list of sections`)
        if (split) {
          const current = sectionList(page).locator("[aria-current]")
          ensure((await current.count()) === 1 && (await current.getAttribute("aria-label")) === name, `the list does not mark ${name}, alone, as the open section`)
        } else {
          // Pushed: Back returns to the list, which marks nothing.
          await back(app)
          ensure(await sectionList(page).isVisible(), `Back from ${name} did not return to the list of sections`)
          ensure(!(await sectionList(page).locator("[aria-current]").count()), "a pushed section's list marks one current")
        }
      }
      if (split) {
        await press(app, sectionList(page).getByRole("button", { name: "Accounts", exact: true }))
        ensure((await sidebar(page).getByRole("button", { name: /^Settings/ }).getAttribute("aria-current")) === "page", "the sidebar's Settings item is not current")
      }
      // The pointer leaves the last row it pressed, and the page is at its top again.
      await page.mouse.move(0, 0)
      await page.evaluate(() => document.querySelectorAll("[data-scroll-root], main, [data-slot]").forEach((el) => el.scrollTop && (el.scrollTop = 0)))
      await app.settle()
    },
    assert: async ({ page }) => {
      ensure(await page.getByRole("heading", { name: "Settings", level: 1 }).isVisible(), "the page head does not say Settings")
      ensure(/Settings \/\/ Personal \+ Work/i.test(await page.locator('[data-slot="page-head-overline"]:visible').first().innerText()), "the page head's overline does not name the accounts")
      const work = page.getByRole("group", { name: "Work" }).first()
      ensure(/Gmail \/\/ sign-in needed/.test(await work.textContent()), "the work account does not read Gmail // sign-in needed")
      ensure(await work.getByRole("button", { name: "Sign in", exact: true }).isVisible(), "the work account has no SIGN IN")
      ensure(!(await page.getByRole("searchbox", { name: "Find a setting" }).count()), "Find a setting shows with fewer than ten sections")
    },
  },
  {
    // The phone's Settings below the drawn rows: ALL SETTINGS // 08 and the sections in their four groups.
    name: "settings-phone-index",
    sizes: ["phone"],
    run: async (app) => {
      const { page } = app
      await settings(app)
      const all = page.getByRole("heading", { name: /All settings/i })
      ensure(/08/.test(await all.innerText()), "the list's header does not count 08 sections")
      // Scrolled to the header, so the whole list shows under the top row.
      await all.evaluate((el) => el.scrollIntoView({ block: "start" }))
      await app.settle()
    },
    assert: async ({ page }) => {
      for (const group of ["Accounts", "Mail", "Calendar and notes", "Vale"]) ensure(await sectionList(page).getByRole("group", { name: new RegExp(`^${group}$`, "i") }).count(), `the list has no ${group} group`)
    },
  },
  {
    // "Find a setting" shows from ten sections up (cross-app decisions §5). The demo has eight, a team
    // member three, so it is not there; once a person has ten, typing narrows the list.
    name: "settings-find",
    sizes: ["desktop", "phone"],
    run: async (app) => {
      const { page } = app
      await settings(app)
      const field = page.getByRole("searchbox", { name: "Find a setting" })
      const count = (await listed(page)).length
      if (count < 10) {
        ensure(!(await field.count()), `Find a setting shows with ${count} sections`)
        return
      }
      await field.fill("theme")
      await app.settle()
      ensure(JSON.stringify(await listed(page)) === JSON.stringify(["Appearance"]), "Find a setting did not narrow the list to Appearance")
      ensure(await field.isVisible(), "Find a setting went away while it narrowed the list")
    },
  },
  { name: "settings-accounts", sizes: ["desktop", "phone", "medium"], sean: { kind: "undrawn", area: "settings", screen: "accounts" }, run: (app) => settings(app, "Accounts") },
  {
    // Manage an account, pushed in the column (brief T1).
    name: "settings-manage-account",
    sizes: ["desktop", "phone", "medium"],
    sean: { kind: "undrawn", area: "settings", screen: "manage-account" },
    run: (app) => manage(app, "Personal"),
    assert: async ({ page }) => {
      for (const label of ["Address", "Provider", "Mail", "Calendars and contacts"]) ensure(await page.getByRole("group", { name: label, exact: true }).count(), `Manage has no ${label} row`)
      ensure(/me@personal\.example/.test(await page.getByRole("group", { name: "Address", exact: true }).textContent()), "Manage does not show the account's address")
      ensure(await button(page, "Remove account").isVisible(), "Manage has no REMOVE ACCOUNT")
    },
  },
  {
    // REMOVE ACCOUNT asks first, with focus on Cancel (cross-app decisions §10), and the demo's server says no.
    name: "settings-remove-account",
    run: async (app) => {
      const { page } = app
      await manage(app, "Personal")
      await press(app, button(page, "Remove account"))
    },
    assert: async ({ page }) => {
      const question = page.getByRole("dialog").filter({ hasText: "Remove me@personal.example?" })
      ensure(await question.isVisible(), "REMOVE ACCOUNT did not ask")
      ensure(/Mail on the server is not affected\./.test(await question.innerText()), "the question does not say the server's mail stays")
      ensure((await page.evaluate(() => document.activeElement?.textContent?.trim())) === "Cancel", "focus is not on Cancel")
      ensure(await question.getByRole("button", { name: "Remove", exact: true }).isVisible(), "the yes does not repeat the verb")
    },
  },
  {
    // A failed save: the control stays as it was, with one critical line under it (brief T0).
    name: "settings-save-failed",
    scenario: "settings-save-fails",
    run: async (app) => {
      const { page } = app
      await settings(app, "Mail")
      const quote = page.getByRole("switch", { name: "Include the message you're replying to" })
      ensure(await quote.isChecked(), "the quote switch does not start on")
      await press(app, quote)
    },
    assert: async ({ page }) => {
      ensure(await page.getByRole("switch", { name: "Include the message you're replying to" }).isChecked(), "the switch did not return to on")
      const line = page.locator('[data-slot="save-failed"]')
      ensure((await line.count()) === 1, `${await line.count()} failure lines show, not one`)
      ensure(/read-only on this computer/.test(await line.innerText()), "the line does not give the server's words")
      ensure(!(await page.locator("[data-sonner-toast]").count()), "a failed save raised a toast")
    },
  },
  {
    // A team member: Accounts, Appearance, and Shortcuts and gestures; no groups and no Find a setting (brief T0).
    name: "settings-member",
    scenario: "member",
    sizes: ["desktop", "phone", "medium"],
    run: async (app) => {
      const { page } = app
      await settings(app)
      const names = await listed(page)
      ensure(JSON.stringify(names) === JSON.stringify(["Accounts", "Appearance", "Shortcuts and gestures"]), `the member's sections are: ${names.join(", ")}`)
      await press(app, sectionList(page).getByRole("button", { name: "Accounts", exact: true }))
    },
    assert: async ({ page }) => {
      ensure(/You're signed in as Noor Haddad on a shared inbox\. Its accounts belong to the owner\./.test(await page.getByRole("region", { name: "Accounts", exact: true }).innerText()), "the member's block is not there")
      ensure(await button(page, "Sign out").isVisible(), "the member has no SIGN OUT")
      ensure(!(await page.getByRole("searchbox", { name: "Find a setting" }).count()), "a member gets Find a setting")
    },
  },
  {
    // The gateway's owner: its sign-out is the last group of Accounts, no longer a button under the list (brief T1).
    name: "settings-gateway",
    scenario: "gateway-owner",
    sizes: ["desktop"],
    run: async (app) => {
      const names = await (await settings(app), listed(app.page))
      ensure(names.includes("Team members") && names.includes("About") && !names.includes("Notifications") && !names.includes("Gateway updates"), `the owner's sections are: ${names.join(", ")}`)
      await press(app, sectionList(app.page).getByRole("button", { name: "Accounts", exact: true }))
    },
    assert: async ({ page }) => {
      const row = page.getByRole("group", { name: "Signed in", exact: true })
      ensure(/This gateway/.test(await row.textContent()), "the gateway's row does not say This gateway")
      ensure(await row.getByRole("button", { name: "Sign out", exact: true }).isVisible(), "the gateway's row has no SIGN OUT")
    },
  },
  { name: "settings-signatures", run: (app) => settings(app, "Signatures and templates") },
  { name: "settings-mail", run: (app) => settings(app, "Mail") },
  { name: "settings-calendar", run: (app) => settings(app, "Calendar") },
  {
    // The second time zone (ADR-0088; brief T4): a row in Settings › Calendar on the zone picker,
    // "None" first. Picked there, it still adds its column of hours to the calendar's time grid.
    name: "settings-second-zone",
    run: async (app) => {
      const { page } = app
      await settings(app, "Calendar")
      const row = page.getByRole("group", { name: "Second time zone" })
      // (The row cuts a long value in the middle, in two parts: read the text, not the lines.)
      ensure(/None/.test(await row.textContent()), "the row does not start at None")
      await press(app, row.getByRole("button", { name: "Change" }))
      const picker = page.getByRole("dialog", { name: "Second time zone" })
      const options = picker.getByRole("option")
      ensure((await options.first().innerText()).trim().startsWith("None"), "the second zone's list does not start with None")
      ensure(!(await picker.getByRole("option", { name: /Los Angeles/ }).count()), "the second zone's list offers your own zone")
      await picker.getByRole("combobox", { name: "Search time zones" }).fill("lisbon")
      await app.settle()
      await press(app, options.first())
      ensure(/Lisbon \(/.test(await row.textContent()), "the row does not show Lisbon")
      // The time grid's second gutter.
      await area(app, "Calendar")
      await press(app, page.getByRole("group", { name: "View" }).getByRole("button", { name: "Day", exact: true }))
    },
    assert: async ({ page }) => {
      const gutter = page.locator('[data-slot="second-zone"]')
      ensure(await gutter.isVisible(), "the time grid has no second column of hours")
      ensure((await gutter.getAttribute("aria-label")) === "Hours in Lisbon", "the second column is not Lisbon's")
    },
  },
  {
    // Appearance (brief T9): one Theme row, SYSTEM · STONE · GRAPHITE. A chip switches the whole app at
    // once, and the choice is read back after a reload. The picture ends on the picture's own theme.
    name: "settings-appearance",
    sizes: ["desktop", "phone", "medium"],
    sean: { kind: "undrawn", area: "settings", screen: "appearance" },
    run: async (app) => {
      const { page } = app
      await settings(app, "Appearance")
      const chips = () => page.getByRole("radiogroup", { name: "Theme" })
      const dark = () => page.evaluate(() => document.documentElement.classList.contains("dark"))
      const own = app.theme === "dark" ? "Graphite" : "Stone"
      const other = app.theme === "dark" ? "Stone" : "Graphite"
      ensure(await chips().getByRole("radio", { name: own, exact: true }).isChecked(), `${own} is not the checked theme`)
      await press(app, chips().getByRole("radio", { name: other, exact: true }))
      ensure((await dark()) === (other === "Graphite"), `${other} did not switch the app`)
      const ground = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
      const stored = await page.evaluate(() => localStorage.getItem("theme"))
      ensure(stored === (other === "Graphite" ? "dark" : "light"), `the choice is stored as ${stored}`)
      // A reload: the harness writes the picture's theme on every load, so the scene puts back what the
      // app stored, as a browser that kept its storage would; the app must start on it.
      await page.context().addInitScript((t) => localStorage.setItem("theme", t), stored)
      await page.reload()
      await page.waitForFunction(() => !!document.getElementById("root")?.innerText.trim())
      await app.settle()
      ensure((await dark()) === (other === "Graphite"), `${other} did not survive a reload`)
      ensure((await page.evaluate(() => getComputedStyle(document.body).backgroundColor)) === ground, "the ground changed on reload")
      // Back to the picture's theme, in Settings › Appearance.
      await settings(app, "Appearance")
      await press(app, chips().getByRole("radio", { name: own, exact: true }))
      await page.mouse.move(0, 0)
    },
    assert: async (app) => {
      const chips = app.page.getByRole("radiogroup", { name: "Theme" })
      ensure((await chips.getByRole("radio").count()) === 3, "the Theme row does not have its three choices")
      const picked = app.theme === "dark" ? "Graphite" : "Stone"
      ensure(await chips.getByRole("radio", { name: picked, exact: true }).isChecked(), `${picked} is not the checked theme`)
    },
  },
  { name: "settings-shortcuts", run: (app) => settings(app, "Shortcuts and gestures") },
  { name: "settings-ai", run: (app) => settings(app, "AI summaries and replies") },
  // "New mail on your phone" until ADR-0085 named it Notifications; the scene keeps its name so its pictures pair up.
  { name: "settings-phone", run: (app) => settings(app, "Notifications") },
]
