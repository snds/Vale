// Notes: the list, cards and map, a note and its menu, folders, import, sync and the quick note.
import { area, button, ensure, formatBar, formLayer, formPrimary, goBack, groups, headTitle, leaveLayer, oneCurrent, pick, press, switcherLayer, toastGone } from "./helpers.mjs"

/** The notes list: its sections of rows, or of cards (ADR-0105). */
const notesList = (page) => page.locator('[data-role="notes-list"]:visible')
/** Opens a note from the Notes list by its title. */
export const note = async (app, name) => {
  await area(app, "Notes")
  await press(app, notesList(app.page).getByRole("button", { name }).first())
}
/** Shows the notes as a list, as cards or as the map (brief N1): the page head's chips, or the phone's Folders sheet. */
const notesView = async (app, name) => {
  await area(app, "Notes")
  const within = app.phone ? await groups(app) : app.page
  await press(app, within.getByRole("radiogroup", { name: "View" }).getByRole("radio", { name, exact: true }))
}
/** A section of the notes list by its header, and the overline count it shows. */
const section = (page, name) => notesList(page).getByRole("region", { name, exact: true })
/** The text of a note's row, by its title: its meta line and its tag. */
const rowText = async (page, title) => (await notesList(page).getByRole("listitem").filter({ hasText: title }).first().textContent()) ?? ""
/** The map's square for a note or a linked item, by the start of its name. */
const square = (page, name) => page.locator(`[data-node][aria-label^="${name}"]`)
/** Opens the sample checklist's note menu, and one of its items when given. */
export const noteAction = async (app, item) => {
  await note(app, /Cabin packing list/)
  await press(app, button(app.page, "Note actions"))
  if (item) await press(app, app.page.getByRole("menuitem", { name: item }))
}
/** An item from the Notes area's More menu. */
export const notesMenu = async (app, item) => {
  await area(app, "Notes")
  await press(app, button(app.page, "More"))
  await press(app, app.page.getByRole("menuitem", { name: item }))
}

