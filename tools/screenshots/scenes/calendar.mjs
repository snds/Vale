// Calendar: every view, an event and its editor, the calendars list, booking links, and the menu-bar window.
import { area, button, closeForm, ensure, formLayer, goBack, groups, headTitle, leaveLayer, oneCurrent, pick, press, sidebar, switcherLayer, toastGone } from "./helpers.mjs"
import { compose } from "./mail.mjs"
import { settings } from "./settings.mjs"

/** The range chips (ADR-0098; brief C1): a radio group named "View". A phone has Day, Week and Month; wider, Upcoming first. */
const ranges = (page) => page.getByRole("radiogroup", { name: "View" })
/** Opens Calendar in one range: "Upcoming", "Day", "Week" or "Month". */
export const calendarView = async (app, name) => {
  await area(app, "Calendar")
  const chip = ranges(app.page).getByRole("radio", { name, exact: true })
  if ((await chip.getAttribute("aria-checked")) !== "true") await press(app, chip)
}
/**
 * Hours on or off (brief C1): the paging row's toggle from medium width up; on a phone, the Hours
 * switch in the Calendars sheet's MORE group, which then closes.
 */
export const calendarHours = async (app, on = true) => {
  const { page } = app
  if (app.phone) {
    const list = await groups(app)
    const row = list.getByRole("switch", { name: "Hours" })
    if ((await row.isChecked()) !== on) await press(app, row)
    await leaveLayer(app)
    return
  }
  const toggle = page.getByRole("group", { name: "Paging" }).getByRole("button", { name: "Hours", exact: true })
  if ((await toggle.getAttribute("aria-pressed")) !== String(on)) await press(app, toggle)
  await page.mouse.move(0, 0)
}
/** The calendars list: in the sidebar on a desktop, the page head's sheet on a phone (its popover at medium width). Returns it. */
export const calendars = async (app) => {
  await area(app, "Calendar")
  return groups(app)
}
/** Opens a new event; returns its dialog. */
export const newEvent = async (app) => {
  await area(app, "Calendar")
  await press(app, button(app.page, "New event"))
  return app.page.getByRole("dialog", { name: "New event" })
}

/** The open event: the detail column or a pushed screen, or the review dialog. */
const eventPane = (page) => page.locator('[data-slot="event-detail"]:visible').first()
/** One of the event's Field Rows, by its label. */
const rowOf = (within, label) => within.locator('[data-slot="field-row"]').filter({ has: within.page().getByText(label, { exact: true }) })
/**
 * Opens an event by its title: from Upcoming on a desktop and at medium width (the detail column, or a
 * pushed screen), from the Day's cards on a phone (pushed).
 */
export const openEvent = async (app, title) => {
  await calendarView(app, app.phone ? "Day" : "Upcoming")
  const card = app.page.getByRole("button", { name: new RegExp(`^${title}, `) }).first()
  await card.scrollIntoViewIfNeeded()
  await press(app, card)
  await app.page.mouse.move(0, 0)
}
/** EDIT and DELETE: in the pane from medium up, in the top bar on a phone. */
const editButton = (app) => app.page.getByRole("button", { name: "Edit", exact: true }).first()
const deleteButton = (app) => app.page.getByRole("button", { name: "Delete", exact: true }).first()

/** The events on screen, as their look says: the primary tone, and which is selected (`aria-current`). */
const looks = (page) =>
  page.locator('[data-slot="calendar-event"]:visible').evaluateAll((els) => els.map((e) => ({ name: e.getAttribute("aria-label"), primary: e.getAttribute("data-tone") === "primary", selected: e.getAttribute("aria-current") === "true" })))
/**
 * The selected event and the next event never look alike in one view (brief C1, Emphasis): one
 * primary-look event at most, and where one is selected it is that one.
 */
const oneEmphasis = async (page, where) => {
  const all = await looks(page)
  const primary = all.filter((e) => e.primary)
  const selected = all.filter((e) => e.selected)
  ensure(primary.length <= 1, `${where}: ${primary.length} events take the primary look: ${primary.map((e) => e.name).join(" | ")}`)
  ensure(selected.length <= 1, `${where}: ${selected.length} events say they are selected`)
  if (selected.length) ensure(primary.length === 1 && primary[0].name === selected[0].name, `${where}: the next event looks like the selected one`)
  return { primary, selected, all }
}
/** The paging row's TODAY, where it shows. */
const todayButton = (page) => page.getByRole("button", { name: "Today", exact: true })
/**
 * TODAY hides while today is in view; previous and next step by the range (brief C1). Ends where it
 * started, on today. `title` reads the head's title after a step.
 */
const steps = async (app, range, expect) => {
  const { page } = app
  ensure(!(await todayButton(page).count()), `${range}: TODAY shows while today is in view`)
  await press(app, page.getByRole("button", { name: `Next ${range}`, exact: true }))
  ensure((await headTitle(page)) === expect.next, `${range}: Next went to "${await headTitle(page)}", not "${expect.next}"`)
  ensure(await todayButton(page).first().isVisible(), `${range}: TODAY does not show once today is out of view`)
  await press(app, todayButton(page).first())
  ensure((await headTitle(page)) === expect.today, `${range}: TODAY went to "${await headTitle(page)}"`)
  ensure(!(await todayButton(page).count()), `${range}: TODAY still shows on today`)
  await press(app, page.getByRole("button", { name: `Previous ${range}`, exact: true }))
  ensure((await headTitle(page)) === expect.previous, `${range}: Previous went to "${await headTitle(page)}", not "${expect.previous}"`)
  await press(app, todayButton(page).first())
  await page.mouse.move(0, 0)
  await page.evaluate(() => document.activeElement?.blur())
}

