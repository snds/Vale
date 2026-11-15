// Search as a place (ADR-0085, ADR-0096), the command menu (⌘K) and the keys list (`?`).
import { area, button, ensure, goBack, headTitle, press, sidebar, tabBar } from "./helpers.mjs"
import { lane } from "./mail.mjs"
import { settings } from "./settings.mjs"

/** The Search screen's field, whatever it is looking through. */
const field = (page) => page.getByRole("searchbox", { name: /^Search / })
const chips = (page) => page.getByRole("radiogroup", { name: "Search in" })
const chip = (page, name) => chips(page).getByRole("radio", { name: new RegExp(`^${name}( |$)`) })
const results = (page) => page.getByRole("region", { name: "Results" })
/** The rows of the results, mail, people and notes alike, and event cards. */
const rows = (page) => results(page).locator('[data-slot="list-row-main"], button:has(> [data-slot="calendar-event-bar"])')
/** What a result opens: Search's own detail column, or the screen it pushes on a phone. */
const opened = (page) => page.getByRole("region", { name: "Search: what is open" })
const onSearch = (page) => field(page).isVisible()

/** Opens Search by its button: the sidebar's or the rail's item, or the phone's search button. */
const open = async (app) => {
  await press(app, button(app.page, "Search"))
  await field(app.page).waitFor()
}
/** Types into Search and waits for the results to stand still. */
const type = async (app, words) => {
  await field(app.page).fill(words)
  await app.settle()
}
/** The pointer and the cursor leave what they last touched: no hover and no caret in the picture by chance. */
const rest = async (app) => {
  await app.page.mouse.move(0, 0)
  await app.settle()
}
/** A chip says its count once every row is in (brief X2): `Inbox 01`. */
const counted = async (page, name) => /\d{2,}$/.test(((await chip(page, name).textContent()) ?? "").trim())

/** Only Search says it is the current place: its item in the sidebar, or its button on a phone, where no tab is marked. */
const searchIsCurrent = async (app) => {
  const { page } = app
  // The breadcrumb's last part says so too, as a breadcrumb does; it is not a way to go anywhere.
  const current = page.locator('[aria-current="page"]:visible:not([data-slot="app-frame-crumbs"] *)')
  const names = await current.evaluateAll((els) => els.map((el) => el.getAttribute("aria-label") ?? el.textContent))
  ensure(names.length === 1 && /^Search/.test(names[0] ?? ""), `on Search, the current items are: ${names.join(" | ") || "none"}`)
  if (await tabBar(page).count()) ensure(!(await tabBar(page).getByRole("tab", { selected: true }).count()), "a tab is marked on Search")
}

/** Below the desktop's width a result is pushed over the results, not beside them. */
const pushes = (app) => app.size !== "desktop"

/** Opens a result, and checks it opened in Search: beside the results, or pushed over them. */
const openResult = async (app, n = 0) => {
  await press(app, rows(app.page).nth(n))
  ensure(await opened(app.page).isVisible(), "a result did not open in Search")
}

/** Opens the command menu with ⌘K (Ctrl+K here) and returns it. */
const commandMenu = async (app) => {
  await app.page.keyboard.press("Control+KeyK")
  await app.settle()
  return app.page.getByRole("dialog", { name: "Command menu" })
}
/** The command menu's group headings, in order. */
const headings = (menu) => menu.locator("[cmdk-group-heading]").evaluateAll((els) => els.map((el) => el.textContent.trim().toLowerCase()))