export const scenes = [
  {
    // The list (ADR-0105; Mobile / 14, Desktop / 11's list column): DUE, PINNED, RECENT with their counts; a row is
    // the title, a mono detail and one tag, with no snippet; the relay's state in the status line.
    name: "notes",
    sizes: ["desktop", "phone", "medium"],
    sean: { kind: "drawn", area: "notes", screen: "list" },
    run: (app) => area(app, "Notes"),
    assert: async (app) => {
      const { page } = app
      for (const [name, count] of [["Pinned", "01"], ["Recent", "03"]]) {
        const header = section(page, name).locator('[data-slot="section-header"]')
        ensure((await header.textContent())?.includes(count), `the ${name} header does not count ${count}`)
      }
      ensure(!(await section(page, "Due").count()), "a Due section shows with no reminder passed")
      const cabin = await rowText(page, "Cabin packing list")
      ensure(/Edited \d\d:\d\d \/\/ 4 items/.test(cabin), `the pinned row's detail reads “${cabin}”`)
      ensure(cabin.includes("Pinned"), "the pinned row has no PINNED tag")
      // The checklist's own words never show in a row: rows carry no snippet.
      ensure(!cabin.includes("Board games"), "the row shows its snippet")
      ensure(!(await notesList(page).locator('[data-slot="list-row-detail"]').count()), "a row has a snippet line")
      const review = await rowText(page, "Design review agenda")
      ensure(/Edited \d\d:\d\d \/\/ 1 linked/.test(review) && review.includes("#work"), `the agenda's row reads “${review}”`)
      // A note's color is its row's square, and never a tint behind the open note.
      ensure((await notesList(page).locator('[data-role="note-swatch"].bg-swatch-05').count()) === 1, "the green note has no green square")
      ensure(!(await page.locator('[style*="--c-note-card"]').count()), "a note's color still tints a surface")
      ensure(!(await page.locator('[data-slot="note-color-dot"]').count()), "the old round color dot is still drawn")
      // The status line says the relay's state (Desktop / 11's fact, brief N1).
      if (app.size === "desktop") ensure(/Sync off \/\/ edited \d\d:\d\d/.test((await page.locator('[data-slot="app-frame-status-line"]').textContent()) ?? ""), "the status line does not say the relay's state")
    },
  },
  {
    // Cards (brief N1): tiles with the swatch's top edge, in 2, 3 and 4 columns; the list has the room until a note opens.
    name: "notes-cards",
    sizes: ["desktop", "phone", "medium"],
    sean: { kind: "undrawn", area: "notes", screen: "cards" },
    run: (app) => notesView(app, "Cards"),
    assert: async (app) => {
      const { page } = app
      const grid = page.getByRole("list", { name: "Note cards" }).last()
      const box = await grid.boundingBox()
      const tile = await grid.locator('[data-slot="tile"]').first().boundingBox()
      const columns = { phone: 2, medium: 3, desktop: 4 }[app.size]
      ensure(Math.abs(tile.width - (box.width - (columns - 1) * 16) / columns) < 2, `the cards are ${Math.round(tile.width)} wide in ${Math.round(box.width)}: not ${columns} columns`)
      ensure((await page.locator('[data-slot="tile"]').count()) === 4, "not every note is a card")
      ensure((await page.locator('[data-slot="tile"]').filter({ hasText: "Edited" }).count()) === 4, "a card has no Edited foot")
    },
  },
  {
    // The map (brief N1): notes as small squares, links as hairlines, the toolbar bottom right.
    name: "notes-map",
    sizes: ["desktop", "phone", "medium"],
    sean: { kind: "undrawn", area: "notes", screen: "map" },
    run: (app) => notesView(app, "Map"),
    assert: async (app) => {
      const { page } = app
      const tools = page.getByRole("toolbar", { name: "Map" })
      for (const name of ["Zoom in", "Zoom out", "Fit", "Unlinked notes"]) ensure(await tools.getByRole("button", { name, exact: true }).count(), `the map's toolbar has no ${name}`)
      ensure((await page.locator('[data-node][tabindex="0"]').count()) === 1, "the map is not one Tab stop")
      ensure(!(await page.locator('[data-node] circle').count()), "the map still draws round nodes")
    },
  },
  {
    // The map's keys and its selection (brief N1): arrows walk along links, Enter opens, and the open note is
    // an outline on the soft fill, never a solid square. Unlinked notes go and come back from the toolbar.
    name: "notes-map-keys",
    run: async (app) => {
      const { page } = app
      await notesView(app, "Map")
      // Off, the note with no links leaves the map; on, it is back.
      const unlinked = page.getByRole("toolbar", { name: "Map" }).getByRole("button", { name: "Unlinked notes", exact: true })
      const all = await page.locator('[data-kind="note"]').count()
      ensure((await unlinked.getAttribute("aria-pressed")) === "true", "Unlinked notes is not on to start with")
      await press(app, unlinked)
      ensure((await unlinked.getAttribute("aria-pressed")) === "false" && (await page.locator('[data-kind="note"]').count()) <= all, "Unlinked notes did not turn off")
      await press(app, unlinked)
      ensure((await page.locator('[data-kind="note"]').count()) === all, "Unlinked notes did not bring every note back")
      // From the agenda, an arrow goes to a square it links to.
      const start = square(page, "Design review agenda")
      const linked = ["Icon axis ideas", "Event: Design review"]
      let walked = null
      for (const key of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]) {
        await start.focus()
        await page.keyboard.press(key)
        const name = await page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? "")
        if (linked.some((l) => name.startsWith(l))) walked = name
      }
      ensure(walked, "no arrow key walks from the agenda to a square it links to")
      await start.focus()
      await page.keyboard.press("Enter")
      await app.settle()
      ensure(await page.getByRole("region", { name: "Notes: what is open" }).count(), "Enter did not open the agenda")
      await page.mouse.move(0, 0)
    },
    assert: async (app) => {
      const { page } = app
      // A phone pushes the note over the map; a desktop keeps the map beside it, with the note selected.
      if (app.phone) return
      const picked = page.locator("[data-node][data-selected]")
      ensure((await picked.count()) === 1, "the open note is not selected on the map")
      const outline = picked.locator('[data-role="selection"]')
      ensure((await outline.getAttribute("fill")) === "none" && (await outline.getAttribute("stroke")) === "var(--primary-fill)", "the selection is not a primary outline")
      ensure((await picked.locator('[data-role="square"]').getAttribute("fill")) === "var(--primary-soft)", "the selected square is not on the soft fill")
      ensure(!(await page.locator('[data-node] [fill="var(--primary-fill)"]').count()), "a square on the map is solid primary")
    },
  },
  {
    // DUE (brief N1): a reminder that has passed lifts its note above PINNED, with the DUE tag.
    name: "notes-due",
    scenario: "notes-due",
    run: (app) => area(app, "Notes"),
    assert: async ({ page }) => {
      const first = notesList(page).getByRole("region").first()
      ensure((await first.getAttribute("aria-label")) === "Due", "Due is not the first section")
      const gifts = await rowText(page, "Gift ideas for Marcus")
      ensure(gifts.includes("Due"), `the due note's row reads “${gifts}”`)
    },
  },
  {
    // A tag narrows the open folder (brief X1, N1): the overline reads NOTES // #TAG // NN.
    name: "notes-tag",
    run: async (app) => {
      await area(app, "Notes")
      await pick(app, "#work")
    },
    assert: async ({ page }) => {
      const overline = (await page.locator('[data-slot="page-head-overline"]:visible').first().textContent()) ?? ""
      ensure(/Notes \/\/ #work \/\/ 01/i.test(overline), `the overline reads “${overline}”`)
      ensure((await notesList(page).getByRole("listitem").count()) === 1, "the tag did not narrow the list to its note")
    },
  },
  {
    // The Archive (brief N1): its own title, and the archived notes.
    name: "notes-archive",
    run: async (app) => {
      await area(app, "Notes")
      await pick(app, "Archive")
    },
    assert: async ({ page }) => {
      ensure((await headTitle(page)) === "Archive", "the Archive's title is not Archive")
      ensure((await rowText(page, "Old color experiments")).includes("#design"), "the archived note is not listed with its tag")
    },
  },
  {
    // The relay's error (brief N1; channel 4): one critical banner over Notes, and OPEN SYNC opens the set-up.
    name: "notes-relay-error",
    scenario: "relay-error",
    run: async (app) => {
      const { page } = app
      await area(app, "Notes")
      const banner = page.locator('[data-slot="banner"]').filter({ hasText: "Notes didn't sync" })
      ensure(await banner.isVisible(), "no banner says the notes didn't sync")
      ensure((await banner.textContent()).includes("The relay refused the token"), "the banner does not give the relay's words")
      await press(app, banner.getByRole("button", { name: "Open sync" }))
      ensure(await page.getByRole("dialog", { name: "Sync notes between devices" }).isVisible(), "Open sync did not open the sync set-up")
      await page.keyboard.press("Escape")
      await app.settle()
      await page.evaluate(() => document.activeElement?.blur())
    },
  },
  {
    // Nothing yet (brief 5.2): NOTES // 00 with IMPORT.
    name: "notes-empty",
    scenario: "notes-empty",
    run: (app) => area(app, "Notes"),
    assert: async ({ page }) => {
      ensure(await page.getByText("No notes yet.").isVisible(), "the empty list does not say “No notes yet.”")
      ensure(await page.getByRole("button", { name: "Import", exact: true }).isVisible(), "the empty list has no Import")
    },
  },
  {
    // A failed read with nothing to show (cross-app decisions §9): the critical empty state with TRY AGAIN.
    name: "notes-error",
    scenario: "notes-read-fails",
    loading: true,
    run: async (app) => {
      await area(app, "Notes")
      // The read is tried again a few times before it counts as failed.
      await app.page.getByText("Can’t load your notes.").waitFor({ timeout: 20_000 })
      await app.settle()
    },
    assert: async ({ page }) => {
      ensure(await page.getByRole("button", { name: "Try again", exact: true }).isVisible(), "the failed list has no Try again")
    },
  },
  {
    // The More menu keeps the set-up until Settings › Notes takes it (brief T5): every item still works.
    name: "notes-more",
    run: async (app) => {
      const { page } = app
      const menu = async () => {
        await area(app, "Notes")
        await press(app, button(page, "More"))
      }
      const item = (name) => page.getByRole("menuitem", { name })
      const check = (name) => page.getByRole("menuitemcheckbox", { name })
      await menu()
      await press(app, item("Import notes…"))
      ensure(await page.getByRole("dialog", { name: "Import notes" }).isVisible(), "Import notes… opened nothing")
      await page.keyboard.press("Escape")
      await app.settle()
      await menu()
      await press(app, item("Export all as Markdown"))
      ensure(await page.locator("[data-sonner-toast]").filter({ hasText: "Notes saved to" }).count(), "Export all as Markdown saved nothing")
      await toastGone(app)
      await menu()
      await press(app, item("Sync between devices…"))
      ensure(await page.getByRole("dialog", { name: "Sync notes between devices" }).isVisible(), "Sync between devices… opened nothing")
      await page.keyboard.press("Escape")
      await app.settle()
      // The two switches keep the menu open: each turns, says so, and turns back, so the demo is as it was.
      for (const name of ["Move checked items down", "Find text in images"]) {
        await menu()
        const before = await check(name).getAttribute("aria-checked")
        await press(app, check(name))
        const after = await check(name).getAttribute("aria-checked")
        ensure(before !== after, `${name} did not change`)
        await press(app, check(name))
        ensure((await check(name).getAttribute("aria-checked")) === before, `${name} did not turn back`)
        await page.keyboard.press("Escape")
        await app.settle()
      }
      await menu()
    },
  },
  { name: "notes-note", run: (app) => note(app, /Cabin packing list/) }, // a checklist, linked to an event, in a color
  {
    // A reminder at any date and time (ADR-0088; brief N2): the shared picker from the note's bell.
    name: "notes-remind-time",
    run: async (app) => {
      await note(app, /Cabin packing list/)
      await press(app, button(app.page, "Remind me"))
      await press(app, app.page.getByRole("menuitem", { name: "Pick a date and time…" }))
      const picker = app.page.getByRole("dialog", { name: "Remind me" })
      await press(app, picker.getByRole("gridcell", { name: /^Friday, November 13/ }))
      await press(app, picker.getByRole("button", { name: "Set reminder", exact: true }))
      ensure(!(await picker.count()), "Set reminder did not close the picker")
      // The bell now says when; the picker opens from it again.
      await press(app, app.page.getByRole("button", { name: /^Reminder: Tomorrow, 11:00/ }))
      await press(app, app.page.getByRole("menuitem", { name: "Pick a date and time…" }))
      await app.page.mouse.move(0, 0)
    },
    assert: async ({ page }) => {
      const picker = page.getByRole("dialog", { name: "Remind me" })
      ensure(await picker.getByRole("button", { name: "Set reminder", exact: true }).isVisible(), "the reminder picker has no Set reminder button")
      ensure((await picker.getByRole("gridcell", { name: /^Friday, November 13/ }).getAttribute("aria-selected")) === "true", "the picker did not open on the reminder already set")
    },
  },
  {
    // The note's format bar (ADR-0089; briefs N2 and 1.4): the shared bar with Heading and Checklist and the
    // note's own actions at its end. Docked at the column's foot; on a phone it stands above the keyboard
    // and scrolls sideways.
    name: "notes-format-bar",
    sean: { kind: "undrawn", area: "notes", screen: "format-bar" },
    run: async (app) => {
      const { page } = app
      await note(app, /Cabin packing list/)
      const names = ["Heading", "Bold", "Italic", "Link", "Bulleted list", "Numbered list", "Checklist", "Quote", "Code", "Link to a note", "Add image", "Scan a document", "Sketch"]
      const bar = await formatBar(app, page, names)
      const wrap = page.locator('[data-slot="format-bar"]')
      const mode = await wrap.getAttribute("data-mode")
      ensure(mode === (app.phone ? "keyboard" : "docked"), `the note's format bar is in the ${mode} mode`)
      const box = await wrap.boundingBox()
      const room = await wrap.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }))
      if (app.phone) {
        ensure(room.scroll > room.client, "the phone's format bar does not scroll sideways")
        // Its last button is reached by the keys, and comes into view.
        await bar.getByRole("button", { name: "Bold", exact: true }).focus()
        await page.keyboard.press("End")
        await app.settle()
        const last = await bar.getByRole("button", { name: "Sketch", exact: true }).boundingBox()
        ensure(last.x >= 0 && last.x + last.width <= app.viewport.width, "End did not bring the last button into view")
        await page.keyboard.press("Home")
      } else ensure(room.scroll <= room.client, "the docked format bar is cut off")
      ensure(box.y + box.height <= app.viewport.height + 1 && box.y + box.height >= app.viewport.height - 64, `the format bar ends at ${Math.round(box.y + box.height)}: not docked at the foot of the note's column`)
      // A checklist row says so on the bar.
      await page.locator(".ProseMirror li").first().click()
      await app.settle()
      ensure((await bar.getByRole("button", { name: "Checklist", exact: true }).getAttribute("aria-pressed")) === "true", "Checklist is not on in a checklist row")
    },
  },
  { name: "notes-note-actions", run: (app) => noteAction(app) },
  { name: "notes-share", run: (app) => noteAction(app, "Share…") },
  { name: "notes-lock", run: (app) => noteAction(app, "Lock note") },
  {
    name: "notes-link",
    run: async (app) => {
      await note(app, /Cabin packing list/)
      await press(app, button(app.page, "Link to an event, person, or conversation"))
    },
  },
  {
    name: "notes-sketch",
    run: async (app) => {
      await note(app, /Cabin packing list/)
      await press(app, app.page.getByRole("toolbar", { name: "Formatting" }).getByRole("button", { name: "Sketch" }))
    },
  },
  {
    // The smart folder form (brief N1), in the form layer: written in, so every part shows.
    name: "notes-smart-folder",
    sean: { kind: "undrawn", area: "notes", screen: "smart-folder-form" },
    run: async (app) => {
      const { page } = app
      await area(app, "Notes")
      await pick(app, "New smart folder…")
      const form = page.getByRole("dialog", { name: /New smart folder/ })
      await form.getByRole("textbox", { name: "Name" }).fill("Trip planning")
      const tags = form.getByRole("textbox", { name: "Has any of these tags" })
      await tags.fill("trip")
      await tags.press("Enter")
      await press(app, form.getByRole("radio", { name: "Green", exact: true }))
      await page.evaluate(() => document.activeElement?.blur())
      await app.settle()
    },
    assert: async ({ page }) => {
      const form = page.getByRole("dialog", { name: /Trip planning/ })
      ensure(await form.getByText("Notes join and leave as you write. They must match everything you fill in.").isVisible(), "the form's line is missing")
      for (const name of ["Name", "Has any of these tags", "Has the words"]) ensure(await form.getByRole("textbox", { name }).count(), `the form has no ${name}`)
      ensure((await form.getByRole("radiogroup", { name: "Color" }).getByRole("radio").count()) === 12, "the color choice is not two rules and ten colors")
      for (const name of ["Has a reminder", "Has to-dos left"]) ensure(await form.getByRole("switch", { name }).count(), `the form has no ${name} switch`)
      ensure(await form.getByRole("button", { name: "Change", exact: true }).count(), "LINKED TO has no Change")
      ensure(await formPrimary(form, "Create folder").count(), "the form's yes is not Create folder")
    },
  },
  {
    // A smart folder saves and becomes the place; DELETE says its notes stay, and UNDO brings it back (brief N1).
    name: "notes-smart-folder-save",
    run: async (app) => {
      const { page } = app
      await area(app, "Notes")
      await pick(app, "New smart folder…")
      const form = page.getByRole("dialog", { name: /New smart folder/ })
      await form.getByRole("textbox", { name: "Name" }).fill("This week")
      await form.getByRole("textbox", { name: "Has the words" }).fill("agenda")
      // LINKED TO: picked from its menu, a sheet on a phone.
      await press(app, form.getByRole("button", { name: "Change", exact: true }))
      await press(app, page.getByRole("menuitemradio", { name: "An event" }).or(page.getByRole("radio", { name: "An event" })).first())
      ensure((await form.textContent()).includes("An event"), "LINKED TO did not take An event")
      await press(app, formPrimary(form, "Create folder"))
      ensure(!(await form.count()), "Create folder did not close the form")
      ensure((await headTitle(page)) === "This week", "the new folder is not the place")
      await toastGone(app)
      // Its edit action opens it again; DELETE leaves all notes.
      await pick(app, "Edit smart folder This week")
      const edit = page.getByRole("dialog", { name: /This week/ })
      await press(app, edit.getByRole("button", { name: "Delete", exact: true }))
      ensure((await headTitle(page)) === "Notes", "deleting the open folder did not return to all notes")
      const toast = page.locator("[data-sonner-toast]").filter({ hasText: "Deleted This week" })
      ensure((await toast.textContent()).includes("Its notes are still in Notes"), "the delete toast does not say the notes stay")
      await press(app, toast.getByRole("button", { name: "Undo" }))
      ensure((await headTitle(page)) === "This week", "Undo did not bring the folder back as the place")
      const list = await groups(app)
      ensure(await list.locator('[aria-label^="This week"]').count(), "Undo did not put the folder back in Folders")
      if (app.phone) await leaveLayer(app)
      await page.mouse.move(0, 0)
    },
  },
  {
    // A smart folder in the form layer (ADR-0087).
    name: "form-layer-smart-folder",
    sizes: ["desktop", "phone", "medium"],
    run: async (app) => {
      const { page } = app
      const open = async () => {
        await area(app, "Notes")
        await pick(app, "New smart folder…")
        return page.getByRole("dialog", { name: "New smart folder" })
      }
      // A folder needs a rule as well as a name.
      const write = async (form) => {
        await form.getByRole("textbox", { name: "Has the words" }).fill("agenda")
        await form.getByRole("textbox", { name: "Name" }).fill("This week")
      }
      await formLayer(app, { open, write, primary: "Create folder" })
      const toast = page.locator("[data-sonner-toast]").first()
      await toast.waitFor()
      await page.mouse.move(0, 0)
      await toast.waitFor({ state: "detached", timeout: 15_000 })
      await write(await open())
    },
  },
  { name: "notes-import", run: (app) => notesMenu(app, "Import notes…") },
  { name: "notes-sync", run: (app) => notesMenu(app, "Sync between devices…") },
  { name: "notes-quick-note", run: (app) => app.page.keyboard.press("Alt+KeyN") },
  {
    // Notes' folders and tags (ADR-0084; brief X1): the page head's sheet on a phone, with the view
    // choice as its last group; its popover at medium width; the sidebar's groups on a desktop.
    name: "notes-folders-sheet",
    sizes: ["phone", "desktop", "medium"],
    sean: { kind: "undrawn", area: "notes", screen: "folders-sheet" },
    run: async (app) => {
      const { page } = app
      await area(app, "Notes")
      // A folder is a place: Pinned opens from its row, and Back is all notes again.
      await pick(app, "Pinned")
      ensure((await headTitle(page)) === "Pinned", "Pinned did not open from the folders")
      await goBack(app)
      ensure((await headTitle(page)) === "Notes", "Back from Pinned did not return to all notes")
      // A tag narrows the open folder, one at a time, and clears on a second pick.
      const tag = async () => (await groups(app)).getByRole("checkbox").first()
      const name = await (await tag()).getAttribute("aria-label")
      await press(app, await tag())
      ensure(await (await tag()).isChecked(), `${name} did not narrow the folder`)
      ensure((await page.locator('[data-slot="page-head-overline"]:visible').first().innerText()).toLowerCase().includes(name.toLowerCase()), "the page head does not name the tag")
      await press(app, await tag())
      ensure(!(await (await tag()).isChecked()), `${name} did not clear on a second pick`)
      // "Open a shared note…" opens through its intent; the layer closes first.
      await pick(app, "Open a shared note…")
      ensure(await page.getByRole("dialog", { name: "Open a shared note" }).isVisible(), "Open a shared note did not open")
      ensure(!(await switcherLayer(page).count()), "the layer stayed open under the form")
      await leaveLayer(app)
      await groups(app)
    },
    assert: async (app) => {
      const { page } = app
      const list = await groups(app)
      ensure((await oneCurrent(list, "Notes' folders")) === "All notes", "All notes is not the current place")
      for (const row of ["Pinned", "Archive", "New smart folder…", "Open a shared note…"]) ensure(await list.getByRole("button", { name: row, exact: true }).count(), `${row} is not in Notes' folders`)
      ensure(!(await list.locator('[role="checkbox"][aria-current]').count()), "a tag says it is the current place: it is a filter")
      // The phone's sheet ends with how the notes are drawn; elsewhere the page head keeps that choice.
      const view = list.getByRole("radiogroup", { name: "View" })
      if (app.size === "phone") ensure(await view.getByRole("radio", { name: "List", exact: true }).isChecked(), "the sheet does not end with the view choice, on List")
      else ensure(!(await view.count()), "the view choice is in the list, and it is the phone sheet's alone")
      ensure(!(await page.getByRole("menuitem").count()), "a menu is open under the list")
    },
  },
]