export const scenes = [
  {
    // Opens on the week from medium up and the day on a phone (Desktop / 06, Mobile / 08), as cards.
    name: "calendar",
    run: (app) => area(app, "Calendar"),
    assert: async ({ page, phone }) => {
      if (phone) ensure(await page.locator('[data-slot="week-strip"]').isVisible(), "a phone does not open on the Day's week strip")
      else ensure(await page.locator('[data-slot="week-cards"]').isVisible(), "the desktop does not open on the card week")
      ensure(!(await page.locator('[data-slot="time-grid"]').count()), "the calendar opens on hours, not cards")
    },
  },
  {
    // Upcoming (Desktop / 07's list): 30 days from today, grouped by day, with no paging.
    name: "calendar-agenda",
    sizes: ["desktop", "medium"],
    sean: { kind: "undrawn", area: "calendar", screen: "upcoming" },
    run: (app) => calendarView(app, "Upcoming"),
    assert: async ({ page }) => {
      ensure((await headTitle(page)) === "Coming up", `Upcoming's title is "${await headTitle(page)}"`)
      ensure(!(await page.getByRole("button", { name: /^(Next|Previous) / }).count()), "Upcoming pages")
      ensure(await page.getByRole("button", { name: "More", exact: true }).isVisible(), "Upcoming has no MORE")
      await oneEmphasis(page, "Upcoming")
    },
  },
  {
    // The Day (Mobile / 08): the week strip, the day's cards, then COMING UP. The next event takes the primary look.
    name: "calendar-day",
    sean: { kind: "drawn", area: "calendar", screen: "day" },
    run: async (app) => {
      await calendarView(app, "Day")
      await steps(app, "day", { today: "Thursday", next: "Friday", previous: "Wednesday" })
    },
    assert: async ({ page, phone }) => {
      const strip = page.getByRole("radiogroup", { name: /^Week of / })
      ensure((await strip.getByRole("radio").count()) === 7, "the week strip is not seven days")
      ensure(/^Thursday, November 12, today/.test(await strip.locator('[aria-checked="true"]').getAttribute("aria-label")), "today is not the picked day")
      ensure(await page.getByRole("heading", { name: /^Today \/\/ Thursday/ }).isVisible(), "the day's section is not TODAY // THURSDAY")
      ensure(await page.getByRole("heading", { name: /^Coming up/ }).isVisible(), "the Day has no COMING UP")
      const { primary } = await oneEmphasis(page, "the Day")
      // A phone's Day selects nothing: the next event is the primary card. Beside a detail column it is neutral.
      if (phone) ensure(primary.length === 1, "the phone's Day does not mark the next event")
    },
  },
  {
    // The card week (Desktop / 06): seven day columns, today's head on the primary block. A phone: seven sections.
    name: "calendar-week",
    sizes: ["desktop", "phone", "medium"],
    sean: { kind: "drawn", area: "calendar", screen: "week" },
    run: async (app) => {
      const { page } = app
      await calendarView(app, "Week")
      await steps(app, "week", { today: "Week 46", next: "Week 47", previous: "Week 45" })
      if (app.phone || (await page.locator('[data-slot="week-cards"][data-stacked]').count())) return
      // The arrow keys between events (brief C1): right goes to the next day that has one, at the nearest time; down within a day.
      const focused = () => page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? "")
      await page.getByRole("button", { name: /^Quarterly planning, / }).focus()
      await page.keyboard.press("ArrowRight")
      ensure(/^Standup, /.test(await focused()), `ArrowRight from Tuesday went to "${await focused()}"`)
      await page.keyboard.press("ArrowDown")
      ensure(/^Token audit review, /.test(await focused()), `ArrowDown went to "${await focused()}"`)
      await page.evaluate(() => document.activeElement?.blur())
    },
    assert: async ({ page, phone }) => {
      // Under 720 px of content (a phone, a narrow medium width) the days stand as sections.
      if (phone || (await page.locator('[data-slot="week-cards"][data-stacked]').count())) ensure((await page.locator('[data-slot="week-sections"] > section').count()) === 7, "the stacked week is not seven sections")
      else {
        ensure((await page.locator(".week-cards-day").count()) === 7, "the card week is not seven columns")
        ensure((await page.locator('.week-day-head[data-today]').count()) === 1, "today's head is not the block")
      }
      ensure(await page.getByText("Nothing planned").first().isVisible(), "a free day does not say Nothing planned")
      await oneEmphasis(page, "the Week")
    },
  },
  {
    // The week on a phone further down: the weekend's sections, all-day first.
    name: "calendar-week-phone",
    sizes: ["phone"],
    run: async (app) => {
      await calendarView(app, "Week")
      await app.page.getByRole("heading", { name: /^Sat 14/ }).scrollIntoViewIfNeeded()
      await app.settle()
    },
    assert: async ({ page }) => {
      const sat = page.getByRole("region", { name: /^Sat 14/ })
      const cards = await sat.locator('[data-slot="calendar-event"]').evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")))
      ensure(/^Cabin weekend, all day/.test(cards[0] ?? ""), `Saturday does not start with its all-day event: ${cards.join(" | ")}`)
      ensure(await page.getByRole("heading", { name: /^Thu 12 \/\/ Today/ }).count(), "today's section is not marked")
    },
  },
  {
    // The Month: six weeks of cells on a desktop; on a phone the shared grid with swatch squares and the picked day's list.
    name: "calendar-month",
    sean: { kind: "undrawn", area: "calendar", screen: "month" },
    run: async (app) => {
      await calendarView(app, "Month")
      await steps(app, "month", { today: "November", next: "December", previous: "October" })
    },
    assert: async ({ page, phone }) => {
      const grid = page.getByRole("grid", { name: "November 2026" })
      ensure((await grid.getByRole("gridcell").count()) === 42, "the month is not six weeks")
      ensure(/^Thursday, November 12, today, \d+ events?$/.test(await grid.locator('[aria-current="date"]').getAttribute("aria-label")), "today's cell is not named with its events")
      await oneEmphasis(page, "the Month")
    },
  },
  {
    // Hours on (brief C1): the Week as seven columns of hours from medium up. A phone keeps its day sections.
    name: "calendar-week-hours",
    sizes: ["desktop", "phone"],
    sean: { kind: "undrawn", area: "calendar", screen: "week-hours", sizes: ["desktop"] },
    run: async (app) => {
      const { page } = app
      await calendarView(app, "Week")
      await calendarHours(app, true)
      if (app.phone) return
      // Pressing an empty hour starts a new event at that hour.
      const monday = page.locator('.time-grid-day[data-day^="Mon"]')
      const hour = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize) * 3)
      await monday.click({ position: { x: 24, y: hour * 15 + hour / 2 } })
      await app.settle()
      const form = page.getByRole("dialog", { name: "New event" })
      ensure(await form.isVisible(), "pressing an empty hour opened no new event")
      ensure((await form.getByRole("textbox", { name: "Start time" }).inputValue()) === "15:00", `the new event starts at ${await form.getByRole("textbox", { name: "Start time" }).inputValue()}, not 15:00`)
      ensure(/Monday, November 9/.test(await form.getByRole("button", { name: /^Start date/ }).getAttribute("aria-label")), "the new event is not on the day pressed")
      await page.keyboard.press("Escape")
      await app.settle()
      await page.mouse.move(0, 0)
    },
    assert: async ({ page, phone }) => {
      if (phone) {
        ensure(!(await page.locator('[data-slot="time-grid"]').count()), "a phone's Week drew hours")
        ensure((await page.locator('[data-slot="week-sections"] > section').count()) === 7, "the phone's week is not seven sections")
        return
      }
      const grid = page.locator('[data-slot="time-grid"]')
      ensure((await grid.locator(".time-grid-day").count()) === 7, "the week's hours are not seven columns")
      ensure(await grid.locator(".time-grid-now").count() === 1, "the week has no now rule, or more than one")
      ensure(await grid.locator('[data-slot="travel-band"]').count(), "the ferry's travel time is not drawn")
      ensure(await grid.getByRole("button", { name: "Ferry to the cabin, 08:15 to 09:00, 30 min travel before" }).count(), "an event is not named with its travel")
      await oneEmphasis(page, "the Week's hours")
    },
  },
  {
    // Hours on the Day: one column across the full width on a desktop; under the week strip on a phone. The choice survives a reload.
    name: "calendar-day-hours",
    sean: { kind: "undrawn", area: "calendar", screen: "day-hours" },
    run: async (app) => {
      const { page } = app
      await calendarView(app, "Day")
      await calendarHours(app, true)
      await page.reload()
      await app.settle()
      await area(app, "Calendar")
    },
    assert: async ({ page, phone }) => {
      const grid = page.locator('[data-slot="time-grid"]')
      ensure(await grid.isVisible(), "Hours did not survive a reload")
      ensure((await grid.locator(".time-grid-day").count()) === 1, "the Day's hours are not one column")
      if (phone) ensure(await page.locator('[data-slot="week-strip"]').isVisible(), "the phone's Day lost its week strip")
      await oneEmphasis(page, "the Day's hours")
    },
  },
  {
    // Go to date (brief C1): the month grid in a popover, a square on days with events.
    name: "calendar-go-to-date",
    sizes: ["desktop", "medium"],
    sean: { kind: "undrawn", area: "calendar", screen: "go-to-date", sizes: ["desktop"] },
    run: async (app) => {
      const { page } = app
      await calendarView(app, "Day")
      const open = async () => {
        await press(app, page.getByRole("button", { name: "Go to date", exact: true }))
        return page.getByRole("dialog", { name: "Go to date" })
      }
      let layer = await open()
      ensure(/, today, \d+ events?$/.test(await layer.getByRole("gridcell", { name: /^Thursday, November 12/ }).getAttribute("aria-label")), "the popover does not name today with its events")
      await press(app, layer.getByRole("gridcell", { name: /^Friday, November 20/ }))
      ensure(!(await layer.count()), "picking a day did not close Go to date")
      ensure((await headTitle(page)) === "Friday", `Go to date went to "${await headTitle(page)}"`)
      layer = await open()
      ensure((await layer.getByRole("gridcell", { name: /^Friday, November 20/ }).getAttribute("aria-selected")) === "true", "the day in view is not the picked day")
    },
  },
  {
    // Every calendar hidden (brief C1, States): the calendar says so, and SHOW CALENDARS opens the list.
    name: "calendar-all-hidden",
    scenario: "all-hidden",
    sean: { kind: "undrawn", area: "calendar", screen: "all-hidden" },
    run: async (app) => {
      const { page } = app
      await area(app, "Calendar")
      await page.getByText("Every calendar is hidden.").waitFor()
      await press(app, button(page, "Show calendars"))
      if (await switcherLayer(page).count()) {
        ensure(await switcherLayer(page).getByRole("checkbox").first().isVisible(), "SHOW CALENDARS did not open the calendars")
        await leaveLayer(app)
      } else ensure(await page.evaluate(() => document.activeElement?.getAttribute("role")) === "checkbox", "SHOW CALENDARS did not go to the calendars")
      await page.evaluate(() => document.activeElement?.blur())
    },
    assert: async ({ page }) => {
      ensure(await page.getByText("Every calendar is hidden.").isVisible(), "the calendar does not say every calendar is hidden")
      ensure(!(await page.locator('[data-slot="calendar-event"]:visible').count()), "events show with every calendar hidden")
    },
  },
  {
    // A calendar that did not sync (brief X4, C5): Calendar's banner, and the account's rows say so.
    name: "calendar-dav-error",
    scenario: "dav-error",
    sean: { kind: "undrawn", area: "calendar", screen: "sync-error" },
    run: (app) => area(app, "Calendar"),
    assert: async (app) => {
      const { page } = app
      const banner = page.locator('[data-role="section-banner"]')
      ensure(/Work calendars didn't sync/.test(await banner.innerText()), "Calendar shows no banner for the calendars that did not sync")
      ensure(await banner.getByRole("button", { name: "Open Accounts" }).isVisible(), "the banner has no OPEN ACCOUNTS")
      if (!app.phone) ensure(await sidebar(page).getByRole("checkbox", { name: /didn't sync/ }).count(), "the account's calendars do not say they did not sync")
    },
  },
  {
    // Loading (brief C1, States): three skeleton cards for the day; the strip and the head stand.
    name: "calendar-loading",
    scenario: "calendar-loading",
    loading: true,
    run: (app) => calendarView(app, "Day"),
    assert: async ({ page }) => {
      ensure(await page.locator('[aria-busy="true"] [data-slot="skeleton"]').first().isVisible(), "the Day shows no skeleton cards while it reads")
    },
  },
  {
    // An event open (Desktop / 07, Mobile / 09; brief C2): from Upcoming, in the detail column beside the
    // list, where it is the selected card and the next event is neutral with its NEXT line. A phone's Day
    // pushes it: Edit and Delete in the top bar, the place button in the bottom row.
    name: "calendar-event",
    sean: { kind: "drawn", area: "calendar", screen: "event" },
    run: (app) => openEvent(app, "Lunch with Ana"),
    assert: async (app) => {
      const { page, phone } = app
      const pane = eventPane(page)
      ensure((await page.locator('[data-slot="page-head-title"]:visible', { hasText: "Lunch with Ana" }).count()) > 0, "the event's head does not name it")
      ensure(/^Event \/\/ Thu 11\.12$/i.test((await page.locator('[data-slot="page-head-overline"]:visible').last().innerText()).trim()), "the head's overline is not EVENT // THU 11.12")
      for (const row of ["When", "Where", "Calendar"]) ensure(await rowOf(pane, row).count(), `the event has no ${row} row`)
      ensure((await rowOf(pane, "When").evaluate((el) => el.textContent)).includes("12:30 – 13:30"), "WHEN is not 12:30 – 13:30")
      ensure(await rowOf(pane, "Where").getByRole("link", { name: /^Map of Café Lisboa/ }).count(), "WHERE has no MAP")
      for (const row of ["Repeats", "Travel", "Time zone", "Alert", "Link"]) ensure(!(await rowOf(pane, row).count()), `the event shows an empty ${row} row`)
      if (phone) {
        const bar = page.locator('[data-slot="top-bar"]:visible').first()
        for (const name of ["Edit", "Delete"]) ensure(await bar.getByRole("button", { name, exact: true }).count(), `the top bar has no ${name}`)
        ensure(await page.getByRole("button", { name: "Map of Café Lisboa" }).count(), "the bottom row has no place button")
        ensure(!(await page.getByRole("button", { name: "Join call" }).count()), "an event with no call shows Join call")
        return
      }
      for (const name of ["Edit", "Delete"]) ensure(await pane.getByRole("button", { name, exact: true }).count(), `the event has no ${name.toUpperCase()}`)
      if (app.size === "medium") return
      const { selected, all } = await oneEmphasis(page, "Upcoming with an event open")
      ensure(selected.length === 1 && /^Lunch with Ana/.test(selected[0].name), "the open event is not the selected card")
      const next = all.find((e) => /^Standup/.test(e.name))
      ensure(next && !next.primary, "the next event takes the selected look")
      ensure(await page.locator('[data-slot="calendar-event"]', { hasText: "Next // in" }).count(), "the next event does not say so")
    },
  },
  {
    // An event with every row (brief C2): a call with its ID, passcode and numbers, guests and their
    // answers, travel and another zone. JOIN is the one primary; on a phone, the bottom row's Join call.
    name: "calendar-event-call",
    scenario: "event-call",
    sean: { kind: "undrawn", area: "calendar", screen: "event-call" },
    run: (app) => openEvent(app, "Token audit review"),
    assert: async (app) => {
      const { page, phone } = app
      const pane = eventPane(page)
      const rows = { "Video call": "Zoom", "Meeting ID": "812 3456 7890", Passcode: "271828", "Call in": "+1 669 900 6833", When: "12:00 – 13:00", Where: "Studio, room 4", Travel: "20 min // leave by 11:40", "Time zone": "New York time: 15:00 – 16:00 EST", Alert: "10 minutes before", Calendar: "Work" }
      for (const [label, value] of Object.entries(rows)) {
        ensure(await rowOf(pane, label).count(), `the event has no ${label} row`)
        const text = await rowOf(pane, label).first().evaluate((el) => el.textContent)
        ensure(text.includes(value), `${label} reads "${text}", not "${value}"`)
      }
      for (const label of ["Meeting ID", "Passcode"]) ensure(await rowOf(pane, label).getByRole("button", { name: "Copy" }).count(), `${label} has no COPY`)
      ensure(await rowOf(pane, "Call in").first().getByRole("link", { name: /^Call in on / }).count(), "CALL IN has no CALL")
      const guests = pane.getByRole("region", { name: "Guests" })
      ensure(/03/.test(await guests.getByRole("heading").first().innerText()), "GUESTS does not count three")
      ensure(await guests.getByText("Organizer", { exact: true }).count(), "the organizer has no badge")
      for (const answer of ["Going", "No reply", "Maybe"]) ensure(await guests.getByText(answer, { exact: true }).count(), `no guest says ${answer}`)
      if (phone) {
        ensure(await page.getByRole("button", { name: "Join call" }).count(), "the bottom row has no Join call")
        ensure(!(await pane.getByRole("link", { name: /^Join / }).count()), "a phone shows JOIN twice")
      } else {
        ensure((await pane.getByRole("link", { name: "Join Zoom" }).count()) === 1, "the event has no JOIN")
        ensure(await pane.getByRole("link", { name: "Open in browser" }).count(), "JOIN that opens the app has no OPEN IN BROWSER")
        // COPY says "Copied" in its own place for 2 s, and raises no toast.
        // The clipboard as it is when the browser allows the copy (a headless page in the background may not).
        await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { value: { writeText: async () => {} }, configurable: true }))
        const copy = rowOf(pane, "Passcode").getByRole("button", { name: "Copy" })
        await copy.click()
        ensure(await rowOf(pane, "Passcode").getByRole("button", { name: "Copied" }).count(), "COPY does not say Copied")
        ensure(!(await page.locator("[data-sonner-toast]").count()), "COPY raised a toast")
        await page.waitForTimeout(2100)
        await page.mouse.move(0, 0)
      }
    },
  },
  {
    // From the Week on a desktop (brief C2, Q2): a review dialog of 560. Its footer: EDIT and DELETE, then JOIN.
    name: "calendar-event-dialog",
    sizes: ["desktop"],
    sean: { kind: "undrawn", area: "calendar", screen: "event-dialog" },
    run: async (app) => {
      await calendarView(app, "Week")
      await press(app, app.page.getByRole("button", { name: /^Design review, / }).first())
    },
    assert: async ({ page }) => {
      const dialog = page.getByRole("dialog", { name: /Design review/ })
      ensure(await dialog.isVisible(), "the event did not open in a dialog")
      ensure(Math.round((await dialog.boundingBox()).width) === 560, `the dialog is ${Math.round((await dialog.boundingBox()).width)} wide, not 560`)
      const footer = dialog.locator('[data-slot="dialog-footer"]')
      const words = (await footer.locator("a, button").allInnerTexts()).map((w) => w.trim().toLowerCase())
      ensure(words.join(",") === "edit,delete,join google meet", `the footer reads ${words.join(", ")}`)
      ensure(!(await dialog.locator('[data-slot="event-detail"]').getByRole("button", { name: "Edit", exact: true }).count()), "EDIT shows in the body as well as the footer")
    },
  },
  {
    // A read-only calendar (brief C2): no EDIT or DELETE, and one line with a lock.
    name: "calendar-event-readonly",
    run: (app) => openEvent(app, "Bank holiday"),
    assert: async ({ page }) => {
      const pane = eventPane(page)
      ensure(await pane.getByText("Holidays is read-only.").isVisible(), "the read-only line is missing")
      for (const name of ["Edit", "Delete"]) ensure(!(await page.getByRole("button", { name, exact: true }).count()), `a read-only event offers ${name}`)
    },
  },
  {
    // Edit one event of a series (brief C3): EDIT is a menu of scopes; "This event" opens the form with one
    // notice and without REPEAT, CALENDAR or INVITE.
    name: "calendar-event-edit-series",
    run: async (app) => {
      const { page } = app
      await openEvent(app, "Standup")
      await press(app, editButton(app))
      // A menu on a desktop, a sheet of rows on a phone.
      await press(app, page.getByText("This event", { exact: true }).last())
    },
    assert: async ({ page }) => {
      const form = page.getByRole("dialog", { name: /^Edit event/ })
      ensure(await form.isVisible(), "This event did not open the form")
      ensure((await form.locator('[data-slot="banner"]').innerText()).includes("Changes apply to this event only."), "the form does not say only this event changes")
      for (const label of ["Repeat", "Calendar"]) ensure(!(await rowOf(form, label).count()), `one event of a series shows ${label}`)
      ensure(!(await form.getByRole("combobox", { name: "Invite" }).count()), "one event of a series shows INVITE")
      ensure(/^Edit event \/\/ Work/i.test((await form.innerText()).trim()) || (await form.getByText(/^Edit event \/\/ Work$/i).count()), "the overline is not EDIT EVENT // WORK")
    },
  },
  {
    // Delete a repeating event (brief X6, DC10): the question names it, with three scopes as RadioRows, and
    // focus starts on Cancel. Then the pane closes with "Deleted Standup".
    name: "calendar-delete-series",
    sean: { kind: "undrawn", area: "calendar", screen: "delete-series" },
    run: async (app) => {
      await openEvent(app, "Standup")
      await press(app, deleteButton(app))
    },
    assert: async ({ page }) => {
      const question = page.getByRole("dialog", { name: "Delete Standup?" })
      ensure(await question.isVisible(), "DELETE did not ask")
      const radios = question.getByRole("radio")
      ensure(JSON.stringify(await radios.evaluateAll((list) => list.map((r) => r.getAttribute("aria-checked")))) === '["true","false","false"]', "the scopes do not start on This event")
      for (const name of ["This event", "This and following", "All events"]) ensure(await question.getByRole("radio", { name }).count(), `no scope ${name}`)
      ensure(await question.getByText("Only Thu 11.12.").count(), "This event does not say which day")
      ensure(await page.evaluate(() => document.activeElement?.textContent?.trim() === "Cancel"), "focus does not start on Cancel")
      ensure(await question.getByRole("button", { name: "Delete", exact: true }).count(), "the yes is not DELETE")
    },
  },
  {
    // DELETE runs: the pane closes, with the toast "Deleted Lunch with Ana".
    name: "calendar-delete-one",
    sizes: ["desktop"],
    run: async (app) => {
      const { page } = app
      await openEvent(app, "Lunch with Ana")
      await press(app, deleteButton(app))
      const question = page.getByRole("dialog", { name: "Delete Lunch with Ana?" })
      ensure(!(await question.getByRole("radio").count()), "a one-off event asks for a scope")
      await press(app, question.getByRole("button", { name: "Delete", exact: true }))
    },
    assert: async ({ page }) => {
      ensure(await page.locator("[data-sonner-toast]", { hasText: "Deleted Lunch with Ana" }).count(), "no toast Deleted Lunch with Ana")
      ensure(await page.getByText("Nothing open.").isVisible(), "the pane did not close")
      ensure(!(await page.getByRole("button", { name: /^Lunch with Ana, / }).count()), "the event is still listed")
    },
  },
  {
    // The form (Desktop / 08, Mobile / 10; brief C3): what and when first, the rest under MORE.
    name: "calendar-event-new",
    sean: { kind: "drawn", area: "calendar", screen: "new-event" },
    run: async (app) => {
      const dialog = await newEvent(app)
      await dialog.getByRole("textbox", { name: "Title" }).fill("Pick up the rental car")
      await dialog.getByRole("textbox", { name: "Location" }).fill("Airport rental center, level 2")
      await app.page.evaluate(() => document.activeElement?.blur())
    },
    assert: async ({ page, phone }) => {
      const form = page.getByRole("dialog", { name: /^New event/ })
      const labels = await form.locator('[data-slot="event-form"] > *').evaluateAll((list) => list.map((el) => el.getAttribute("data-slot") ?? el.querySelector("label, [role=group]")?.getAttribute("aria-label") ?? el.querySelector("label")?.textContent?.trim() ?? ""))
      ensure(labels.length > 6, `the form holds ${labels.length} parts`)
      for (const name of ["Title", "Location"]) ensure(await form.getByRole("textbox", { name }).count(), `the form has no ${name}`)
      ensure(await form.getByRole("switch", { name: "All day" }).count(), "the form has no All day")
      for (const name of ["Starts", "Ends"]) ensure(await form.getByRole("group", { name }).count(), `the form has no ${name}`)
      ensure(await form.getByRole("button", { name: "Find a time" }).count(), "the form has no FIND A TIME")
      ensure(await form.getByRole("heading", { name: /^More/ }).count(), "the form has no MORE")
      for (const label of ["Repeat", "Alert", "Calendar", "Travel", "Time zone"]) ensure(await rowOf(form, label).count(), `MORE has no ${label}`)
      ensure((await form.locator('[data-slot="invite-note"]').innerText()).trim() === "Invitations go out from Personal when you save.", "INVITE's helper is not the real case")
      if (!phone) {
        // Desktop: STARTS and ENDS side by side, four fields on one line.
        const a = await form.getByRole("group", { name: "Starts" }).boundingBox()
        const b = await form.getByRole("group", { name: "Ends" }).boundingBox()
        ensure(Math.abs(a.y - b.y) < 2 && b.x > a.x + a.width, "STARTS and ENDS are not side by side")
      }
    },
  },
  {
    // An event in the form layer (ADR-0087; brief 3.2): the title as typed in the header, Cancel then Save event.
    name: "form-layer-event",
    sizes: ["desktop", "phone", "medium"],
    run: async (app) => {
      const write = (form) => form.getByRole("textbox", { name: "Title" }).fill("Pick up the rental car")
      await formLayer(app, { open: newEvent, write, primary: "Save event" })
      await toastGone(app)
      const form = await newEvent(app)
      await write(form)
      if (!app.phone) ensure(/Pick up the rental car/.test(await form.locator('[data-slot="dialog-title"]').innerText()), "the header does not show the title as typed")
    },
    assert: async ({ page }) => {
      // Enter in TITLE does not save (brief C4).
      const form = page.getByRole("dialog", { name: /^New event/ })
      await form.getByRole("textbox", { name: "Title" }).press("Enter")
      ensure(await form.isVisible(), "Enter in TITLE saved the event")
      // No title: the field says so, and nothing is saved.
      await form.getByRole("textbox", { name: "Title" }).fill("")
      await page.keyboard.press("Control+Enter")
      ensure(await form.getByText("Give the event a title.").isVisible(), "an event with no title does not say so")
    },
  },
  {
    // FIND A TIME (brief C3): free slots as single-choice chips; picking one sets both times.
    name: "calendar-find-time",
    run: async (app) => {
      const dialog = await newEvent(app)
      await dialog.getByRole("textbox", { name: "Title" }).fill("Planning call")
      await press(app, dialog.getByRole("button", { name: "Find a time" }))
    },
    assert: async ({ page }) => {
      const form = page.getByRole("dialog", { name: /^New event/ })
      const chips = form.getByRole("radiogroup", { name: "Free times" }).getByRole("radio")
      ensure((await chips.count()) > 0, "FIND A TIME found no free times as chips")
      await chips.first().click()
      const picked = (await chips.first().innerText()).trim()
      const start = await form.getByRole("textbox", { name: "Start time" }).inputValue()
      ensure(picked.endsWith(start), `picking ${picked} set the start to ${start}`)
      ensure((await chips.first().getAttribute("aria-checked")) === "true", "the picked chip is not on")
    },
  },
  {
    // Quick add in the form (brief C4, Q5): TITLE reads a sentence and offers USE THIS, which fills the times
    // and the place and trims the title. The picture: the helper, reading.
    name: "calendar-quick-add",
    sean: { kind: "undrawn", area: "calendar", screen: "quick-add" },
    run: async (app) => {
      const { page } = app
      const form = await newEvent(app)
      const title = form.getByRole("textbox", { name: "Title" })
      await title.fill("Lunch with Ana tomorrow 1pm at Bricks Cafe")
      await app.settle()
      const read = form.locator('[data-slot="quick-read"]')
      ensure((await read.innerText()).startsWith("Lunch with Ana // Tomorrow 13:00 // Bricks Cafe"), `the helper reads "${await read.innerText()}"`)
      await press(app, read.getByRole("button", { name: "Use this" }))
      ensure((await title.inputValue()) === "Lunch with Ana", `USE THIS left the title "${await title.inputValue()}"`)
      ensure((await form.getByRole("textbox", { name: "Start time" }).inputValue()) === "13:00", "USE THIS did not set the start")
      ensure((await form.getByRole("textbox", { name: "End time" }).inputValue()) === "14:00", "USE THIS did not set the end")
      ensure(/Friday, November 13/.test(await form.getByRole("button", { name: /^Start date/ }).getAttribute("aria-label")), "USE THIS did not set the day")
      ensure((await form.getByRole("textbox", { name: "Location" }).inputValue()) === "Bricks Cafe", "USE THIS did not set the place")
      ensure(!(await read.count()), "the helper stays after USE THIS")
      // Once a time is changed by hand, it reads no more.
      await form.getByRole("textbox", { name: "End time" }).fill("14:30")
      await title.fill("Dinner friday 7pm")
      await app.settle()
      ensure(!(await read.count()), "quick add still reads after a time was changed by hand")
      await closeForm(app)
      // The picture: a fresh form, reading a sentence.
      const again = await newEvent(app)
      await again.getByRole("textbox", { name: "Title" }).fill("Lunch with Ana tomorrow 1pm at Bricks Cafe")
      await page.evaluate(() => document.activeElement?.blur())
    },
  },
  {
    // The calendars to show, sets, and the two tools (ADR-0084; brief X1): the page head's sheet on a
    // phone, its popover at medium width, the sidebar's groups on a desktop.
    name: "calendar-calendars",
    sizes: ["phone", "desktop", "medium"],
    sean: { kind: "undrawn", area: "calendar", screen: "calendars-sheet" },
    run: async (app) => {
      const list = await calendars(app)
      // Toggling a calendar is a filter: the list stays open, and more than one may change.
      const holidays = list.getByRole("checkbox", { name: /^Holidays/ })
      await press(app, holidays)
      ensure(!(await holidays.isChecked()), "the calendar did not hide")
      ensure(await list.isVisible(), "toggling a calendar closed the list")
      await press(app, holidays)
      ensure(await holidays.isChecked(), "the calendar did not show again")
    },
    assert: async (app) => {
      const { page } = app
      const list = await groups(app)
      for (const row of ["Tasks", "Booking links", "Save as set…"]) ensure(await list.getByRole("button", { name: row, exact: true }).count(), `${row} is not in the calendars list`)
      ensure(await list.getByRole("button", { name: "Add calendars", exact: true }).count(), "the first group has no Add calendars action")
      ensure(!(await list.locator('[role="checkbox"][aria-current]').count()), "a calendar says it is the current place: it is a filter")
      // One current place: the calendar itself, which the sidebar names under Apps and the layer in its own list.
      ensure((await oneCurrent((await switcherLayer(page).count()) ? list : sidebar(page), "the calendars list")) === "Calendar", "Calendar is not the current place")
      // Quick add left the list for the event form's title (ADR-0099; brief C4, Q5); the month f3 left in the
      // list column is "Go to date" now (ADR-0098).
      ensure(!(await list.getByRole("textbox", { name: "Quick add event" }).count()), "Quick add is still in the calendars list")
      if (app.phone) ensure(await list.getByRole("switch", { name: "Hours" }).count(), "the phone's calendars have no Hours switch")
      else ensure(await page.getByRole("button", { name: "Go to date", exact: true }).count(), "Go to date is gone")
    },
  },
  {
    name: "calendar-add-calendars",
    run: async (app) => {
      const list = await calendars(app)
      await press(app, list.getByRole("button", { name: "Add calendars", exact: true }))
    },
  },
  {
    name: "calendar-plan-task",
    run: async (app) => {
      await area(app, "Calendar")
      await pick(app, "Tasks")
      await press(app, button(app.page, "Plan: Board games"))
    },
  },
  {
    name: "calendar-booking-link",
    run: async (app) => {
      await area(app, "Calendar")
      await pick(app, "Booking links")
      await press(app, button(app.page, "New booking link"))
      await app.page.getByRole("dialog", { name: "New booking link" }).getByRole("textbox", { name: "Title" }).fill("Intro call")
    },
  },
  {
    name: "calendar-booking-page", // the public booking page (ADR-0026), as the demo previews it
    run: async (app) => {
      await area(app, "Calendar")
      await pick(app, "Booking links")
      await press(app, button(app.page, "New booking link"))
      const form = app.page.getByRole("dialog", { name: "New booking link" })
      await form.getByRole("textbox", { name: "Title" }).fill("Intro call")
      await form.getByRole("button", { name: "Add link" }).click()
      await toastGone(app)
      await press(app, button(app.page, "Preview Intro call"))
    },
  },
  {
    // Tasks is a place of its own (ADR-0084; brief C6): today's panel in the list column, the screen on a phone.
    name: "places-tasks",
    sizes: ["phone", "desktop", "medium"],
    run: async (app) => {
      await area(app, "Calendar")
      await pick(app, "Tasks")
    },
    assert: async (app) => {
      const { page } = app
      ensure(await page.getByRole("region", { name: "Tasks" }).first().isVisible(), "the Tasks panel is not showing")
      ensure(await button(page, "Plan: Board games").first().isVisible(), "a task cannot be planned from here")
      if (app.phone) ensure((await headTitle(page)) === "Tasks", "the phone's page head does not name Tasks")
      if (await sidebar(page).locator('[aria-label="Tasks"]').count()) ensure((await oneCurrent(sidebar(page), "the sidebar")) === "Tasks", "Tasks is not the sidebar's current place")
      else ensure((await oneCurrent(await groups(app), "the calendars list")) === "Tasks", "Tasks is not the current place")
      if (await switcherLayer(page).count()) await leaveLayer(app)
      // Back is the calendar again.
      await goBack(app)
      ensure(!(await page.getByRole("region", { name: "Tasks" }).count()), "Back from Tasks did not return to the calendar")
      await page.goForward()
      await app.settle()
    },
  },
  {
    // Booking links, a place too (brief C7). On the way: the second time zone, which left the
    // calendar's side list for Settings › Calendar.
    name: "places-booking-links",
    sizes: ["phone", "desktop", "medium"],
    run: async (app) => {
      await settings(app, "Calendar")
      ensure(await app.page.getByRole("group", { name: "Second time zone" }).isVisible(), "Settings › Calendar has no second time zone")
      await area(app, "Calendar")
      await pick(app, "Booking links")
    },
    assert: async (app) => {
      const { page } = app
      ensure(await page.getByRole("region", { name: "Booking links" }).first().isVisible(), "the Booking links panel is not showing")
      ensure(await button(page, "New booking link").first().isVisible(), "a booking link cannot be made from here")
      if (await sidebar(page).locator('[aria-label="Booking links"]').count()) ensure((await oneCurrent(sidebar(page), "the sidebar")) === "Booking links", "Booking links is not the sidebar's current place")
    },
  },
  {
    // The menu-bar calendar's own small window (ADR-0054). Its month is the shared month grid (ADR-0088).
    name: "mini-calendar",
    path: "/?mini",
    assert: async ({ page }) => {
      const grid = page.getByRole("grid", { name: "November 2026" })
      ensure(await grid.getByRole("gridcell", { name: /^Thursday, November 12, today, \d+ events?$/ }).getAttribute("aria-selected") === "true", "today is not the picked day, named with its events")
      ensure((await grid.getByRole("gridcell").count()) === 42, "the month is not six weeks")
    },
  },
  {
    // The date-and-time picker and the month grid's keys (ADR-0088; briefs M8 and C3), from the
    // composer's Send later: a popover on a desktop, a sheet on a phone. It ends on Friday the 20th
    // picked, so the picture shows the block, and today's edge under the 12th.
    name: "picker-keys",
    sean: { kind: "undrawn", area: "mail", screen: "pick-date-time" },
    run: async (app) => {
      const { page } = app
      const message = await compose(app)
      const open = async () => {
        // (Held as an element: an open menu hides the form behind it from roles.)
        const later = await message.getByRole("button", { name: "Send later" }).elementHandle()
        await later.click()
        await app.settle()
        // The one button opens the menu and anchors the picker: it says the menu's state, not the picker's.
        ensure((await later.getAttribute("aria-expanded")) === "true" && (await later.getAttribute("aria-haspopup")) === "menu", "Send later does not say its menu is open")
        await press(app, page.getByRole("menuitem", { name: "Pick a time…" }))
        ensure((await later.getAttribute("aria-expanded")) === "false", "Send later says its menu is open under the picker")
        return page.getByRole("dialog", { name: "Send later" })
      }
      let picker = await open()
      // Esc closes the picker, and only the picker.
      await page.keyboard.press("Escape")
      await app.settle()
      ensure(!(await picker.count()), "Esc did not close the picker")
      ensure(await message.isVisible(), "Esc in the picker closed the message too")
      picker = await open()
      const box = await picker.boundingBox()
      if (app.phone) ensure(Math.round(box.width) === app.viewport.width && Math.round(box.y + box.height) === app.viewport.height, "on a phone the picker is not a sheet at the foot")
      else ensure(Math.round(box.width) === 320, `the picker's popover is ${Math.round(box.width)} wide, not 320`)
      const focused = () => page.evaluate(() => `${document.activeElement?.getAttribute("role")}: ${document.activeElement?.getAttribute("aria-label")}`)
      const grid = (month) => picker.getByRole("grid", { name: month })
      const day = (name) => picker.getByRole("gridcell", { name })
      // It opens on the picked day: today.
      ensure(/^gridcell: Thursday, November 12/.test(await focused()), `the picker opened on "${await focused()}", not on its day`)
      ensure((await day(/^Thursday, November 12/).getAttribute("aria-selected")) === "true", "today is not the picked day")
      ensure((await day(/^Thursday, November 12/).getAttribute("aria-current")) === "date", "today is not marked as today")
      // Arrows move a day, and a week.
      await page.keyboard.press("ArrowRight")
      ensure(/November 13/.test(await focused()), `ArrowRight went to "${await focused()}"`)
      await page.keyboard.press("ArrowDown")
      ensure(/November 20/.test(await focused()), `ArrowDown went to "${await focused()}"`)
      ensure((await day(/^Thursday, November 12/).getAttribute("aria-selected")) === "true", "moving with the arrows picked a day")
      // Enter picks.
      await page.keyboard.press("Enter")
      ensure((await day(/^Friday, November 20/).getAttribute("aria-selected")) === "true", "Enter did not pick the day")
      ensure(await picker.isVisible(), "Enter in the grid closed the picker")
      // Page Down and Page Up move a month; the grid is named for it.
      await page.keyboard.press("PageDown")
      await app.settle()
      ensure(await grid("December 2026").isVisible(), "Page Down did not show December")
      ensure(/December 20/.test(await focused()), `Page Down went to "${await focused()}"`)
      await page.keyboard.press("PageUp")
      await app.settle()
      ensure(await grid("November 2026").isVisible(), "Page Up did not return to November")
      // Home and End: the week's ends.
      await page.keyboard.press("Home")
      ensure(/Sunday, November 15/.test(await focused()), `Home went to "${await focused()}"`)
      await page.keyboard.press("End")
      ensure(/Saturday, November 21/.test(await focused()), `End went to "${await focused()}"`)
      // An arrow off the month's edge shows the next month.
      for (let i = 0; i < 2; i++) await page.keyboard.press("ArrowDown")
      await app.settle()
      ensure(await grid("December 2026").isVisible() && /December 5/.test(await focused()), `two weeks down went to "${await focused()}"`)
      // The paging buttons.
      await press(app, picker.getByRole("button", { name: "Previous month" }))
      ensure(await grid("November 2026").isVisible(), "Previous month did not return to November")
      // A time in the past is the field's error, and the primary does not schedule.
      const error = picker.getByText("Pick a time at least a minute from now.")
      ensure(!(await error.count()), "the picker shows the error before a past time is picked")
      await press(app, day(/^Wednesday, November 11/))
      ensure(await error.isVisible(), "a past time shows no error")
      ensure((await picker.getByRole("textbox", { name: "Time" }).getAttribute("aria-invalid")) === "true", "the Time field is not marked invalid")
      await press(app, picker.getByRole("button", { name: "Schedule", exact: true }))
      ensure(await picker.isVisible(), "a past time was scheduled")
      // Back on a day ahead, the error goes.
      await press(app, day(/^Friday, November 20/))
      ensure(!(await error.count()), "the error stayed after a day ahead was picked")
      await page.mouse.move(0, 0)
    },
    assert: async ({ page }) => {
      const picker = page.getByRole("dialog", { name: "Send later" })
      ensure((await picker.getByRole("button", { name: "Schedule", exact: true }).count()) === 1, "the picker does not have its one primary")
      ensure((await picker.getByRole("gridcell").count()) === 42, "the month is not six weeks")
      ensure((await picker.getByRole("columnheader").count()) === 7, "the month has no weekday initials")
    },
  },
  {
    // The time-zone picker (ADR-0088; brief C3), from a new event: "Yours" first, found by typing.
    name: "zone-picker",
    run: async (app) => {
      const { page } = app
      const form = await newEvent(app)
      const open = async () => {
        await press(app, form.getByRole("button", { name: "Change time zone" }))
        return page.getByRole("dialog", { name: "Time zone" })
      }
      let picker = await open()
      const options = picker.getByRole("option")
      ensure(/^Yours \/\/ Los Angeles/.test((await options.first().innerText()).trim()), `the first zone is "${await options.first().innerText()}", not yours`)
      const all = await options.count()
      ensure(all > 300, `the list has ${all} zones`)
      const search = picker.getByRole("combobox", { name: "Search time zones" })
      await search.fill("lisb")
      await app.settle()
      const found = await options.allInnerTexts()
      ensure(found.length === 1 && /^Lisbon/.test(found[0].trim()), `"lisb" found: ${found.join(" | ")}`)
      // By short name too, and by region.
      await search.fill("PST")
      await app.settle()
      ensure(/^Yours/.test((await options.first().innerText()).trim()), "your zone is not found by its short name")
      await search.fill("europe")
      await app.settle()
      ensure((await options.count()) > 20 && (await options.count()) < all, `"europe" found ${await options.count()} zones`)
      await search.fill("zzzz")
      await app.settle()
      ensure(await picker.getByText("No time zone like that.").isVisible(), "nothing found says nothing")
      await search.fill("lisbon")
      await app.settle()
      await press(app, options.first())
      ensure(!(await picker.count()), "picking a zone did not close the picker")
      ensure(/^Lisbon \(/.test((await form.locator('[data-slot="event-zone"]').innerText()).trim()), "the event does not show Lisbon")
      ensure(/your time\.$/.test((await form.locator('[data-slot="zone-note"]').innerText()).trim()), "the event does not say what that is on your clock")
      // The picture: the list open again, narrowed, with the picked zone marked.
      picker = await open()
      await picker.getByRole("combobox", { name: "Search time zones" }).fill("lis")
      await app.settle()
    },
  },
]