export const scenes = [
  {
    // Mobile / 04, Desktop / 03: Search from the Inbox, with a result open beside it on a desktop.
    name: "mail-search",
    sean: { kind: "drawn", area: "search", screen: "mail" },
    run: async (app) => {
      await open(app)
      await type(app, "cabin")
      // Desktop / 03 draws a result open in the detail column; narrower, it is pushed, so the results are the picture.
      if (!pushes(app)) await openResult(app)
      await rest(app)
    },
    assert: async ({ page }) => {
      // Opened from the Inbox, it stays inside it: the lane chip is there, chosen, and counted once every row is in.
      ensure(await chip(page, "Inbox").isChecked(), "Search from the Inbox is not inside the Inbox")
      ensure(await counted(page, "Inbox"), "the Inbox chip shows no count")
      ensure((await rows(page).count()) > 0, "“cabin” finds nothing in the Inbox")
    },
  },
  {
    name: "mail-search-none",
    sean: { kind: "undrawn", area: "search", screen: "none" },
    run: async (app) => {
      await open(app)
      await type(app, "zeppelin")
      await rest(app)
    },
    assert: async ({ page }) => {
      ensure(await page.getByText("Nothing matches.").isVisible(), "no empty state for a search with no match")
      ensure(await page.getByText("Search // 00", { exact: false }).isVisible(), "the empty state's overline is not SEARCH // 00")
      // Outside All, the way wider is offered.
      ensure(await button(page, "Search everything").isVisible(), "no SEARCH EVERYTHING outside All")
    },
  },
  {
    // Search in a lane of Mail (ADR-0085, ADR-0096): the ways in, what is current, the keys, a result and the way out.
    name: "search-mail",
    sizes: ["desktop", "phone", "medium"],
    run: async (app) => {
      const { page } = app
      // The search key opens Search from every section, looking through that section's kind.
      for (const [section, name] of [
        ["Mail", "Inbox"],
        ["Calendar", "Calendar"],
        ["Contacts", "Contacts"],
        ["Notes", "Notes"],
      ]) {
        await area(app, section)
        await page.evaluate(() => document.activeElement?.blur())
        await page.keyboard.press("/")
        await app.settle()
        ensure(await onSearch(page), `the search key did not open Search from ${section}`)
        ensure(await field(page).evaluate((el) => el === document.activeElement), `from ${section}, the cursor is not in the field`)
        ensure(await chip(page, name).isChecked(), `from ${section}, Search does not look in ${name}`)
        await searchIsCurrent(app)
        // Esc with nothing typed leaves for where you came from.
        await page.keyboard.press("Escape")
        await app.settle()
        ensure(!(await onSearch(page)), `Esc did not leave Search (from ${section})`)
      }
      // From a lane other than the Inbox, and back to it: Esc clears first, then leaves.
      await area(app, "Mail")
      await lane(app, "Starred")
      await open(app)
      ensure(await chip(page, "Starred").isChecked(), "Search from Starred is not inside Starred")
      await type(app, "cabin")
      await page.keyboard.press("Escape")
      await app.settle()
      ensure((await onSearch(page)) && (await field(page).inputValue()) === "", "Esc did not clear the words first")
      await page.keyboard.press("Escape")
      await app.settle()
      ensure(!(await onSearch(page)), "a second Esc did not leave Search")
      ensure((await headTitle(page)) === "Starred", "leaving Search did not return to Starred")
      // ↓ from the field reaches the first result, ↓ again the next, ↑ back; Enter opens the one with focus.
      await lane(app, "Inbox")
      await open(app)
      await press(app, chip(page, "Mail"))
      await type(app, "the")
      ensure((await rows(page).count()) >= 2, "Mail finds fewer than two conversations with “the”")
      await field(page).focus()
      await page.keyboard.press("ArrowDown")
      const focused = () => page.evaluate(() => document.activeElement?.closest('[data-slot="list-row"]')?.textContent ?? null)
      const first = await focused()
      ensure(first, "↓ from the field did not reach the first result")
      await page.keyboard.press("ArrowDown")
      ensure((await focused()) !== first, "↓ did not move to the next result")
      await page.keyboard.press("ArrowUp")
      ensure((await focused()) === first, "↑ did not move back")
      await page.keyboard.press("ArrowUp")
      ensure(await field(page).evaluate((el) => el === document.activeElement), "↑ from the first result did not return to the field")
      await page.keyboard.press("ArrowDown")
      await page.keyboard.press("Enter")
      await app.settle()
      ensure(await opened(page).isVisible(), "Enter did not open the result")
      ensure(await opened(page).getByRole("article").count(), "the conversation did not open in Search")
      // Back returns to the results with the words kept: a phone and the medium width pushed the conversation.
      if (pushes(app)) await goBack(app)
      else {
        // Beside the results, Esc closes what is open first.
        await page.evaluate(() => document.activeElement?.blur())
        await page.keyboard.press("Escape")
        await app.settle()
        ensure(!(await opened(page).count()), "Esc did not close the open result first")
      }
      ensure((await onSearch(page)) && (await field(page).inputValue()) === "the", "Back from a result did not return to the words")
      await searchIsCurrent(app)
      await rest(app)
    },
  },
  {
    // Search everything (ADR-0085): the four kinds, three rows each, and what the old fields found.
    name: "search-all",
    sean: { kind: "undrawn", area: "search", screen: "all" },
    run: async (app) => {
      const { page } = app
      // ⌘K's settings rows are the settings page's sections, from one list.
      await settings(app)
      const names = await page.getByRole("navigation", { name: "Settings sections" }).getByRole("button").evaluateAll((els) => els.map((el) => el.textContent.trim()).filter((t) => !/^Sign out/.test(t)))
      ensure(names.includes("Notifications") && names.includes("Notes"), `the settings sections are: ${names.join(", ")}`)
      const menu = await commandMenu(app)
      await menu.getByRole("combobox").fill("settings")
      for (const name of names) ensure(await menu.getByRole("option", { name, exact: true }).count(), `⌘K has no row for the settings section “${name}”`)
      // Its last row opens Search for everything.
      await menu.getByRole("combobox").fill("sam")
      await press(app, menu.getByRole("option", { name: /^Search everything for/ }))
      ensure(await onSearch(page), "⌘K's “Search everything” did not open Search")
      ensure(await chip(page, "All").isChecked(), "“Search everything” is not looking in All")
      ensure((await field(page).inputValue()) === "sam", "the words did not come along from ⌘K")
      // The contacts and notes searches find what the old fields found, and open in Search.
      await press(app, chip(page, "Contacts"))
      await type(app, "priya")
      ensure(await results(page).getByText("Priya Raman").count(), "Contacts search does not find Priya Raman")
      await press(app, chip(page, "Notes"))
      await type(app, "design")
      ensure((await rows(page).count()) > 0, "Notes search finds no note with “design”")
      await openResult(app)
      if (pushes(app)) await goBack(app)
      // Back to everything, with one word several kinds have.
      await press(app, chip(page, "All"))
      await type(app, "design")
      for (const kind of ["Mail", "Calendar", "Contacts", "Notes"]) {
        const n = await results(page).getByRole("region", { name: kind, exact: true }).locator('[data-slot="list-row-main"], [data-slot="calendar-event-title"]').count()
        ensure(n <= 3, `All shows ${n} rows of ${kind}, more than three`)
      }
      ensure((await results(page).getByRole("region").count()) >= 2, "“design” is found in fewer than two kinds")
      ensure(await counted(page, "All"), "the All chip shows no count once every kind is in")
      await rest(app)
    },
  },
  {
    // SHOW ALL selects that kind's chip (brief X2).
    name: "search-show-all",
    run: async (app) => {
      const { page } = app
      await open(app)
      await press(app, chip(page, "All"))
      await type(app, "a")
      const more = results(page).getByRole("button", { name: /^Show all / }).first()
      ensure(await more.count(), "no kind has more than three results for “a”")
      const kind = ((await more.getAttribute("aria-label")) ?? "").replace(/^Show all /, "")
      await press(app, more)
      ensure(await chip(page, kind[0].toUpperCase() + kind.slice(1)).isChecked(), `SHOW ALL did not choose the ${kind} chip`)
      ensure((await rows(page).count()) > 3, `the ${kind} chip shows three rows or fewer`)
      await rest(app)
    },
  },
  {
    // Events, 30 days back and 90 ahead, from Calendar: its chip starts chosen.
    name: "search-calendar",
    sean: { kind: "undrawn", area: "search", screen: "calendar" },
    run: async (app) => {
      const { page } = app
      await area(app, "Calendar")
      await open(app)
      ensure(await chip(page, "Calendar").isChecked(), "Search from Calendar does not look in Calendar")
      await type(app, "cabin")
      ensure((await results(page).locator('[data-slot="calendar-event-title"]').count()) > 0, "Calendar search finds no event with “cabin”")
      ensure(await results(page).getByText("Events // 30 days back, 90 ahead", { exact: false }).count(), "no EVENTS // 30 DAYS BACK, 90 AHEAD header")
      ensure(await counted(page, "Calendar"), "the Calendar chip shows no count")
      await rest(app)
    },
  },
  {
    name: "search-contacts",
    run: async (app) => {
      const { page } = app
      await area(app, "Contacts")
      await open(app)
      ensure(await chip(page, "Contacts").isChecked(), "Search from Contacts does not look in Contacts")
      await type(app, "studio")
      ensure((await rows(page).count()) > 0, "Contacts search finds no one at the studio")
      ensure(await results(page).locator("mark").count(), "the matched words are not marked")
      await rest(app)
    },
  },
  {
    name: "search-notes",
    run: async (app) => {
      const { page } = app
      await area(app, "Notes")
      await open(app)
      ensure(await chip(page, "Notes").isChecked(), "Search from Notes does not look in Notes")
      await type(app, "design")
      ensure((await rows(page).count()) > 0, "Notes search finds no note with “design”")
      await rest(app)
    },
  },
  {
    // The lane chip keeps a search inside one lane, Starred and the Screener included; Mail looks through every lane.
    name: "search-lane-starred",
    path: "/?screener",
    scenario: "screener-waiting",
    run: async (app) => {
      const { page } = app
      await lane(app, "Screener")
      await open(app)
      ensure(await chip(page, "Screener").isChecked(), "Search from the Screener is not inside it")
      await type(app, "proofs")
      ensure(await results(page).getByText("Risograph proofs for the zine").count(), "the Screener's search does not find its sender's mail")
      await press(app, chip(page, "Mail"))
      ensure(await results(page).getByText("Risograph proofs for the zine").count(), "Mail does not look in the Screener while it is on")
      await page.keyboard.press("Escape")
      await app.settle()
      await page.keyboard.press("Escape")
      await app.settle()
      await lane(app, "Starred")
      await open(app)
      ensure(await chip(page, "Starred").isChecked(), "Search from Starred is not inside Starred")
      await type(app, "lighthouse")
      ensure(await results(page).getByText("Photos from the trip").count(), "Starred's search does not find starred mail")
      await rest(app)
    },
  },
  {
    // A result of each other kind opens beside the results, as its own section shows it.
    name: "search-result-desktop",
    sizes: ["desktop"],
    run: async (app) => {
      const { page } = app
      await open(app)
      await press(app, chip(page, "Contacts"))
      await type(app, "priya")
      await openResult(app)
      ensure(await opened(page).getByText("Priya Raman").count(), "the person did not open in Search")
      await press(app, chip(page, "Calendar"))
      await type(app, "cabin")
      await openResult(app)
      ensure(await opened(page).getByText(/cabin/i).count(), "the event did not open in Search")
      ensure(await rows(page).first().getAttribute("aria-current"), "the open event's card is not marked")
      // The sidebar marks Search, not the section the result belongs to.
      ensure(await sidebar(page).getByRole("button", { name: "Search", exact: true }).getAttribute("aria-current"), "the sidebar does not mark Search")
      await rest(app)
    },
  },
  {
    // A team member (ADR-0063): no chips, mail alone; the command menu has MAIL, Search and their sections.
    name: "search-member",
    scenario: "member",
    run: async (app) => {
      const { page } = app
      await open(app)
      ensure(!(await chips(page).count()), "a team member sees the scope chips")
      // With no chips to widen it, a team member's search looks through all mail, not the lane it came from.
      ensure(await page.getByRole("searchbox", { name: "Search Mail" }).count(), "a team member's search is not through all mail")
      await type(app, "cabin")
      const menu = await commandMenu(app)
      const groups = await headings(menu)
      ensure(!groups.includes("create") && !groups.includes("view") && groups.includes("mail"), `a team member's command menu has ${groups.join(", ")}`)
      ensure(!(await menu.getByRole("option", { name: /note/i }).count()), "a team member's command menu offers notes")
      await page.keyboard.press("Escape")
      await app.settle()
      await rest(app)
    },
  },
  {
    name: "command-menu",
    sean: { kind: "undrawn", area: "shell", screen: "command-menu" },
    run: async (app) => {
      const menu = await commandMenu(app)
      const groups = await headings(menu)
      for (const g of ["create", "mail", "go to", "settings", "view"]) ensure(groups.includes(g), `the command menu has no ${g.toUpperCase()} group (it has ${groups.join(", ")})`)
      ensure(await menu.getByText("lists every key.", { exact: false }).isVisible(), "the command menu's footer does not name ?")
      // One highlighted row.
      ensure((await menu.locator('[cmdk-item][data-selected="true"]').count()) === 1, "the command menu does not highlight one row")
    },
  },
  {
    // While typing, the last row searches everything; the intents open their layers.
    name: "command-menu-typing",
    run: async (app) => {
      const { page } = app
      let menu = await commandMenu(app)
      await menu.getByRole("combobox").fill("re")
      const options = await menu.getByRole("option").allInnerTexts()
      ensure(/^Search everything for “re”/.test(options.at(-1)?.trim() ?? ""), `the last row is “${options.at(-1)}”, not Search everything`)
      // Restore contacts, through its intent.
      await menu.getByRole("combobox").fill("restore contacts")
      await press(app, menu.getByRole("option", { name: "Restore contacts", exact: true }))
      ensure(await page.getByRole("dialog", { name: "Restore contacts" }).isVisible(), "Restore contacts did not open")
      await page.keyboard.press("Escape")
      await app.settle()
      // Open a shared note…, through its intent.
      menu = await commandMenu(app)
      await menu.getByRole("combobox").fill("shared note")
      await press(app, menu.getByRole("option", { name: "Open a shared note…", exact: true }))
      ensure(await page.getByRole("dialog", { name: "Open a shared note" }).isVisible(), "Open a shared note did not open")
      await page.keyboard.press("Escape")
      await app.settle()
      // Missed reminders is offered only once that list was raised: not in a session with none.
      menu = await commandMenu(app)
      await menu.getByRole("combobox").fill("missed")
      ensure(!(await menu.getByRole("option", { name: "Missed reminders", exact: true }).count()), "Missed reminders is offered with nothing missed")
      await menu.getByRole("combobox").fill("cabin")
      await rest(app)
    },
  },
  {
    name: "command-menu-missed",
    scenario: "missed",
    run: async (app) => {
      const { page } = app
      const menu = await commandMenu(app)
      await menu.getByRole("combobox").fill("missed")
      await press(app, menu.getByRole("option", { name: "Missed reminders", exact: true }))
      ensure(await page.getByRole("dialog", { name: "Missed" }).isVisible(), "Missed reminders did not open the list")
      await rest(app)
    },
  },
  {
    name: "keyboard-shortcuts",
    sean: { kind: "undrawn", area: "shell", screen: "keys" },
    run: async (app) => {
      await app.page.keyboard.press("?")
      await app.settle()
    },
    assert: async ({ page }) => {
      const list = page.getByRole("dialog", { name: "Keyboard shortcuts" })
      ensure(await list.isVisible(), "? did not open the keys list")
      const section = (name) => list.getByRole("region", { name, exact: true })
      const text = async (name) => ((await section(name).textContent()) ?? "").replace(/\s+/g, " ")
      // The person's own keys (the demo's are the defaults) and the fixed ones.
      ensure(/Archive/.test(await text("Mail")) && /Go to today/.test(await text("Calendar")), "the keys list lacks the person's mail or calendar keys")
      const everywhere = await text("Everywhere")
      for (const does of ["Search", "Commands and search", "Settings", "Collapse or show the sidebar", "This list", "Take back a send", "A row's menu", "Close the top layer"]) ensure(everywhere.includes(does), `EVERYWHERE does not list “${does}”`)
      ensure(await list.getByRole("button", { name: "Change keys and swipes", exact: true }).isVisible(), "no CHANGE KEYS AND SWIPES")
    },
  },
]
