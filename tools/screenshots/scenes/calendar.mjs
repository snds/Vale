// Calendar: every view, an event and its editor, the calendars list, booking links, and the menu-bar window.
import { area, button, ensure, formLayer, goBack, groups, headTitle, leaveLayer, oneCurrent, pick, press, sidebar, switcherLayer, toastGone } from "./helpers.mjs"
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
    // An event open (Desktop / 07): from Upcoming, in the detail column beside the list, where it is the
    // selected card and the next event is neutral with its NEXT line. A phone's Day pushes it.
    name: "calendar-event",
    run: async (app) => {
      await calendarView(app, app.phone ? "Day" : "Upcoming")
      await press(app, app.page.getByRole("button", { name: /^Token audit review, / }).first())
    },
    assert: async ({ page, phone }) => {
      if (phone) return
      const { selected, all } = await oneEmphasis(page, "Upcoming with an event open")
      ensure(selected.length === 1 && /^Token audit review/.test(selected[0].name), "the open event is not the selected card")
      const next = all.find((e) => /^Standup/.test(e.name))
      ensure(next && !next.primary, "the next event takes the selected look")
      ensure(await page.locator('[data-slot="calendar-event"]', { hasText: "Next // in" }).count(), "the next event does not say so")
    },
  },
  {
    name: "calendar-event-new",
    run: async (app) => {
      const dialog = await newEvent(app)
      await dialog.getByRole("textbox", { name: "Title" }).fill("Pick up the rental car")
    },
  },
  {
    // An event in the form layer (ADR-0087; brief 3.2): the title as typed in the header, Cancel then Add.
    name: "form-layer-event",
    sizes: ["desktop", "phone", "medium"],
    run: async (app) => {
      const write = (form) => form.getByRole("textbox", { name: "Title" }).fill("Pick up the rental car")
      await formLayer(app, { open: newEvent, write, primary: "Add" })
      await toastGone(app)
      const form = await newEvent(app)
      await write(form)
      if (!app.phone) ensure(/Pick up the rental car/.test(await form.locator('[data-slot="dialog-title"]').innerText()), "the header does not show the title as typed")
    },
  },
  {
    name: "calendar-find-time",
    run: async (app) => {
      const dialog = await newEvent(app)
      await press(app, dialog.getByRole("button", { name: "Find a time" }))
    },
  },
  {
    // Quick add stands at the end of the calendars list until the event form reads a sentence (brief C4, Q5).
    name: "calendar-quick-add",
    run: async (app) => {
      const list = await calendars(app)
      await list.getByRole("textbox", { name: "Quick add event" }).fill("Dinner with Marcus Friday 7pm")
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
      // Quick add is in the list; the month f3 left in the list column is "Go to date" now (ADR-0098).
      ensure(await list.getByRole("textbox", { name: "Quick add event" }).count(), "Quick add is gone")
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
      ensure(/your time \(Los Angeles\)/.test(await form.locator('[data-slot="zone-note"]').innerText()), "the event does not say what that is on your clock")
      // The picture: the list open again, narrowed, with the picked zone marked.
      picker = await open()
      await picker.getByRole("combobox", { name: "Search time zones" }).fill("lis")
      await app.settle()
    },
  },
]
