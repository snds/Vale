// Settings (ADR-0104): the page on unicron's SettingsFrame, each section the demo shows, Accounts.
import { area, button, ensure, formatBar, formLayer, formPrimary, press, settingsButton, sidebar, toastGone } from "./helpers.mjs"
import { calendarHours, calendarView } from "./calendar.mjs"

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

/** A group of the open section, by its overline (ADR-0110's SettingBlock). */
const region = (page, name) => page.getByRole("region", { name, exact: true })

/** A reload, as a browser that kept this tab's storage: the app starts again on what it saved. */
const reload = async (app) => {
  await app.page.reload()
  await app.page.waitForFunction(() => !!document.getElementById("root")?.innerText.trim())
  await app.settle()
}

/** About, from the list: its item carries the update mark's words when one waits ("About, Update ready"). */
const about = async (app) => {
  await press(app, settingsButton(app.page))
  await press(app, sectionList(app.page).getByRole("button", { name: /^About(, |$)/ }))
}

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
      ensure(names.length === 9, `the demo lists ${names.length} sections: ${names.join(", ")}`)
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
    // The phone's Settings below the drawn rows: ALL SETTINGS // 09 and the sections in their four groups.
    name: "settings-phone-index",
    sizes: ["phone"],
    run: async (app) => {
      const { page } = app
      await settings(app)
      const all = page.getByRole("heading", { name: /All settings/i })
      ensure(/09/.test(await all.innerText()), "the list's header does not count 09 sections")
      // Scrolled to the header, so the whole list shows under the top row.
      await all.evaluate((el) => el.scrollIntoView({ block: "start" }))
      await app.settle()
    },
    assert: async ({ page }) => {
      for (const group of ["Accounts", "Mail", "Calendar and notes", "Vale"]) ensure(await sectionList(page).getByRole("group", { name: new RegExp(`^${group}$`, "i") }).count(), `the list has no ${group} group`)
    },
  },
  {
    // "Find a setting" shows from ten sections up (cross-app decisions §5). The demo has nine, a team
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
    // ADD AN ACCOUNT opens first run's step 2 inside the Settings column, not the focus frame (brief
    // T1, X8; ADR-0107): the same form, under the pushed screen's head. Adding it returns to the list.
    name: "settings-add-account",
    scenario: "accounts-addable",
    sizes: ["desktop", "phone", "medium"],
    sean: { kind: "undrawn", area: "settings", screen: "add-account" },
    run: async (app) => {
      const { page } = app
      await settings(app, "Accounts")
      await press(app, page.getByRole("region", { name: "Add an account", exact: true }).getByRole("button", { name: "iCloud", exact: true }))
      ensure(!(await page.getByRole("main", { name: "First run" }).count()), "ADD AN ACCOUNT opened the focus frame")
      ensure(await page.getByRole("heading", { name: "Add iCloud" }).isVisible(), "the Settings column does not show Add iCloud")
      await page.getByRole("textbox", { name: "Email address" }).fill("robin.ash@icloud.com")
      await page.getByRole("textbox", { name: "Name on sent mail" }).fill("Robin Ash")
      await page.getByLabel("App-specific password").fill("abcd-efgh-ijkl-mnop")
      await page.mouse.move(0, 0)
      await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
    },
    assert: async ({ page }) => {
      ensure(await page.getByRole("button", { name: "Add account", exact: true }).isVisible(), "the form has no ADD ACCOUNT")
      ensure(await page.getByText("Checked before saving.").isVisible(), "ADD ACCOUNT has no Checked before saving.")
    },
  },
  {
    // Adding from Settings: the toast names the address and the list shows the new account, waiting for its first sync.
    name: "settings-add-account-done",
    scenario: "accounts-addable",
    sizes: ["desktop"],
    run: async (app) => {
      const { page } = app
      await settings(app, "Accounts")
      await press(app, page.getByRole("region", { name: "Add an account", exact: true }).getByRole("button", { name: "iCloud", exact: true }))
      await page.getByRole("textbox", { name: "Email address" }).fill("robin.ash@icloud.com")
      await page.getByLabel("App-specific password").fill("abcd-efgh-ijkl-mnop")
      await press(app, page.getByRole("button", { name: "Add account", exact: true }))
      ensure(/Added robin\.ash@icloud\.com/.test(await page.locator("[data-sonner-toast]").first().innerText()), "the toast does not read Added robin.ash@icloud.com")
      ensure(/iCloud \/\/ first sync/.test(await page.getByRole("group", { name: "robin.ash" }).first().textContent()), "the new account's row does not read iCloud // first sync")
      await page.mouse.move(0, 0)
    },
  },
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
      const quote = page.getByRole("switch", { name: "Quote the message" })
      ensure(await quote.isChecked(), "the quote switch does not start on")
      await press(app, quote)
    },
    assert: async ({ page }) => {
      ensure(await page.getByRole("switch", { name: "Quote the message" }).isChecked(), "the switch did not return to on")
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
  {
    // Signatures and templates (brief T3): a row per account with its signature's first line and EDIT;
    // TEMPLATES with a count, NEW TEMPLATE, and a row per template.
    name: "settings-signatures",
    sizes: ["desktop", "phone", "medium"],
    sean: { kind: "undrawn", area: "settings", screen: "signatures" },
    run: (app) => settings(app, "Signatures and templates"),
    assert: async ({ page }) => {
      const signatures = region(page, "Signatures")
      for (const name of ["Personal", "Work"]) {
        const row = signatures.getByRole("group", { name, exact: true })
        ensure(/No signature/.test(await row.textContent()), `${name}'s signature row does not say No signature`)
        ensure(await row.getByRole("button", { name: "Edit", exact: true }).isVisible(), `${name}'s signature row has no EDIT`)
      }
      const templates = region(page, "Templates")
      ensure(/01/.test(await templates.getByRole("heading").innerText()), "TEMPLATES does not count 01")
      ensure(await templates.getByRole("button", { name: "New template", exact: true }).isVisible(), "TEMPLATES has no NEW TEMPLATE")
      ensure(await templates.getByRole("button", { name: "Thanks, will reply soon", exact: true }).isVisible(), "the demo's template has no row")
    },
  },
  {
    // EDIT opens the form layer with the rich-text field and its format bar; SAVE keeps it, and the row
    // shows its first line. Opened again, the form holds what was saved (the picture).
    name: "settings-signature-edit",
    sizes: ["desktop", "phone", "medium"],
    sean: { kind: "undrawn", area: "settings", screen: "signature-edit" },
    run: async (app) => {
      const { page } = app
      await settings(app, "Signatures and templates")
      const row = () => region(page, "Signatures").getByRole("group", { name: "Personal", exact: true })
      const open = async () => {
        await press(app, row().getByRole("button", { name: "Edit", exact: true }))
        return page.getByRole("dialog", { name: /Signature/ })
      }
      let form = await open()
      ensure(/Personal/.test(await form.innerText()), "the signature form does not name the account")
      const text = form.getByRole("textbox", { name: "Signature for me@personal.example" })
      await text.click()
      await page.keyboard.type("Robin Ash")
      await page.keyboard.press("Enter")
      await page.keyboard.type("Ash and Oak Studio · +1 503 555 0142")
      await formatBar(app, form, ["Bold", "Italic", "Link", "Bulleted list", "Numbered list", "Quote", "Code"])
      await press(app, formPrimary(form, "Save"))
      await form.waitFor({ state: "detached" })
      await app.settle()
      ensure(/Robin Ash/.test(await row().textContent()), "the row does not show the signature's first line")
      ensure(!/Studio/.test(await row().textContent()), "the row shows more than the first line")
      form = await open()
      ensure(/Ash and Oak Studio/.test(await form.innerText()), "the form does not hold the saved signature")
      await page.mouse.move(0, 0)
    },
  },
  {
    // A template's form (brief T3): NAME, SUBJECT ("Fills an empty subject."), the text, SAVE TEMPLATE.
    name: "settings-template-form",
    sizes: ["desktop", "phone", "medium"],
    sean: { kind: "undrawn", area: "settings", screen: "template-form" },
    run: async (app) => {
      const { page } = app
      await settings(app, "Signatures and templates")
      await press(app, region(page, "Templates").getByRole("button", { name: "New template", exact: true }))
      const form = page.getByRole("dialog", { name: /New template/ })
      ensure(await form.getByText("Fills an empty subject.").isVisible(), "SUBJECT has no helper")
      ensure(await formPrimary(form, "Save template").isDisabled(), "SAVE TEMPLATE works without a name")
      await form.getByRole("textbox", { name: "Name" }).fill("Invoice reminder")
      await form.getByRole("textbox", { name: "Subject" }).fill("Invoice 0142 is due Friday")
      await form.getByRole("textbox", { name: "Template text" }).click()
      await page.keyboard.type("Hi, a quick note that invoice 0142 is due on Friday. Thanks for sorting it.")
      ensure(await formPrimary(form, "Save template").isEnabled(), "SAVE TEMPLATE stays off with a name")
      await page.mouse.move(0, 0)
    },
  },
  {
    // A template saved from its form shows in the list with its subject; its menu's DELETE raises
    // "Deleted {name}" with UNDO, and UNDO brings it back (cross-app decisions §10).
    name: "settings-template-delete",
    run: async (app) => {
      const { page } = app
      await settings(app, "Signatures and templates")
      const templates = region(page, "Templates")
      await press(app, templates.getByRole("button", { name: "New template", exact: true }))
      const form = page.getByRole("dialog", { name: /New template/ })
      await form.getByRole("textbox", { name: "Name" }).fill("Invoice reminder")
      await form.getByRole("textbox", { name: "Subject" }).fill("Invoice 0142 is due Friday")
      await form.getByRole("textbox", { name: "Template text" }).click()
      await page.keyboard.type("Hi, a quick note that invoice 0142 is due on Friday.")
      await press(app, formPrimary(form, "Save template"))
      await form.waitFor({ state: "detached" })
      await app.settle()
      const row = () => templates.getByRole("button", { name: "Invoice reminder", exact: true })
      ensure(await row().isVisible(), "the saved template has no row")
      ensure(/Invoice 0142 is due Friday/.test(await templates.innerText()), "the row does not show the subject")
      ensure(/02/.test(await templates.getByRole("heading").innerText()), "TEMPLATES does not count 02")
      await press(app, templates.getByRole("button", { name: /More actions.*Invoice reminder/ }))
      await press(app, page.getByRole("menuitem", { name: "Delete", exact: true }))
      ensure(!(await row().count()), "DELETE left the row")
      const toast = page.locator("[data-sonner-toast]").filter({ hasText: "Deleted Invoice reminder" })
      ensure(await toast.isVisible(), "no toast Deleted Invoice reminder")
      await press(app, toast.getByRole("button", { name: "Undo", exact: true }))
      await row().waitFor()
      ensure(/Invoice 0142 is due Friday/.test(await templates.innerText()), "UNDO did not bring the template back with its subject")
      await page.mouse.move(0, 0)
    },
  },
  {
    // Mail (brief T2): READING, REPLYING, SENDING, CHECKING and SCREENER. Undo send is a fact with no
    // action (W4); there is no Notify for (W4) and no Summaries switch (W6).
    name: "settings-mail",
    sizes: ["desktop", "phone", "medium"],
    sean: { kind: "undrawn", area: "settings", screen: "mail" },
    run: (app) => settings(app, "Mail"),
    assert: async ({ page }) => {
      for (const group of ["Reading", "Replying", "Sending", "Checking", "Screener"]) ensure(await region(page, group).count(), `Mail has no ${group} group`)
      const images = page.getByRole("radiogroup", { name: "Remote images" })
      ensure((await images.getByRole("radio").count()) === 3 && (await images.getByRole("radio", { name: "Ask" }).isChecked()), "Remote images is not three choices on Ask")
      ensure(await page.getByRole("radiogroup", { name: "Mark as read" }).getByRole("radio", { name: "On open" }).isChecked(), "Mark as read is not on On open")
      const undo = region(page, "Sending").getByRole("group", { name: "Undo send" })
      ensure(/10 seconds/.test(await undo.textContent()) && !(await undo.getByRole("button").count()), "Undo send is not the fact 10 seconds")
      ensure(/Every 2 minutes/.test(await region(page, "Checking").textContent()), "Check for new mail does not read Every 2 minutes")
      ensure(!(await page.getByText(/Notify for|Summaries/).count()), "Mail shows a row it has no setting for")
      ensure(!(await page.locator("[data-sonner-toast]").count()), "Mail raised a toast")
    },
  },
  {
    // Each Mail row changes its real setting and the change outlives a reload (brief T2): the demo
    // keeps what was saved in this tab, as the core keeps it on disk (scenario settings-kept).
    name: "settings-mail-kept",
    scenario: "settings-kept",
    sizes: ["desktop", "phone"],
    run: async (app) => {
      const { page } = app
      await settings(app, "Mail")
      await press(app, page.getByRole("radiogroup", { name: "Remote images" }).getByRole("radio", { name: "From contacts" }))
      const mark = page.getByRole("radiogroup", { name: "Mark as read" })
      await press(app, mark.getByRole("radio", { name: "After 3 s" }))
      ensure(/A glance doesn't count\./.test(await page.getByRole("group", { name: "Mark as read" }).textContent()), "After 3 s does not show its line")
      await press(app, page.getByRole("switch", { name: "Write below the quote" }))
      await press(app, page.getByRole("switch", { name: "Ask for read receipts" }))
      await press(app, region(page, "Checking").getByRole("button", { name: "Change", exact: true }))
      await press(app, page.getByRole(app.phone ? "radio" : "menuitemradio", { name: "Every 15 minutes" }).last())
      await press(app, page.getByRole("switch", { name: "Screener", exact: true }))
      // Quote off turns Write below the quote off, with its reason.
      await press(app, page.getByRole("switch", { name: "Quote the message" }))
      ensure(await page.getByText("Needs Quote the message.").isVisible(), "Write below the quote does not say why it is off")
      ensure(!(await page.locator("[data-sonner-toast]").count()), "a saved setting raised a toast")
      await reload(app)
      await settings(app, "Mail")
    },
    assert: async ({ page }) => {
      ensure(await page.getByRole("radiogroup", { name: "Remote images" }).getByRole("radio", { name: "From contacts" }).isChecked(), "Remote images did not survive a reload")
      ensure(await page.getByRole("radiogroup", { name: "Mark as read" }).getByRole("radio", { name: "After 3 s" }).isChecked(), "Mark as read did not survive a reload")
      ensure(!(await page.getByRole("switch", { name: "Quote the message" }).isChecked()), "Quote the message did not survive a reload")
      ensure(await page.getByRole("switch", { name: "Ask for read receipts" }).isChecked(), "Ask for read receipts did not survive a reload")
      ensure(/Every 15 minutes/.test(await region(page, "Checking").textContent()), "Check for new mail did not survive a reload")
      ensure(await page.getByRole("switch", { name: "Screener", exact: true }).isChecked(), "the Screener did not survive a reload")
    },
  },
  {
    // SENDERS YOU DECIDED (brief T2): a count; one or two tags; the trailing way back; a second decision
    // in the row's menu. LET IN AGAIN takes the row away and the count follows.
    name: "settings-senders-decided",
    scenario: "senders-decided",
    sizes: ["desktop", "phone", "medium"],
    sean: { kind: "undrawn", area: "settings", screen: "senders" },
    run: async (app) => {
      const { page } = app
      await settings(app, "Mail")
      const list = region(page, "Senders you decided")
      ensure(/04/.test(await list.getByRole("heading").innerText()), "SENDERS YOU DECIDED does not count 04")
      const text = await list.innerText()
      for (const tag of ["Screened out", "Blocked", "Always in People", "Always in Updates"]) ensure(new RegExp(tag, "i").test(text), `no sender is tagged ${tag}`)
      ensure(await list.getByRole("button", { name: /^Unblock, / }).isVisible(), "the blocked sender has no UNBLOCK")
      ensure(await list.getByRole("button", { name: /^Reset category, / }).isVisible(), "the sender in People has no RESET CATEGORY")
      // The sender with two decisions: LET IN AGAIN, and RESET CATEGORY in its menu.
      await press(app, list.getByRole("button", { name: /More actions.*Design Systems Weekly/ }))
      ensure(await page.getByRole("menuitem", { name: "Reset category", exact: true }).isVisible(), "the second decision is not in the row's menu")
      await page.keyboard.press("Escape")
      await app.settle()
      await press(app, list.getByRole("button", { name: /^Let in again, (Riley Growth|hi@growth\.example)/ }))
      await page.waitForFunction(() => !document.querySelector('[aria-label="Senders you decided"]')?.textContent?.includes("hi@growth.example"))
      await app.settle()
      ensure(/03/.test(await list.getByRole("heading").innerText()), "the count did not follow LET IN AGAIN")
      await page.mouse.move(0, 0)
    },
  },
  {
    // Calendar (brief T4): CALLS, MENU BAR (not on a gateway) and TIME, with WEEK STARTS a fact from the
    // device's region (Sunday in en-US). No week numbers and no default alert (W4).
    name: "settings-calendar",
    sizes: ["desktop", "phone", "medium"],
    sean: { kind: "undrawn", area: "settings", screen: "calendar" },
    run: (app) => settings(app, "Calendar"),
    assert: async ({ page }) => {
      for (const group of ["Calls", "Menu bar", "Time"]) ensure(await region(page, group).count(), `Calendar has no ${group} group`)
      ensure(await page.getByRole("switch", { name: "Calls open in their apps" }).isChecked(), "Calls open in their apps is not on")
      ensure(await page.getByRole("switch", { name: "Show what's next" }).isChecked(), "Show what's next is not on")
      const week = page.getByRole("group", { name: "Week starts" })
      ensure(/Sunday/.test(await week.textContent()) && !(await week.getByRole("button").count()), "Week starts is not the fact Sunday")
      ensure(!(await page.getByText(/Week numbers|Default alert/).count()), "Calendar shows a row it has no setting for")
    },
  },
  {
    // Calendar's switches change their settings and outlive a reload; Show what's next needs the menu
    // bar and says so. A failed save returns the switch with its line (scenario settings-save-fails).
    name: "settings-calendar-kept",
    scenario: "settings-kept",
    sizes: ["desktop"],
    run: async (app) => {
      const { page } = app
      await settings(app, "Calendar")
      await press(app, page.getByRole("switch", { name: "Calls open in their apps" }))
      await press(app, page.getByRole("switch", { name: "Calendar in the menu bar" }))
      ensure(await page.getByText("Needs Calendar in the menu bar.").isVisible(), "Show what's next does not say why it is off")
      await reload(app)
      await settings(app, "Calendar")
      ensure(!(await page.getByRole("switch", { name: "Calls open in their apps" }).isChecked()), "Calls open in their apps did not survive a reload")
      ensure(!(await page.getByRole("switch", { name: "Calendar in the menu bar" }).isChecked()), "Calendar in the menu bar did not survive a reload")
      await press(app, page.getByRole("switch", { name: "Calendar in the menu bar" }))
      ensure(await page.getByRole("switch", { name: "Show what's next" }).isChecked(), "Show what's next lost its own setting")
    },
  },
  {
    // A failed save in Calendar and Notifications: the control returns, one line under its row (brief T0).
    name: "settings-calendar-save-failed",
    scenario: "settings-save-fails",
    sizes: ["desktop"],
    run: async (app) => {
      const { page } = app
      await settings(app, "Calendar")
      const calls = page.getByRole("switch", { name: "Calls open in their apps" })
      await press(app, calls)
      ensure(await calls.isChecked(), "Calls open in their apps did not return to on")
      ensure(/read-only on this computer/.test(await region(page, "Calls").locator('[data-slot="save-failed"]').innerText()), "no line under Calls open in their apps")
      ensure(!(await page.locator("[data-sonner-toast]").count()), "a failed save raised a toast")
    },
  },
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
      // The Day as hours (ADR-0098: cards by default, an Hours switch).
      await calendarView(app, "Day")
      await calendarHours(app, true)
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
  {
    // Shortcuts and gestures (brief T6): the picture of the four tiles as set (no words, hidden from screen readers),
    // a row per tile with CHANGE, KEYS IN MAIL and KEYS IN CALENDAR with a key button per command, THESE DON'T
    // CHANGE as facts, and RESET KEYS off with its reason until a key differs.
    name: "settings-shortcuts",
    sizes: ["desktop", "phone", "medium"],
    sean: { kind: "undrawn", area: "settings", screen: "shortcuts" },
    run: (app) => settings(app, "Shortcuts and gestures"),
    assert: async ({ page }) => {
      const swipes = region(page, "Swipes in the mail list")
      const picture = swipes.locator("[inert]")
      ensure((await picture.getAttribute("aria-hidden")) === "true", "the swipe picture is not hidden from screen readers")
      ensure((await picture.locator('[data-slot="swipe-action"]').count()) === 2, "the picture does not show the demo's two tiles, Read and Archive")
      for (const [label, value] of [["Leading", "Read / unread"], ["Trailing, outer", "Archive"], ["Trailing, middle", "Nothing"], ["Trailing, inner", "Nothing"]]) {
        const row = swipes.getByRole("group", { name: label, exact: true })
        ensure((await row.textContent()).includes(value), `${label} does not read ${value}`)
        ensure(await row.getByRole("button", { name: "Change", exact: true }).isVisible(), `${label} has no CHANGE`)
      }
      ensure(/A full swipe runs it\./.test(await swipes.getByRole("group", { name: "Trailing, outer", exact: true }).textContent()), "the outer tile does not say a full swipe runs it")
      ensure(await region(page, "Keys in Mail").getByRole("button", { name: "Change the key for Archive, or back to the inbox" }).isVisible(), "Archive has no key button")
      ensure(await region(page, "Keys in Mail").getByRole("button", { name: "Add a key for Snooze until next week" }).isVisible(), "a command with no key has no ADD KEY")
      ensure(await region(page, "Keys in Calendar").getByRole("button", { name: "Change the key for Go to today" }).isVisible(), "Go to today has no key button")
      const facts = region(page, "These don't change")
      ensure((await facts.getByRole("group").count()) === 7, `THESE DON'T CHANGE lists ${await facts.getByRole("group").count()} keys, not seven`)
      ensure(!(await facts.getByRole("button").count()), "a fixed key can be changed")
      const reset = page.getByRole("button", { name: "Reset keys", exact: true })
      ensure((await reset.getAttribute("aria-disabled")) === "true", "RESET KEYS is on with nothing changed")
      ensure(await page.getByText("Nothing differs from the defaults.").isVisible(), "RESET KEYS does not say why it is off")
      ensure(await page.getByText("Keys follow you to every device on your account.").isVisible(), "the caption is missing")
    },
  },
  {
    // A key, remapped (brief T6): ARCHIVE to X saves silently; then S, Star's key, for Next conversation swaps the two,
    // and the toast names the other command. RESET KEYS turns on. The picture: a key button waiting, "Press a key…".
    name: "settings-shortcuts-capture",
    sizes: ["desktop", "phone"],
    sean: { kind: "undrawn", area: "settings", screen: "shortcuts-capture" },
    run: async (app) => {
      const { page } = app
      await settings(app, "Shortcuts and gestures")
      const mail = region(page, "Keys in Mail")
      // The key button: the first control in the command's row (its menu, when it has a key, comes after).
      const keyOf = (does) => mail.getByRole("group", { name: does, exact: true }).getByRole("button").first()
      await press(app, keyOf("Archive, or back to the inbox"))
      ensure(/press a key/i.test(await keyOf("Archive, or back to the inbox").innerText()), "the key button does not wait for a key")
      await page.keyboard.press("x")
      await app.settle()
      ensure((await keyOf("Archive, or back to the inbox").innerText()).trim() === "X", "Archive's key is not X")
      ensure(!(await page.locator("[data-sonner-toast]").count()), "a key with no clash raised a toast")
      await press(app, keyOf("Next conversation"))
      await page.keyboard.press("s")
      await app.settle()
      const toast = page.locator("[data-sonner-toast]").filter({ hasText: "Swapped with Star or unstar" })
      await toast.waitFor()
      ensure((await keyOf("Next conversation").innerText()).trim() === "S", "Next conversation did not take S")
      ensure((await keyOf("Star or unstar").innerText()).trim() === "J", "Star did not take Next conversation's J")
      await toastGone(app)
      // Esc gives up a capture and keeps the key.
      await press(app, keyOf("Mark unread"))
      await page.keyboard.press("Escape")
      await app.settle()
      ensure((await keyOf("Mark unread").innerText()).trim() === "U", "Esc did not keep Mark unread's key")
      ensure(await page.getByRole("button", { name: "Reset keys", exact: true }).isEnabled(), "RESET KEYS stays off with keys changed")
      await press(app, keyOf("Snooze until tomorrow"))
      await page.mouse.move(0, 0)
    },
  },
  {
    // Swipes and keys outlive a reload (scenario settings-kept): the inner tile set to Star from its menu, Archive on X,
    // and the picture shows the new tile. REMOVE in a key row's menu leaves ADD KEY. RESET KEYS brings the defaults back.
    name: "settings-shortcuts-kept",
    scenario: "settings-kept",
    sizes: ["desktop", "phone"],
    run: async (app) => {
      const { page } = app
      await settings(app, "Shortcuts and gestures")
      const swipes = region(page, "Swipes in the mail list")
      await press(app, swipes.getByRole("group", { name: "Trailing, inner", exact: true }).getByRole("button", { name: "Change", exact: true }))
      await press(app, page.getByRole(app.phone ? "radio" : "menuitemradio", { name: "Star", exact: true }).last())
      const mail = region(page, "Keys in Mail")
      await press(app, mail.getByRole("button", { name: "Change the key for Archive, or back to the inbox" }))
      await page.keyboard.press("x")
      await app.settle()
      await press(app, mail.getByRole("group", { name: "Mark unread", exact: true }).getByRole("button", { name: /^More actions/ }))
      await press(app, page.getByRole(app.phone ? "button" : "menuitem", { name: "Remove", exact: true }).last())
      ensure(await mail.getByRole("button", { name: "Add a key for Mark unread" }).isVisible(), "REMOVE left a key on Mark unread")
      ensure(!(await page.locator("[data-sonner-toast]").count()), "a change raised a toast")
      await reload(app)
      await settings(app, "Shortcuts and gestures")
      ensure((await region(page, "Swipes in the mail list").getByRole("group", { name: "Trailing, inner", exact: true }).textContent()).includes("Star"), "the inner tile did not survive a reload")
      ensure((await region(page, "Swipes in the mail list").locator('[inert] [data-slot="swipe-action"]').count()) === 3, "the picture does not show the third tile")
      ensure((await region(page, "Keys in Mail").getByRole("button", { name: "Change the key for Archive, or back to the inbox" }).innerText()).trim() === "X", "Archive's key did not survive a reload")
      ensure(await region(page, "Keys in Mail").getByRole("button", { name: "Add a key for Mark unread" }).isVisible(), "the removed key came back after a reload")
      await press(app, page.getByRole("button", { name: "Reset keys", exact: true }))
      const toast = page.locator("[data-sonner-toast]").filter({ hasText: "Keys reset to the defaults" })
      await toast.waitFor()
      ensure((await region(page, "Keys in Mail").getByRole("button", { name: "Change the key for Archive, or back to the inbox" }).innerText()).trim() === "E", "RESET KEYS did not bring E back")
      await press(app, toast.getByRole("button", { name: "Undo", exact: true }))
      ensure((await region(page, "Keys in Mail").getByRole("button", { name: "Change the key for Archive, or back to the inbox" }).innerText()).trim() === "X", "UNDO did not bring the keys back")
      await page.mouse.move(0, 0)
    },
  },
  {
    // AI summaries and replies (brief T7): the caption first, MODEL RUNS as four RadioRows, Off chosen; nothing else.
    name: "settings-ai",
    sizes: ["desktop", "phone", "medium"],
    sean: { kind: "undrawn", area: "settings", screen: "ai" },
    run: (app) => settings(app, "AI summaries and replies"),
    assert: async ({ page }) => {
      ensure(await page.getByText("Off unless you turn it on. A conversation goes to the model only when you ask for its summary or replies.").isVisible(), "the caption is missing")
      const runs = page.getByRole("radiogroup", { name: "Model runs" })
      ensure((await runs.getByRole("radio").count()) === 4, "MODEL RUNS is not four choices")
      ensure(await runs.getByRole("radio", { name: "Off" }).isChecked(), "Off is not chosen")
      ensure(!(await page.getByRole("group", { name: "Connection" }).count()), "a connection row shows while AI is off")
      ensure(!(await page.getByRole("switch", { name: /Summaries/ }).count()), "the drawn Summaries switch is built (W6)")
    },
  },
  {
    // Claude with your key (brief T7): API KEY is write-only with SAVE; saved, the row says where it is with REPLACE
    // and REMOVE, MODEL is a menu of what the service lists, and the connection says Connected. No toast.
    name: "settings-ai-key",
    sizes: ["desktop", "phone"],
    sean: { kind: "undrawn", area: "settings", screen: "ai-key" },
    run: async (app) => {
      const { page } = app
      await settings(app, "AI summaries and replies")
      await press(app, page.getByRole("radiogroup", { name: "Model runs" }).getByRole("radio", { name: "Claude, with your API key" }))
      const connection = () => page.getByRole("group", { name: "Connection" })
      ensure(/Add your API key first\./.test(await connection().textContent()), "the connection does not ask for the key first")
      const key = page.getByRole("form", { name: "API key" })
      await key.getByLabel("API key").fill("sk-ant-api03-demo-key-0042")
      await press(app, key.getByRole("button", { name: "Save", exact: true }))
      const saved = page.getByRole("group", { name: "API key" })
      ensure(/Saved in your system keychain/.test(await saved.textContent()), "the saved key's row does not say where it is")
      for (const name of ["Replace", "Remove"]) ensure(await saved.getByRole("button", { name, exact: true }).isVisible(), `the saved key has no ${name}`)
      ensure(!(await page.getByText("sk-ant-api03-demo-key-0042").count()), "the key is shown back")
      const model = page.getByRole("group", { name: "Model" })
      ensure(/claude-opus-5-5/.test(await model.textContent()) && (await model.getByRole("button", { name: "Change", exact: true }).isVisible()), "MODEL is not the listed model with CHANGE")
      ensure(/Connected\./.test(await connection().textContent()), "the connection does not say Connected.")
      ensure(!(await page.locator("[data-sonner-toast]").count()), "saving the key raised a toast")
      // REMOVE asks first, focus on Cancel.
      await press(app, saved.getByRole("button", { name: "Remove", exact: true }))
      ensure(await page.getByRole("dialog", { name: /Remove the API key\?/ }).isVisible(), "REMOVE did not ask")
      ensure((await page.evaluate(() => document.activeElement?.textContent?.trim())) === "Cancel", "focus is not on Cancel")
      await page.keyboard.press("Escape")
      await app.settle()
      await page.mouse.move(0, 0)
      await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
    },
  },
  {
    // A model server on this computer (brief T7): SERVER ADDRESS with its helper, MODEL with what it lists, Connected.
    // The choice outlives a reload (scenario settings-kept).
    name: "settings-ai-kept",
    scenario: "settings-kept",
    sizes: ["desktop"],
    run: async (app) => {
      const { page } = app
      await settings(app, "AI summaries and replies")
      await press(app, page.getByRole("radiogroup", { name: "Model runs" }).getByRole("radio", { name: "On this computer" }))
      ensure(await page.getByRole("textbox", { name: "Server address" }).isVisible(), "no SERVER ADDRESS")
      await press(app, page.getByRole("group", { name: "Model" }).getByRole("button", { name: "Change", exact: true }))
      await press(app, page.getByRole("menuitemradio", { name: "qwen3:8b" }))
      await reload(app)
      await settings(app, "AI summaries and replies")
      ensure(await page.getByRole("radiogroup", { name: "Model runs" }).getByRole("radio", { name: "On this computer" }).isChecked(), "the choice did not survive a reload")
      ensure(/qwen3:8b/.test(await page.getByRole("group", { name: "Model" }).textContent()), "the model did not survive a reload")
      ensure(/Connected\./.test(await page.getByRole("group", { name: "Connection" }).textContent()), "the connection does not say Connected.")
      await page.mouse.move(0, 0)
    },
  },
  {
    // Settings › Notes (brief T5): SYNC (Off, SET UP; encryption Off with its reason), READING's two switches, MOVING's
    // IMPORT and EXPORT. Everything the Notes More menu held. A team member has no Notes section (settings-member).
    name: "settings-notes",
    sizes: ["desktop", "phone", "medium"],
    sean: { kind: "undrawn", area: "settings", screen: "notes" },
    run: (app) => settings(app, "Notes"),
    assert: async ({ page }) => {
      const sync = region(page, "Sync")
      const row = (name) => page.getByRole("group", { name, exact: true })
      ensure(/Off/.test(await row("Sync between devices").textContent()) && (await row("Sync between devices").getByRole("button", { name: "Set up", exact: true }).isVisible()), "SYNC BETWEEN DEVICES is not Off with SET UP")
      ensure(/Off/.test(await sync.getByRole("group", { name: "End-to-end encryption" }).textContent()), "END-TO-END ENCRYPTION is not Off")
      ensure(await page.getByText("Needs sync between devices.").isVisible(), "TURN ON does not say why it is off")
      ensure(await page.getByRole("switch", { name: "Find text in images" }).isChecked() && (await page.getByText("Read on this device.").isVisible()), "Find text in images is not on with its line")
      ensure(await page.getByRole("switch", { name: "Move checked items down" }).isChecked(), "Move checked items down is not on")
      ensure(/Apple Notes, Google Keep, Markdown/.test(await row("Import").textContent()), "IMPORT does not name its sources")
      ensure(/All notes as Markdown/.test(await row("Export").textContent()), "EXPORT does not say what it saves")
    },
  },
  {
    // The two switches outlive a reload (scenario settings-kept), and save without a toast.
    name: "settings-notes-kept",
    scenario: "settings-kept",
    sizes: ["desktop"],
    run: async (app) => {
      const { page } = app
      await settings(app, "Notes")
      await press(app, page.getByRole("switch", { name: "Find text in images" }))
      await press(app, page.getByRole("switch", { name: "Move checked items down" }))
      ensure(!(await page.locator("[data-sonner-toast]").count()), "a switch raised a toast")
      await reload(app)
      await settings(app, "Notes")
      ensure(!(await page.getByRole("switch", { name: "Find text in images" }).isChecked()), "Find text in images did not survive a reload")
      ensure(!(await page.getByRole("switch", { name: "Move checked items down" }).isChecked()), "Move checked items down did not survive a reload")
    },
  },
  {
    // Set up sync (brief T5) in the form layer: its parts, Esc, Discard changes?, and Ctrl+Enter's TURN ON SYNC; the
    // row then reads Connecting… with CHANGE, and after a reload too. The picture: the form again, now SAVE and TURN OFF SYNC.
    name: "settings-sync-setup",
    sizes: ["desktop", "phone"],
    sean: { kind: "undrawn", area: "settings", screen: "sync-setup" },
    run: async (app) => {
      const { page } = app
      await settings(app, "Notes")
      const row = () => page.getByRole("group", { name: "Sync between devices", exact: true })
      const open = async () => {
        await press(app, row().getByRole("button", { name: /^(Set up|Change)$/ }))
        return page.getByRole("dialog", { name: /Sync between devices/ })
      }
      await formLayer(app, {
        open,
        write: async (form) => {
          await form.getByRole("textbox", { name: "Relay address" }).fill("ws://localhost:1")
          await form.getByLabel("Access token").fill("relay-token-from-the-demo-0042")
        },
        primary: "Turn on sync",
      })
      ensure(/Connecting…/.test(await row().textContent()) && (await row().getByRole("button", { name: "Change", exact: true }).isVisible()), "the row does not read Connecting… with CHANGE")
      ensure(await page.getByRole("group", { name: "End-to-end encryption" }).getByRole("button", { name: "Turn on", exact: true }).isEnabled(), "TURN ON stays off with sync on")
      await reload(app)
      await settings(app, "Notes")
      ensure(await row().getByRole("button", { name: "Change", exact: true }).isVisible(), "sync did not survive a reload")
      const form = await open()
      ensure(await formPrimary(form, "Save").isVisible(), "the form has no SAVE once sync is on")
      ensure(await form.getByRole("button", { name: "Turn off sync", exact: true }).isVisible(), "the form has no TURN OFF SYNC")
      ensure((await form.getByRole("textbox", { name: "Relay address" }).inputValue()) === "ws://localhost:1", "the form does not hold the relay")
      await page.mouse.move(0, 0)
      await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
    },
  },
  {
    // openSyncSetup() (ADR-0111): the Notes banner's OPEN SYNC lands on Settings › Notes, its sync row giving the relay's words.
    name: "settings-sync-from-notes",
    scenario: "relay-error",
    sizes: ["desktop", "phone"],
    run: async (app) => {
      const { page } = app
      await area(app, "Notes")
      await press(app, page.locator('[data-slot="banner"]').filter({ hasText: "Notes didn't sync" }).getByRole("button", { name: "Open sync" }))
      ensure(await sectionShows(page, "Notes"), "OPEN SYNC did not open Settings › Notes")
      const row = page.getByRole("group", { name: "Sync between devices", exact: true })
      ensure(/The relay refused the token/.test(await row.textContent()), "the sync row does not give the relay's words")
    },
  },
  {
    // Turn on end-to-end encryption (brief T5): the question with its line and three consequences, the yes TURN ON,
    // focus on Cancel. A relay is set up and up to date (scenario notes-synced).
    name: "settings-encryption-confirm",
    scenario: "notes-synced",
    sizes: ["desktop", "phone"],
    sean: { kind: "undrawn", area: "settings", screen: "encryption" },
    run: async (app) => {
      const { page } = app
      await settings(app, "Notes")
      ensure(/Up to date/.test(await page.getByRole("group", { name: "Sync between devices", exact: true }).textContent()), "sync is not Up to date")
      await press(app, page.getByRole("group", { name: "End-to-end encryption" }).getByRole("button", { name: "Turn on", exact: true }))
    },
    assert: async ({ page }) => {
      const question = page.getByRole("dialog", { name: /Turn on end-to-end encryption\?/ })
      ensure(await question.isVisible(), "TURN ON did not ask")
      ensure(/Only your devices will be able to read your notes\./.test(await question.innerText()), "the question has no line")
      const lines = question.getByRole("listitem")
      ensure((await lines.count()) === 3, `the question lists ${await lines.count()} consequences, not three`)
      for (const [i, words] of ["You'll get a key.", "stop working", "deletes the readable copies"].entries()) ensure((await lines.nth(i).innerText()).includes(words), `consequence ${i + 1} does not say “${words}”`)
      ensure((await page.evaluate(() => document.activeElement?.textContent?.trim())) === "Cancel", "focus is not on Cancel")
      ensure(await question.getByRole("button", { name: "Turn on", exact: true }).isVisible(), "the yes is not TURN ON")
    },
  },
  {
    // TURN ON runs: the row reads On and the KEY row shows, hold to show and COPY; after a reload too.
    name: "settings-encryption-on",
    scenario: "notes-synced",
    sizes: ["desktop", "phone"],
    run: async (app) => {
      const { page } = app
      await settings(app, "Notes")
      await press(app, page.getByRole("group", { name: "End-to-end encryption" }).getByRole("button", { name: "Turn on", exact: true }))
      const question = page.getByRole("dialog", { name: /Turn on end-to-end encryption\?/ })
      await press(app, question.getByRole("button", { name: "Turn on", exact: true }))
      await question.waitFor({ state: "detached" })
      await app.settle()
      ensure(/On/.test(await page.getByRole("group", { name: "End-to-end encryption" }).textContent()), "encryption does not read On")
      ensure(!(await page.getByRole("group", { name: "End-to-end encryption" }).getByRole("button", { name: "Turn on", exact: true }).count()), "TURN ON stays once it is on")
      ensure(await page.getByRole("button", { name: /^Hold to show Key/ }).isVisible() && (await page.getByRole("button", { name: /^Copy Key/ }).isVisible()), "the KEY row has no hold to show and COPY")
      await reload(app)
      await settings(app, "Notes")
      ensure(await page.getByRole("button", { name: /^Copy Key/ }).isVisible(), "the key did not survive a reload")
      await page.mouse.move(0, 0)
    },
  },
  // "New mail on your phone" until ADR-0085 named it Notifications; the scene keeps its name so its pictures pair up.
  // Brief T8: the two choices, the phone's schedule chosen; nothing else until the relay is.
  {
    name: "settings-phone",
    run: (app) => settings(app, "Notifications"),
    assert: async ({ page }) => {
      const choices = page.getByRole("radiogroup", { name: "How new mail reaches this phone" })
      ensure(await choices.getByRole("radio", { name: "On the phone's schedule" }).isChecked(), "the phone's schedule is not chosen")
      ensure(!(await page.getByRole("button", { name: "Send a test" }).count()), "SEND A TEST shows without a relay")
    },
  },
  {
    // Brief T8 with the relay: RELAY ADDRESS, RELAY TOKEN, UNIFIEDPUSH ADDRESS (this browser has no push
    // service) and the primary CONNECT TO RELAY; then ACCOUNTS ON THE RELAY with their tags, SAVE, and
    // SEND A TEST with its toast. The choice outlives a reload; the phone's schedule saves at once.
    name: "settings-notifications-relay",
    scenario: "settings-kept",
    sizes: ["desktop", "phone", "medium"],
    sean: { kind: "undrawn", area: "settings", screen: "notifications" },
    run: async (app) => {
      const { page } = app
      await settings(app, "Notifications")
      const choices = () => page.getByRole("radiogroup", { name: "How new mail reaches this phone" })
      await press(app, choices().getByRole("radio", { name: "Instant, through your relay" }))
      const form = page.getByRole("form", { name: "Relay" })
      await form.getByRole("textbox", { name: "Relay address" }).fill("https://push.ash-home.example")
      await form.getByLabel("Relay token").fill("relay-token-from-the-demo-0042")
      await form.getByRole("textbox", { name: "UnifiedPush address" }).fill("https://ntfy.sh/vale-ash-7f3k")
      await press(app, form.getByRole("button", { name: "Connect to relay", exact: true }))
      await region(page, "Accounts on the relay").waitFor()
      ensure(await form.getByText("Saved. Leave empty to keep it.").isVisible(), "the token's helper does not say it is saved")
      ensure(await form.getByRole("button", { name: "Save", exact: true }).isVisible(), "CONNECT TO RELAY did not become SAVE")
      await press(app, page.getByRole("button", { name: "Send a test", exact: true }))
      ensure(await page.locator("[data-sonner-toast]").filter({ hasText: "Test sent" }).isVisible(), "SEND A TEST raised no Test sent")
      await toastGone(app)
      await reload(app)
      await settings(app, "Notifications")
      ensure(await choices().getByRole("radio", { name: "Instant, through your relay" }).isChecked(), "the relay did not survive a reload")
      // The picture: the relay connected.
      await page.mouse.move(0, 0)
      await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
    },
    assert: async ({ page }) => {
      const accounts = region(page, "Accounts on the relay")
      ensure(/02/.test(await accounts.getByRole("heading").innerText()), "ACCOUNTS ON THE RELAY does not count 02")
      ensure((await accounts.getByText("Instant", { exact: true }).count()) === 2, "the accounts are not both INSTANT")
      ensure((await page.getByRole("button", { name: "Connect to relay" }).count()) === 0, "CONNECT TO RELAY shows once connected")
    },
  },
  {
    // Back to the phone's schedule: saved at once, the relay's rows go; a refused save returns the choice.
    name: "settings-notifications-schedule",
    scenario: "relay-connected",
    sizes: ["desktop"],
    run: async (app) => {
      const { page } = app
      await settings(app, "Notifications")
      await region(page, "Accounts on the relay").waitFor()
      await press(app, page.getByRole("radio", { name: "On the phone's schedule" }))
      ensure(!(await region(page, "Accounts on the relay").count()), "the relay's rows stay on the phone's schedule")
      ensure(!(await page.getByRole("form", { name: "Relay" }).count()), "the relay's form stays on the phone's schedule")
    },
  },
  {
    // Team members (brief T10): a row a person, the email in mono or "Owner (you)", NOT JOINED YET while
    // an invitation is out, NEW LINK for a member, REMOVE in the row's menu, and ADD MEMBER (secondary).
    name: "settings-team-members",
    scenario: "gateway-owner",
    sizes: ["desktop", "phone", "medium"],
    sean: { kind: "undrawn", area: "settings", screen: "team-members" },
    run: async (app) => {
      await settings(app, "Team members")
      await region(app.page, "People").waitFor()
      await app.page.mouse.move(0, 0)
    },
    assert: async ({ page }) => {
      const people = region(page, "People")
      ensure((await people.getByRole("listitem").count()) === 4, "Team members does not list the four people")
      const owner = people.getByRole("group", { name: "Me", exact: true })
      ensure(/Owner \(you\)/.test(await owner.textContent()), "the owner's row does not say Owner (you)")
      ensure(!(await owner.getByRole("button", { name: "New link", exact: true }).count()), "the owner's row offers NEW LINK")
      const priya = people.getByRole("group", { name: "Priya Raman", exact: true })
      ensure(/priya@studio\.example/.test(await priya.textContent()) && /not joined yet/i.test(await priya.textContent()), "a pending member's row has no email or NOT JOINED YET")
      ensure(await priya.getByRole("button", { name: "New link", exact: true }).isVisible(), "a member's row has no NEW LINK")
      ensure(!/not joined yet/i.test(await people.getByRole("group", { name: "Sam Okafor", exact: true }).textContent()), "a joined member is tagged NOT JOINED YET")
      const add = button(page, "Add member")
      ensure((await add.getAttribute("data-variant")) === "secondary", "ADD MEMBER is not secondary")
      ensure(!(await region(page, "Team members").locator('[data-slot="button"][data-variant="default"]').count()), "Team members has a primary of its own")
    },
  },
  {
    // ADD MEMBER: NAME · EMAIL · CREATE INVITATION in the form layer; then the link, once, with COPY LINK.
    name: "settings-team-invite",
    scenario: "gateway-owner",
    sizes: ["desktop", "phone"],
    run: async (app) => {
      const { page } = app
      await settings(app, "Team members")
      await press(app, button(page, "Add member"))
      const form = page.getByRole("dialog", { name: /Add member/ })
      ensure(await form.isVisible(), "ADD MEMBER did not open the form")
      await form.getByRole("textbox", { name: "Name" }).fill("Ana Duarte")
      await form.getByRole("textbox", { name: "Email" }).fill("ana@example.com")
      await press(app, form.getByRole("button", { name: "Create invitation", exact: true }))
    },
    assert: async ({ page }) => {
      const layer = page.getByRole("dialog", { name: /Ana Duarte/ })
      ensure(await layer.isVisible(), "the invitation does not show once it is made")
      const link = layer.getByRole("group", { name: "Invitation link", exact: true })
      ensure(/\/join#demo-invitation-/.test(await link.textContent()), "INVITATION LINK does not show the link")
      ensure(await link.getByRole("button", { name: "Copy link", exact: true }).isVisible(), "INVITATION LINK has no COPY LINK")
      ensure(await layer.getByText("Works once, for 7 days. It won't show again.").isVisible(), "the link's caption is missing")
    },
  },
  {
    // REMOVE asks first (decisions §10), with focus on Cancel; the yes removes the person.
    name: "settings-team-remove",
    scenario: "gateway-owner",
    sizes: ["desktop", "phone"],
    run: async (app) => {
      const { page } = app
      await settings(app, "Team members")
      await press(app, page.getByRole("button", { name: "More actions for Sam Okafor" }))
      await press(app, page.getByRole("menuitem", { name: "Remove", exact: true }).or(page.getByRole("button", { name: "Remove", exact: true })).first())
    },
    assert: async ({ page }) => {
      const question = page.getByRole("dialog").filter({ hasText: "Remove Sam Okafor?" })
      ensure(await question.isVisible(), "REMOVE did not ask")
      ensure(/They're signed out now\. What's assigned to them goes back to nobody\./.test(await question.textContent()), "the question does not say what removing does")
      ensure((await page.evaluate(() => document.activeElement?.textContent?.trim())) === "Cancel", "focus is not on Cancel")
      ensure(await question.getByRole("button", { name: "Remove", exact: true }).isVisible(), "the yes does not repeat the verb")
    },
  },
  {
    // The yes takes them off the team: three people are left, and no toast says so.
    name: "settings-team-removed",
    scenario: "gateway-owner",
    sizes: ["desktop"],
    run: async (app) => {
      const { page } = app
      await settings(app, "Team members")
      await press(app, page.getByRole("button", { name: "More actions for Sam Okafor" }))
      await press(app, page.getByRole("menuitem", { name: "Remove", exact: true }))
      await press(app, page.getByRole("dialog").filter({ hasText: "Remove Sam Okafor?" }).getByRole("button", { name: "Remove", exact: true }))
      await page.getByRole("dialog").waitFor({ state: "detached" })
      await app.settle()
    },
    assert: async ({ page }) => {
      ensure((await region(page, "People").getByRole("listitem").count()) === 3, "the removed member is still listed")
      ensure(!(await page.getByRole("group", { name: "Sam Okafor", exact: true }).count()), "Sam Okafor is still on the team")
    },
  },
  {
    // About › This app (brief T12), on the desktop app with an update downloaded: VERSION, "{version}
    // is ready.", RESTART TO UPDATE in place of RELOAD APP, and the automatic check.
    name: "settings-about-app",
    scenario: "desktop-update-ready",
    sizes: ["desktop", "phone", "medium"],
    sean: { kind: "undrawn", area: "settings", screen: "about" },
    run: async (app) => {
      await about(app)
      await region(app.page, "This app").waitFor()
      await app.page.mouse.move(0, 0)
    },
    assert: async ({ page }) => {
      const group = region(page, "This app")
      ensure(/Vale 0\.1\.0-main\.20261104171200 · main channel/.test(await group.textContent()), "VERSION does not say Vale {version} and the channel")
      ensure(/0\.1\.0-main\.20261111090500 is ready\./.test(await group.textContent()), "the state line does not say the update is ready")
      ensure(await group.getByRole("button", { name: "Restart to update", exact: true }).isVisible(), "a ready update has no RESTART TO UPDATE")
      ensure(!(await group.getByRole("button", { name: "Reload app", exact: true }).count()), "RELOAD APP shows beside RESTART TO UPDATE")
      ensure(await group.getByRole("button", { name: "Check for updates", exact: true }).isVisible(), "About has no CHECK FOR UPDATES")
      ensure(await group.getByRole("switch", { name: "Check for updates automatically" }).isChecked(), "the automatic check is not on")
      // Nothing else in About competes with it: no other primary (unicron's row draws its actions as text; a gap in ADR-0112).
      ensure(!(await region(page, "About").locator('[data-slot="button"][data-variant="default"]').count()), "About has a primary beside RESTART TO UPDATE")
      ensure(!(await page.locator("[data-sonner-toast]").count()), "an update that is ready raised a toast")
    },
  },
  {
    // RESTART TO UPDATE: the demo opens again on the version that was ready, and the mark goes.
    name: "settings-about-restart",
    scenario: "desktop-update-ready",
    sizes: ["desktop"],
    run: async (app) => {
      await about(app)
      await press(app, region(app.page, "This app").getByRole("button", { name: "Restart to update", exact: true }))
    },
    assert: async ({ page }) => {
      const group = region(page, "This app")
      ensure(/Up to date\./.test(await group.textContent()), "after the restart the line does not say Up to date.")
      ensure(await group.getByRole("button", { name: "Reload app", exact: true }).isVisible(), "RELOAD APP does not come back")
      ensure((await sidebar(page).getByRole("button", { name: /^Settings(, |$)/ }).getAttribute("aria-label")) === "Settings", "the update mark stays after the restart")
    },
  },
  {
    // About › Server (brief T12), for the gateway's owner with the host helper and a newer image out:
    // UPDATE TO {version} is the one primary; RELOAD SERVER and CHECK FOR UPDATES are secondary.
    name: "settings-about-server",
    scenario: "gateway-owner",
    sizes: ["desktop", "phone", "medium"],
    sean: { kind: "undrawn", area: "settings", screen: "about-server" },
    run: async (app) => {
      await settings(app, "About")
      await region(app.page, "Server").waitFor()
      await app.page.mouse.move(0, 0)
    },
    assert: async ({ page }) => {
      const server = region(page, "Server")
      ensure(!(await region(page, "This app").count()), "a gateway's owner in a browser sees THIS APP")
      const version = server.getByRole("group", { name: "Version", exact: true })
      ensure(/0\.1\.0-main\.20261111090500 is out\./.test(await version.textContent()), "VERSION does not say the newer version is out")
      const primary = region(page, "About").locator('[data-slot="button"][data-variant="default"]')
      const words = await primary.evaluateAll((els) => els.map((el) => el.textContent.trim()))
      ensure(words.length === 1 && words[0] === "Update to 0.1.0-main.20261111090500", `About's primaries are ${JSON.stringify(words)}, not UPDATE TO {version} alone`)
      for (const name of ["Reload server", "Check for updates"]) ensure((await server.getByRole("button", { name, exact: true }).getAttribute("data-variant")) === "secondary", `${name} is not secondary`)
      ensure(await server.getByRole("group", { name: "Last checked", exact: true }).isVisible(), "About has no LAST CHECKED")
      ensure(await server.getByRole("switch", { name: "Check for updates automatically" }).isVisible(), "About has no automatic check")
      ensure(await server.getByText("At start and every six hours. It only looks.").isVisible(), "the automatic check does not say it only looks")
      ensure(!(await server.getByRole("group", { name: "Update command", exact: true }).count()), "UPDATE COMMAND shows with the host helper set up")
    },
  },
  {
    // With no host helper: no UPDATE TO, and UPDATE COMMAND with the command in mono and COPY.
    name: "settings-about-server-command",
    scenario: "gateway-no-helper",
    sizes: ["desktop", "phone"],
    run: async (app) => {
      await settings(app, "About")
      await region(app.page, "Server").waitFor()
      await app.page.mouse.move(0, 0)
    },
    assert: async ({ page }) => {
      const server = region(page, "Server")
      ensure(!(await server.getByRole("button", { name: /^Update to/ }).count()), "UPDATE TO shows without the host helper")
      ensure(!(await server.getByRole("button", { name: "Reload server", exact: true }).count()), "RELOAD SERVER shows without the host helper")
      const command = server.getByRole("group", { name: "Update command", exact: true })
      ensure(/docker compose pull/.test(await command.textContent()), "UPDATE COMMAND does not show the command")
      ensure(await command.getByRole("button", { name: "Copy", exact: true }).isVisible(), "UPDATE COMMAND has no COPY")
      ensure(await server.getByRole("link", { name: "Its install steps" }).isVisible(), "About does not say where the host helper's steps are")
    },
  },
  {
    // UPDATE TO: the line says the gateway goes away, the status says UPDATING SERVER, and when the
    // gateway is back it asks everyone to sign in: the door (brief X9).
    name: "settings-about-server-updating",
    scenario: "gateway-owner",
    sizes: ["desktop"],
    run: async (app) => {
      const { page } = app
      await settings(app, "About")
      await press(app, region(page, "Server").getByRole("button", { name: /^Update to/ }))
      ensure(await page.getByText("The gateway goes away for a moment. Everyone signs in again.").isVisible(), "UPDATE TO does not say the gateway goes away")
      ensure(await page.getByText(/^updating server$/i).first().isVisible(), "the status does not say UPDATING SERVER")
      await page.getByRole("main", { name: "Sign in" }).waitFor({ timeout: 20_000 })
      await app.settle()
    },
    assert: async ({ page }) => {
      ensure(await page.getByLabel("Gateway password", { exact: true }).isVisible(), "the gateway came back without its door")
    },
  },
  {
    // The update mark (DC12): on the sidebar's item, the rail's item and the phone's top-right button,
    // from the desktop app's own updater, and no toast.
    name: "settings-update-mark",
    scenario: "desktop-update-ready",
    sizes: ["desktop", "phone", "medium"],
    assert: async ({ page }) => {
      const name = await settingsButton(page).getAttribute("aria-label")
      ensure(/^Settings, Update ready$/.test(name ?? ""), `the way into Settings is named ${JSON.stringify(name)}, not "Settings, Update ready"`)
      ensure(!(await page.locator("[data-sonner-toast]").count()), "an update that is ready raised a toast")
    },
  },
]
