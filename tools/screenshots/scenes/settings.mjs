// Settings (ADR-0104): the page on unicron's SettingsFrame, each section the demo shows, Accounts.
import { area, button, ensure, formatBar, formPrimary, press, settingsButton, sidebar, toastGone } from "./helpers.mjs"

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
]
