// Notes: the list, cards and map, a note and its menu, folders, import, sync and the quick note.
import { area, button, ensure, formatBar, formLayer, formPrimary, goBack, groups, headTitle, leaveLayer, oneCurrent, pick, press, settingsButton, switcherLayer, toastGone } from "./helpers.mjs"
import { conversation } from "./mail.mjs"

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
/** The open note's More: a menu on a desktop, a sheet on a phone (ADR-0106). */
const moreLayer = (app) => (app.phone ? app.page.getByRole("dialog", { name: "Note actions" }) : app.page.getByRole("menu", { name: "Note actions" }))
/** A row of the open note's More: a menu item on a desktop, a sheet row on a phone. */
const moreRow = (app, name) => moreLayer(app).getByRole(app.phone ? "button" : "menuitem", { name })
/** Opens the sample checklist's note menu, and one of its items when given. */
export const noteAction = async (app, item) => {
  await note(app, /Cabin packing list/)
  await press(app, button(app.page, "Note actions"))
  if (item) await press(app, moreRow(app, item))
}
/** The open note's toolbar, on a desktop: Pin, Remind, Color, More. */
const noteToolbar = (page) => page.getByRole("toolbar", { name: "Note", exact: true })
/**
 * Opens one of the note's own controls (ADR-0106): the toolbar's button on a desktop, or, on a phone,
 * the row of that name in the More sheet. Both names may be patterns.
 */
const noteControl = async (app, name, sheetRow = name) => {
  if (!app.phone) return press(app, noteToolbar(app.page).getByRole("button", { name }))
  await press(app, button(app.page, "Note actions"))
  await press(app, moreLayer(app).getByRole("button", { name: sheetRow }))
}
/** A row of a menu a note control opened: a menu item on a desktop, a sheet row on a phone. */
const layerRow = (app, name) => (app.phone ? app.page.getByRole("dialog").last().getByRole("button", { name }) : app.page.getByRole("menuitem", { name }))
/** The note's title and text, each a named field (brief N2). */
const titleField = (page) => page.getByRole("textbox", { name: "Title", exact: true })
const noteText = (page) => page.getByRole("textbox", { name: "Text", exact: true })
/** A checklist item's box, named by its words. */
const checkbox = (page, words) => noteText(page).getByRole("checkbox", { name: words, exact: true })
/** A toast by its words. */
const toastSaying = (page, words) => page.locator("[data-sonner-toast]").filter({ hasText: words })
/** The format bar, docked or above the keyboard. */
const formatting = (page) => page.getByRole("toolbar", { name: "Formatting" })
/** Puts the cursor in the note's text, on a checklist item's words: on a phone the format bar then shows. */
const writeIn = async (app, words = "Coffee + grinder") => {
  await noteText(app.page).getByText(words, { exact: true }).click()
  await app.settle()
}
/** The lock's form layer, "Lock notes" (brief N5). */
const lockForm = (page) => page.getByRole("dialog", { name: /Lock notes/ })
/** A locked note's way in, in its own space (brief N5). */
const lockedNote = (page) => page.locator('[data-role="locked-note"]')
/** The demo's passphrase and hint in the notes-locked scenario (core/demo-scenarios/notes.ts). */
const PASSPHRASE = "lake house in october"
const HINT = "Where we go every fall, and when"
/** Share "{title}" (brief N6). */
const shareForm = (page) => page.getByRole("dialog", { name: /^Share “/ })
/** The share form's captions: images stay with you, and without a key the relay can read it. */
const privacy = async (form, { sealed }) => {
  const words = await form.locator('[data-role="share-privacy"]').innerText()
  ensure(words.includes("Images in the note stay with you."), "the share form does not say images stay with you")
  ensure(words.includes("Your relay can read shared notes, as it can read the rest.") === !sealed, sealed ? "a sealed share says the relay can read it" : "the share form does not say the relay can read it")
}
/** Quick Note (brief N7). */
const quickNote = (page) => page.getByRole("dialog", { name: "Quick note" })
/** Open a shared note (brief N6), in the form layer. */
const openSharedLayer = (page) => page.getByRole("dialog", { name: /Open a shared note/ })
const openSharedForm = async (app) => {
  await area(app, "Notes")
  await pick(app, "Open a shared note…")
  const form = openSharedLayer(app.page)
  await form.waitFor()
  return form
}
/** A share link as a person would paste it (share-link.ts): someone's note, and a conversation shared with a team. */
const linkOf = (body) => `https://notes.example.com/share#${Buffer.from(JSON.stringify({ v: 1, relay: "wss://notes.example.com", ...body })).toString("base64url")}`
const SHARED_LINK = linkOf({ id: "k3Jd9QpL2xVr8TfA", mode: "edit", token: "s1.demo-token", title: "Lake trip budget", from: "Priya Raman" })
const THREAD_LINK = linkOf({ id: "w7Hn2BcQ5zYe1UgM", mode: "edit", token: "s1.demo-token", title: "Venue options", from: "Priya Raman", kind: "thread" })
/** Is the note open: its pane on a desktop, its pushed screen on a phone. */
const noteOpen = async (page) => (await page.getByRole("article", { name: "Note" }).count()) > 0
/** Settings › Notes (brief T5; ADR-0111), where the Notes More menu's set-up went: from the sidebar's or the phone's way into Settings. */
export const notesSettings = async (app) => {
  await press(app, settingsButton(app.page))
  await press(app, app.page.getByRole("navigation", { name: "Settings sections" }).getByRole("button", { name: "Notes", exact: true }))
}
/** Is Settings › Notes the open section: its column, headed by its title. */
const notesSettingsOpen = async (page) => (await page.getByRole("region", { name: "Notes", exact: true }).count()) > 0 && (await page.getByRole("heading", { name: "Notes", level: 2, exact: true }).isVisible())

/** The sketch layer (brief N3), by its title. */
const sketchLayer = (page) => page.getByRole("dialog", { name: /^(Sketch|Edit sketch)$/ })
/** The sketch's canvas: an image named for its strokes. */
const canvas = (page) => sketchLayer(page).getByRole("img", { name: /^(Empty sketch|Sketch with \d+ strokes?)$/ })
/** Opens a new sketch from the open note's format bar (on a phone it shows while writing). */
const openSketch = async (app) => {
  await note(app, /Cabin packing list/)
  if (app.phone) await writeIn(app)
  await press(app, formatting(app.page).getByRole("button", { name: "Sketch" }))
  await canvas(app.page).waitFor()
}
/** Draws a stroke on the canvas through points given as shares of its width and height. */
const draw = async (app, points) => {
  const box = await canvas(app.page).boundingBox()
  const at = ([x, y]) => [box.x + x * box.width, box.y + y * Math.min(box.height, 400)]
  const [x0, y0] = at(points[0])
  await app.page.mouse.move(x0, y0)
  await app.page.mouse.down()
  for (const p of points.slice(1)) {
    const [x, y] = at(p)
    await app.page.mouse.move(x, y, { steps: 6 })
  }
  await app.page.mouse.up()
}
/** A few strokes: a box and a tick, as a person might draw them. */
const doodle = async (app) => {
  await draw(app, [[0.2, 0.2], [0.45, 0.2], [0.45, 0.7], [0.2, 0.7], [0.2, 0.2]])
  await draw(app, [[0.55, 0.45], [0.62, 0.6], [0.8, 0.25]])
}
const strokes = async (page) => (await canvas(page).getAttribute("aria-label")) ?? ""

/** The scanner (brief N4), by its title. */
const scanLayer = (page) => page.getByRole("dialog", { name: "Scan a document" })
const openScan = async (app) => {
  await note(app, /Cabin packing list/)
  if (app.phone) await writeIn(app)
  await press(app, formatting(app.page).getByRole("button", { name: "Scan a document" }))
  await scanLayer(app.page).waitFor()
}
/**
 * A photo of a printed page on a desk, made in the page, for the scanner's file picker: what a person
 * would choose. The page leans a little, so the corners have something to square.
 */
const pagePhoto = async (page, n) => {
  const b64 = await page.evaluate((n) => {
    const c = document.createElement("canvas")
    c.width = 1200
    c.height = 1600
    const g = c.getContext("2d")
    g.fillStyle = "#4a443e"
    g.fillRect(0, 0, c.width, c.height)
    g.translate(600, 800)
    g.rotate(-0.04)
    g.fillStyle = "#f2efe8"
    g.fillRect(-440, -600, 880, 1200)
    g.fillStyle = "#2a2826"
    g.font = "600 52px Georgia, serif"
    g.fillText(`Ferry timetable, page ${n}`, -380, -480)
    g.font = "34px Georgia, serif"
    for (let i = 0; i < 12; i++) g.fillText(`${String(6 + i).padStart(2, "0")}:15  Anacortes to Friday Harbor`, -380, -380 + i * 64)
    const url = c.toDataURL("image/jpeg", 0.85)
    return url.slice(url.indexOf(",") + 1)
  }, n)
  return { name: `page-${n}.jpg`, mimeType: "image/jpeg", buffer: Buffer.from(b64, "base64") }
}
/** Chooses a photo through CHOOSE A FILE's picker, and waits for the adjust step. */
const choosePhoto = async (app, n) => {
  const layer = scanLayer(app.page)
  await layer.locator('input[data-pick="file"]').setInputFiles(await pagePhoto(app.page, n))
  await layer.getByRole("button", { name: /^Top left: / }).waitFor()
  await layer.getByRole("img", { name: "The photo to scan" }).waitFor()
  await app.settle()
}

/** The note that holds three images in the notes-images scenario. */
const imageNote = (app) => note(app, /Icon axis ideas/)
/** The toolbar of the note's nth image, and the image itself. */
const imageTools = (page, n = 0) => page.getByRole("toolbar", { name: "Image", exact: true }).nth(n)
const showImageTools = async (app, n = 0) => {
  const img = noteText(app.page).locator(".note-image").nth(n)
  await img.scrollIntoViewIfNeeded()
  if (!app.touch) await img.hover()
  await imageTools(app.page, n).waitFor()
  await app.settle()
}
const viewer = (page) => page.getByRole("dialog").filter({ has: page.locator(".image-viewer") })
const viewerOverline = async (page) => (await viewer(page).locator('[data-slot="sheet-overline"]').innerText()).trim().toUpperCase()

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
    // The relay's error (brief N1; channel 4): one critical banner over Notes, and OPEN SYNC opens Settings › Notes
    // (openSyncSetup(), ADR-0111), whose sync row gives the relay's words. The picture is Notes again, with its banner.
    name: "notes-relay-error",
    scenario: "relay-error",
    run: async (app) => {
      const { page } = app
      await area(app, "Notes")
      const banner = page.locator('[data-slot="banner"]').filter({ hasText: "Notes didn't sync" })
      ensure(await banner.isVisible(), "no banner says the notes didn't sync")
      ensure((await banner.textContent()).includes("The relay refused the token"), "the banner does not give the relay's words")
      await press(app, banner.getByRole("button", { name: "Open sync" }))
      ensure(await notesSettingsOpen(page), "Open sync did not open Settings › Notes")
      const row = page.getByRole("group", { name: "Sync between devices", exact: true })
      ensure(/Not syncing/.test(await row.textContent()) && /The relay refused the token/.test(await row.textContent()), "the sync row does not give the relay's words")
      await area(app, "Notes")
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
    // The Notes More menu's set-up moved to Settings › Notes (brief T5; ADR-0111): the menu is gone from the page
    // head, and every item it held works from the section. The two switches turn and turn back, so the demo is as it was.
    name: "notes-more",
    run: async (app) => {
      const { page } = app
      await area(app, "Notes")
      ensure(!(await button(page, "More").count()), "the Notes page head still has a More menu")
      await notesSettings(app)
      const row = (name) => page.getByRole("group", { name, exact: true })
      await press(app, row("Import").getByRole("button", { name: "Import", exact: true }))
      ensure(await page.getByRole("dialog", { name: /Import notes/ }).isVisible(), "IMPORT opened nothing")
      await page.keyboard.press("Escape")
      await app.settle()
      await press(app, row("Export").getByRole("button", { name: "Export", exact: true }))
      ensure(await page.locator("[data-sonner-toast]").filter({ hasText: "Saved notes to" }).count(), "EXPORT saved nothing")
      await toastGone(app)
      await press(app, row("Sync between devices").getByRole("button", { name: "Set up", exact: true }))
      ensure(await page.getByRole("dialog", { name: /Sync between devices/ }).isVisible(), "SET UP opened nothing")
      await page.keyboard.press("Escape")
      await app.settle()
      for (const name of ["Move checked items down", "Find text in images"]) {
        const on = page.getByRole("switch", { name })
        const before = await on.isChecked()
        await press(app, on)
        ensure((await on.isChecked()) !== before, `${name} did not change`)
        await press(app, on)
        ensure((await on.isChecked()) === before, `${name} did not turn back`)
      }
      ensure(!(await page.locator("[data-sonner-toast]").count()), "a switch raised a toast")
      await page.mouse.move(0, 0)
    },
  },
  {
    // The note (ADR-0106; Mobile / 15, Desktop / 11's detail): NOTE // EDITED, the title as its own field at
    // the drawn size, the chips, the checklist as unicron's square boxes with a hairline under each row and
    // the done one struck through; on a desktop the toolbar and the docked format bar, on a phone More and
    // the add button. A checklist, linked to an event, tagged and in a color.
    name: "notes-note",
    sizes: ["desktop", "phone", "medium"],
    sean: { kind: "drawn", area: "notes", screen: "note", sizes: ["phone"] },
    run: (app) => note(app, /Cabin packing list/),
    assert: async (app) => {
      const { page } = app
      const overline = (await page.locator('[data-role="note-overline"]').textContent()) ?? ""
      ensure(/^Note \/\/ Edited \d\d:\d\d$/.test(overline), `the overline reads “${overline}”`)
      ensure((await titleField(page).inputValue()) === "Cabin packing list", "the title is not its own field")
      const size = await titleField(page).evaluate((el) => getComputedStyle(el).fontSize)
      ensure(size === (app.phone ? "32px" : "48px"), `the title is ${size}, not the drawn size`)
      // The title block is not shown twice: the text starts with the checklist.
      ensure(!(await noteText(page).getByText("Cabin packing list").isVisible().catch(() => false)), "the title shows in the text too")
      ensure((await noteText(page).getByRole("checkbox").count()) === 4, "the checklist is not four checkboxes")
      ensure(await checkbox(page, "Rain jackets").isChecked(), "the done item is not checked")
      const done = await noteText(page).locator('li[data-checked="true"] p').first().evaluate((el) => ({ line: getComputedStyle(el).textDecorationLine, color: getComputedStyle(el).color }))
      const open = await noteText(page).locator('li[data-checked="false"] p').first().evaluate((el) => getComputedStyle(el).color)
      ensure(done.line === "line-through" && done.color !== open, "a done item is not struck through in the label ink")
      const rule = await noteText(page).locator(".note-check").first().evaluate((el) => getComputedStyle(el).boxShadow)
      ensure(rule.includes("inset"), "a checklist row has no hairline under it")
      ensure(!(await page.locator('[style*="--c-note-card"], [style*="--note-surface"]').count()), "the note's color still tints the pane")
      ensure((await page.getByRole("group", { name: "Reminder, links and tags" }).textContent()).includes("Cabin weekend"), "the link chip is missing")
      if (app.phone) {
        ensure(await button(page, "Note actions").isVisible(), "the top bar has no More")
        ensure(await button(page, "Add line").isVisible(), "the drawn add button is missing")
        ensure(!(await formatting(page).isVisible()), "the format bar shows while nothing is being written")
      } else {
        for (const name of ["Pin", "Remind me", "Color: Green", "Note actions"]) ensure(await noteToolbar(page).getByRole("button", { name, exact: true }).count(), `the note's toolbar has no ${name}`)
        ensure((await noteToolbar(page).locator('[tabindex="0"]').count()) === 1, "the note's toolbar is not one Tab stop")
        ensure(await formatting(page).isVisible(), "the format bar is not docked on a desktop")
        ensure(!(await button(page, "Add line").count()), "a desktop shows the phone's add button")
      }
    },
  },
  {
    // Desktop / 11 in full: the list beside the note.
    name: "notes-note-list",
    sizes: ["desktop"],
    sean: { kind: "drawn", area: "notes", screen: "list-note", sizes: ["desktop"] },
    run: (app) => note(app, /Cabin packing list/),
  },
  {
    // A checklist item toggles, and stays so when the note is read again from the core (ADR-0106). The demo
    // keeps its notes in memory, so "after a reload" is: close the note, open it again.
    name: "notes-checklist",
    run: async (app) => {
      const { page } = app
      await note(app, /Cabin packing list/)
      await press(app, checkbox(page, "Board games"))
      ensure(await checkbox(page, "Board games").isChecked(), "Board games did not check")
      // The note saves a moment after the last change.
      await page.waitForTimeout(800)
      if (app.phone) await press(app, button(page, "Back"))
      else await press(app, notesList(page).getByRole("button", { name: /Design review agenda/ }))
      await note(app, /Cabin packing list/)
      ensure(await checkbox(page, "Board games").isChecked(), "Board games was not checked when the note was opened again")
      if (!app.phone) ensure((await rowText(page, "Cabin packing list")).includes("4 items"), "the row lost its item count")
      // And off again, so the sample is as it was.
      await press(app, checkbox(page, "Board games"))
      ensure(!(await checkbox(page, "Board games").isChecked()), "Board games did not uncheck")
      await page.waitForTimeout(800)
    },
  },
  {
    // Esc leaves the text, and a second Esc closes the note (brief N2).
    name: "notes-esc",
    run: async (app) => {
      const { page } = app
      await note(app, /Cabin packing list/)
      await writeIn(app)
      await page.keyboard.press("Escape")
      await app.settle()
      ensure(await noteOpen(page), "the first Esc closed the note")
      ensure(await page.evaluate(() => document.activeElement?.getAttribute("aria-label") === "Note"), "the first Esc did not leave the text")
      await page.keyboard.press("Escape")
      await app.settle()
      ensure(!(await noteOpen(page)), "the second Esc did not close the note")
      if (!app.phone) ensure(await page.getByRole("region", { name: "Notes: nothing open" }).isVisible(), "the detail does not say nothing is open")
      // The title field's Esc is the same first step.
      await note(app, /Cabin packing list/)
      await titleField(page).focus()
      await page.keyboard.press("Escape")
      await app.settle()
      ensure(await noteOpen(page), "Esc in the title closed the note")
    },
  },
  {
    // Pin, a reminder and a color, from the toolbar on a desktop and from More on a phone (brief N2).
    name: "notes-pin-remind-color",
    run: async (app) => {
      const { page } = app
      await note(app, /Cabin packing list/)
      // Unpin, then pin again.
      if (app.phone) {
        await noteControl(app, "Unpin")
        await press(app, button(page, "Note actions"))
        ensure(await moreRow(app, "Pin").count(), "More does not offer Pin once unpinned")
        await press(app, moreRow(app, "Pin"))
      } else {
        const pin = noteToolbar(page).getByRole("button", { name: "Pin", exact: true })
        ensure((await pin.getAttribute("aria-pressed")) === "true", "Pin is not on for a pinned note")
        await press(app, pin)
        ensure((await pin.getAttribute("aria-pressed")) === "false", "Pin did not turn off")
        ensure(!(await section(page, "Pinned").count()), "the note is still listed under Pinned")
        await press(app, pin)
        ensure((await pin.getAttribute("aria-pressed")) === "true", "Pin did not turn back on")
      }
      // A reminder from a preset; DONE puts it away.
      await noteControl(app, "Remind me", "Remind me…")
      await press(app, layerRow(app, /^Tomorrow/))
      const chip = page.locator('[data-role="note-reminder"]')
      ensure((await chip.textContent()).includes("Tomorrow"), "the reminder chip does not say when")
      await press(app, chip.getByRole("button", { name: "Done with this reminder" }))
      ensure(!(await chip.count()), "Done did not take the reminder away")
      // A color: the swatch picker, then back to green.
      for (const [from, to] of [["Green", "Blue"], ["Blue", "Green"]]) {
        await noteControl(app, `Color: ${from}`, `Color: ${from}…`)
        await press(app, page.getByRole("radiogroup", { name: "Note color" }).getByRole("radio", { name: to, exact: true }))
        ensure(!(await page.getByRole("radiogroup", { name: "Note color" }).count()), "a pick did not close the color layer")
      }
      if (!app.phone) ensure(await noteToolbar(page).getByRole("button", { name: "Color: Green" }).count(), "the color did not come back to green")
      await page.mouse.move(0, 0)
    },
  },
  {
    // TAG and LINK (brief N2): a tag goes on and comes off; a person is linked, carries LINKED in the
    // link form, and a press there takes the link off again.
    name: "notes-tag-link",
    run: async (app) => {
      const { page } = app
      await note(app, /Cabin packing list/)
      const chips = page.getByRole("group", { name: "Reminder, links and tags" })
      await press(app, chips.getByRole("button", { name: "Tag", exact: true }))
      const tagLayer = page.getByRole("dialog", { name: "Tag" })
      // The field offers the tags in use, so it is a combobox.
      await tagLayer.getByRole("combobox", { name: "Tag" }).fill("packing")
      await press(app, tagLayer.getByRole("button", { name: "Add tag" }))
      ensure((await chips.textContent()).includes("#packing"), "the tag did not go on")
      await press(app, chips.getByRole("button", { name: "Remove tag packing" }))
      ensure(!(await chips.textContent()).includes("#packing"), "the tag did not come off")
      const linkForm = page.getByRole("dialog", { name: "Link this note" })
      const openForm = async () => {
        await press(app, chips.getByRole("button", { name: "Link to an event, person or conversation" }))
        await linkForm.getByRole("searchbox").or(linkForm.getByRole("textbox")).first().fill("Priya")
        await page.waitForTimeout(300)
        await app.settle()
      }
      await openForm()
      const people = linkForm.getByRole("list", { name: "People" })
      ensure(!(await people.locator("[data-linked]").count()), "Priya is linked before she is picked")
      await press(app, people.getByRole("button", { name: /Priya Raman/ }).first())
      ensure(!(await linkForm.count()), "picking a person did not close the form")
      ensure((await chips.textContent()).includes("Priya Raman"), "the person's chip did not appear")
      await openForm()
      ensure(await people.locator("[data-linked]").filter({ hasText: "Priya Raman" }).count(), "a linked person does not carry LINKED")
      await press(app, people.getByRole("button", { name: /Priya Raman/ }).first())
      ensure(!(await chips.textContent()).includes("Priya Raman"), "a press on a linked row did not take the link off")
      await page.mouse.move(0, 0)
    },
  },
  {
    // Archive and delete, each with UNDO in its toast (brief N2, decisions §1 and §10).
    name: "notes-archive-delete",
    run: async (app) => {
      const { page } = app
      for (const [item, words] of [["Archive", "Archived Cabin packing list"], ["Delete", "Deleted Cabin packing list"]]) {
        await noteAction(app, item)
        ensure(!(await noteOpen(page)), `${item} did not close the note`)
        const toast = toastSaying(page, words)
        ensure(await toast.count(), `no toast says “${words}”`)
        if (app.phone) await area(app, "Notes")
        ensure(!(await notesList(page).getByRole("button", { name: /Cabin packing list/ }).count()), `${item} left the note in the list`)
        await press(app, toast.getByRole("button", { name: "Undo" }))
        await page.waitForTimeout(300)
        await app.settle()
        ensure(await notesList(page).getByRole("button", { name: /Cabin packing list/ }).count(), `Undo did not bring the note back after ${item}`)
        await page.mouse.move(0, 0)
        await page.locator("[data-sonner-toast]").first().waitFor({ state: "detached", timeout: 15_000 }).catch(() => {})
      }
    },
  },
  {
    // A reminder at any date and time (ADR-0088; brief N2): the shared picker from the note's bell.
    name: "notes-remind-time",
    run: async (app) => {
      await note(app, /Cabin packing list/)
      await noteControl(app, "Remind me", "Remind me…")
      await press(app, layerRow(app, "Pick a date and time…"))
      const picker = app.page.getByRole("dialog", { name: "Remind me" }).last()
      await press(app, picker.getByRole("gridcell", { name: /^Friday, November 13/ }))
      await press(app, picker.getByRole("button", { name: "Set reminder", exact: true }))
      ensure(!(await picker.count()), "Set reminder did not close the picker")
      // The bell now says when; the picker opens from it again.
      await noteControl(app, /^Reminder: Tomorrow, 11:00/)
      await press(app, layerRow(app, "Pick a date and time…"))
      await app.page.mouse.move(0, 0)
    },
    assert: async ({ page }) => {
      const picker = page.getByRole("dialog", { name: "Remind me" }).last()
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
      // A phone shows the bar while you write, in the bottom row's place (ADR-0106).
      if (app.phone) {
        ensure(!(await formatting(page).isVisible()), "the phone's format bar shows before anything is being written")
        await writeIn(app)
        ensure(!(await button(page, "Add line").count()), "the add button stays while the format bar shows")
      }
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
      await noteText(page).locator("li p").first().click()
      await app.settle()
      ensure((await bar.getByRole("button", { name: "Checklist", exact: true }).getAttribute("aria-pressed")) === "true", "Checklist is not on in a checklist row")
    },
  },
  { name: "notes-note-actions", run: (app) => noteAction(app) },
  {
    // Lock notes, the first time (brief N5): the form layer, its line, the warning, three fields, SET PASSPHRASE.
    name: "notes-lock",
    sean: { kind: "undrawn", area: "notes", screen: "lock-form" },
    run: async (app) => {
      await noteAction(app, "Lock note")
      await lockForm(app.page).waitFor()
    },
    assert: async (app) => {
      const form = lockForm(app.page)
      ensure((await form.innerText()).includes("One passphrase opens every locked note, on all your devices."), "the form does not say what the passphrase does")
      ensure(await form.getByText("Forget it and locked notes can't be opened. Nobody can reset it.").isVisible(), "the warning is not shown")
      for (const f of ["Passphrase", "Again", "Hint (optional)"]) ensure(await form.getByLabel(f, { exact: true }).count(), `the form has no ${f} field`)
      ensure(await formPrimary(form, "Set passphrase").isDisabled(), "SET PASSPHRASE works before anything is typed")
      const box = await form.boundingBox()
      if (!app.phone) ensure(Math.abs(box.width - 640) < 2, `the lock form is ${Math.round(box.width)} wide, not 640`)
    },
  },
  {
    // Lock a note (brief N5): the two passphrases must match; SET PASSPHRASE locks it; Lock now closes every locked note.
    name: "notes-lock-form",
    run: async (app) => {
      const { page } = app
      await noteAction(app, "Lock note")
      const form = lockForm(page)
      await form.getByLabel("Passphrase", { exact: true }).fill(PASSPHRASE)
      await form.getByLabel("Again", { exact: true }).fill("lake house")
      await app.settle()
      ensure(await form.getByText("Doesn't match yet.").isVisible(), "two passphrases that differ do not say so")
      ensure(await formPrimary(form, "Set passphrase").isDisabled(), "SET PASSPHRASE works while the two differ")
      await form.getByLabel("Again", { exact: true }).fill(PASSPHRASE)
      await form.getByLabel("Hint (optional)", { exact: true }).fill(HINT)
      await press(app, formPrimary(form, "Set passphrase"))
      await toastSaying(page, "Locked Cabin packing list").waitFor()
      ensure(!(await form.count()), "the lock form stayed open")
      ensure(/Locked/i.test(await page.locator('[data-role="note-overline"]').textContent()), "the overline does not say the note is locked")
      // Lock now: the toolbar's on a desktop, the More sheet's on a phone. The note closes behind its lock.
      if (app.phone) await noteAction(app, "Lock now")
      else await press(app, noteToolbar(page).getByRole("button", { name: "Lock now" }))
      await lockedNote(page).waitFor()
      ensure(!(await noteText(page).count()), "the note's text still shows after Lock now")
    },
  },
  {
    // A locked note while notes are locked (brief N5): LOCKED, "This note is locked.", PASSPHRASE with SHOW HINT, UNLOCK.
    name: "notes-unlock",
    scenario: "notes-locked",
    sean: { kind: "undrawn", area: "notes", screen: "locked" },
    run: async (app) => {
      await note(app, /Cabin packing list/)
      await lockedNote(app.page).waitFor()
      await app.page.evaluate(() => document.activeElement?.blur())
    },
    assert: async (app) => {
      const panel = lockedNote(app.page)
      ensure((await panel.innerText()).includes("This note is locked."), "the locked note does not say so")
      ensure(await panel.getByRole("button", { name: "Show hint", exact: true }).isVisible(), "SHOW HINT is not beside the field")
      ensure(!(await panel.getByText(HINT).count()), "the hint shows before it is asked for")
      ensure(await panel.getByRole("button", { name: "Unlock", exact: true }).isDisabled(), "UNLOCK works with no passphrase")
      ensure(await panel.getByRole("button", { name: "Unlock with your identity", exact: true }).isVisible(), "UNLOCK WITH YOUR IDENTITY is not offered on a device that holds the identity")
      ensure(/Locked/i.test(await app.page.locator('[data-role="note-overline"]').textContent()), "the overline does not end LOCKED")
    },
  },
  {
    // Unlock (brief N5): the hint only on request, as the field's helper; a wrong passphrase says so; the right one opens it.
    name: "notes-unlock-hint",
    scenario: "notes-locked",
    run: async (app) => {
      const { page } = app
      await note(app, /Cabin packing list/)
      const panel = lockedNote(page)
      await press(app, panel.getByRole("button", { name: "Show hint", exact: true }))
      ensure(await panel.getByText(`Hint: ${HINT}`).isVisible(), "the hint does not show under the field")
      ensure(!(await panel.getByRole("button", { name: "Show hint", exact: true }).count()), "SHOW HINT stays once the hint shows")
      await panel.getByLabel("Passphrase", { exact: true }).fill("lake house")
      await press(app, panel.getByRole("button", { name: "Unlock", exact: true }))
      await panel.getByText("That isn't the passphrase.").waitFor()
      await panel.getByLabel("Passphrase", { exact: true }).fill(PASSPHRASE)
      await page.keyboard.press("Enter")
      await noteText(page).waitFor()
      ensure((await noteText(page).innerText()).includes("Coffee + grinder"), "the unlocked note does not show its text")
    },
  },
  {
    // Remove the lock (brief N5, X6): it asks, with focus on Cancel; Cancel keeps it; REMOVE removes it, with a toast.
    name: "notes-lock-remove",
    scenario: "notes-locked",
    run: async (app) => {
      const { page } = app
      await note(app, /Cabin packing list/)
      await lockedNote(page).getByLabel("Passphrase", { exact: true }).fill(PASSPHRASE)
      await page.keyboard.press("Enter")
      await noteText(page).waitFor()
      await noteAction(app, "Remove lock")
      const ask = page.getByRole("dialog", { name: "Remove the lock?" })
      await ask.waitFor()
      ensure((await ask.innerText()).includes("The note's text is no longer sealed."), "the question does not say what removing the lock does")
      ensure((await page.evaluate(() => document.activeElement?.textContent?.trim())) === "Cancel", "focus does not start on Cancel")
      await press(app, ask.getByRole("button", { name: "Cancel", exact: true }))
      ensure(/Locked/i.test(await page.locator('[data-role="note-overline"]').textContent()), "Cancel removed the lock")
      await noteAction(app, "Remove lock")
      await press(app, page.getByRole("dialog", { name: "Remove the lock?" }).getByRole("button", { name: "Remove", exact: true }))
      await toastSaying(page, "Removed the lock from Cabin packing list").waitFor()
      ensure(!/Locked/i.test(await page.locator('[data-role="note-overline"]').textContent()), "the note still says it is locked")
    },
  },
  {
    // Share "{title}" (brief N6) with a relay: CAN EDIT and CAN VIEW, each with its sentence; CREATE LINK; what stays private.
    name: "notes-share",
    scenario: "notes-relay",
    sean: { kind: "undrawn", area: "notes", screen: "share" },
    run: async (app) => {
      await noteAction(app, "Share…")
      await shareForm(app.page).waitFor()
    },
    assert: async (app) => {
      const form = shareForm(app.page)
      const modes = form.getByRole("radiogroup", { name: "People with the link" })
      ensure(await modes.getByRole("radio", { name: "Can edit" }).isChecked(), "CAN EDIT is not the choice to start with")
      ensure(await modes.getByRole("radio", { name: "Can view" }).count(), "CAN VIEW is missing")
      await privacy(form, { sealed: false })
      ensure(await form.getByRole("button", { name: "Create link", exact: true }).count(), "there is no CREATE LINK")
      const box = await form.boundingBox()
      if (!app.phone) ensure(Math.abs(box.width - 640) < 2, `the share form is ${Math.round(box.width)} wide, not 640`)
    },
  },
  {
    // Shared by link (brief N6): LINK with COPY LINK ("Copied" for 2 s, no toast), PEOPLE WITH THE LINK with CHANGE,
    // EMAIL IT, and STOP SHARING, which asks first, with focus on Cancel.
    name: "notes-share-link",
    scenario: "notes-relay",
    run: async (app) => {
      const { page } = app
      await page.context().grantPermissions(["clipboard-read", "clipboard-write"])
      await noteAction(app, "Share…")
      const form = shareForm(page)
      await press(app, form.getByRole("radiogroup", { name: "People with the link" }).getByRole("radio", { name: "Can view" }))
      await press(app, form.getByRole("button", { name: "Create link", exact: true }))
      await form.locator('[data-role="share-link"]').filter({ hasText: "/share#" }).waitFor()
      ensure((await form.getByRole("group", { name: "People with the link" }).textContent()).includes("Can view"), "the link is not for reading, as chosen")
      await privacy(form, { sealed: false })
      await press(app, form.getByRole("button", { name: "Copy link" }))
      ensure(await form.getByRole("button", { name: "Copied" }).count(), "COPY LINK does not say Copied")
      ensure(!(await page.locator("[data-sonner-toast]").count()), "COPY LINK raised a toast")
      // CHANGE: a menu on a desktop, a sheet on a phone.
      await press(app, form.getByRole("button", { name: /^Change/ }))
      await press(app, page.getByRole(app.phone ? "radio" : "menuitemradio", { name: "Can edit" }).last())
      await app.settle()
      ensure((await form.getByRole("group", { name: "People with the link" }).textContent()).includes("Can edit"), "CHANGE did not make the link editable")
      ensure(await form.getByRole("button", { name: "Email it" }).isEnabled(), "EMAIL IT is not offered")
      await press(app, form.getByRole("button", { name: "Stop sharing", exact: true }))
      const ask = page.getByRole("dialog", { name: "Stop sharing?" })
      await ask.waitFor()
      ensure((await ask.innerText()).includes("The link stops working."), "the question does not say what stopping does")
      ensure((await page.evaluate(() => document.activeElement?.textContent?.trim())) === "Cancel", "focus does not start on Cancel")
      await press(app, ask.getByRole("button", { name: "Stop sharing", exact: true }))
      await toastSaying(page, "Stopped sharing Cabin packing list").waitFor()
      ensure(!(await shareForm(page).count()), "the share form stayed open")
    },
  },
  {
    // Shared (brief N6): LINK with COPY LINK, PEOPLE WITH THE LINK with CHANGE, EMAIL IT, and STOP SHARING.
    name: "notes-share-shared",
    scenario: "notes-relay",
    sean: { kind: "undrawn", area: "notes", screen: "share-link" },
    run: async (app) => {
      await noteAction(app, "Share…")
      const form = shareForm(app.page)
      await press(app, form.getByRole("button", { name: "Create link", exact: true }))
      await form.locator('[data-role="share-link"]').filter({ hasText: "/share#" }).waitFor()
      await app.page.evaluate(() => document.activeElement?.blur())
    },
    assert: async (app) => {
      const form = shareForm(app.page)
      for (const b of ["Copy link", "Email it", "Stop sharing"]) ensure(await form.getByRole("button", { name: b, exact: true }).count(), `the shared form has no ${b}`)
      ensure((await form.getByRole("group", { name: "People with the link" }).textContent()).includes("Can edit"), "the link is not for editing, the choice to start with")
      ensure(!(await form.getByRole("button", { name: "Create link", exact: true }).count()), "CREATE LINK stays once the note is shared")
    },
  },
  {
    // No notes relay (brief N6): sharing works through it; OPEN SYNC opens Settings › Notes, where sync is set up (ADR-0111).
    name: "notes-share-no-relay",
    run: async (app) => {
      const { page } = app
      await noteAction(app, "Share…")
      const form = shareForm(page)
      ensure((await form.innerText()).includes("Sharing works through your notes relay, the same one that syncs your devices."), "the form does not say sharing needs the relay")
      await press(app, form.getByRole("button", { name: "Open sync", exact: true }))
      ensure(!(await shareForm(page).count()), "the share form stayed open under the sync set-up")
      ensure(await notesSettingsOpen(page), "OPEN SYNC did not open Settings › Notes")
      ensure(await page.getByRole("group", { name: "Sync between devices", exact: true }).getByRole("button", { name: "Set up", exact: true }).isVisible(), "Settings › Notes has no SET UP")
    },
  },
  {
    // A guest's note (brief N6): the overline ends // SHARED // YOU CAN EDIT; the menu has Keep as my own note, not Share or Lock.
    name: "notes-guest",
    scenario: "notes-guest",
    run: async (app) => {
      await note(app, /Design review agenda/)
      await app.page.evaluate(() => document.activeElement?.blur())
    },
    assert: async (app) => {
      const overline = (await app.page.locator('[data-role="note-overline"]').textContent()) ?? ""
      ensure(/\/\/ Shared \/\/ You can edit$/.test(overline), `the overline reads ${overline}`)
      await press(app, button(app.page, "Note actions"))
      ensure(await moreRow(app, "Keep as my own note").count(), "a guest's note has no Keep as my own note")
      for (const row of ["Share…", "Lock note"]) ensure(!(await moreRow(app, row).count()), `a guest's note offers ${row}`)
      await leaveLayer(app)
    },
  },
  {
    // Link this note (brief N2): a dialog (form 640) on a desktop, the whole screen on a phone. A search
    // field, then EVENTS, PEOPLE and CONVERSATIONS as search draws them; the linked event carries LINKED.
    name: "notes-link",
    sean: { kind: "undrawn", area: "notes", screen: "link-form" },
    run: async (app) => {
      await note(app, /Cabin packing list/)
      await press(app, button(app.page, "Link to an event, person or conversation"))
      // The linked event is a month away: a word from it brings it into the results.
      const form = app.page.getByRole("dialog", { name: "Link this note" })
      await form.getByRole("searchbox").or(form.getByRole("textbox")).first().fill("cabin")
      await form.locator("[data-linked]").waitFor()
      await app.settle()
      await app.page.evaluate(() => document.activeElement?.blur())
    },
    assert: async (app) => {
      const { page } = app
      const form = page.getByRole("dialog", { name: "Link this note" })
      ensure(await form.getByRole("searchbox", { name: "Search events, people and mail" }).or(form.getByRole("textbox", { name: "Search events, people and mail" })).count(), "the form has no search field")
      // Each kind under its own header, and only the kinds that found something: "cabin" names an event and some mail.
      const kinds = await form.getByRole("list").evaluateAll((lists) => lists.map((l) => l.getAttribute("aria-label")))
      ensure(kinds.includes("Events") && kinds.every((k) => ["Events", "People", "Conversations"].includes(k)), `the form lists ${kinds.join(", ")}`)
      ensure((await form.locator("[data-linked]").textContent()).includes("Cabin weekend"), "the linked event does not carry LINKED")
      const box = await form.boundingBox()
      if (!app.phone) ensure(Math.abs(box.width - 640) < 2, `the link form is ${Math.round(box.width)} wide, not 640`)
      else ensure(box.height > app.viewport.height * 0.9, "the link form is not the whole screen on a phone")
    },
  },
  {
    // Nothing found (brief N2): Nothing matches "…".
    name: "notes-link-none",
    run: async (app) => {
      await note(app, /Cabin packing list/)
      await press(app, button(app.page, "Link to an event, person or conversation"))
      const form = app.page.getByRole("dialog", { name: "Link this note" })
      await form.getByRole("searchbox").or(form.getByRole("textbox")).first().fill("zebra crossing")
      await form.getByText("Nothing matches “zebra crossing”").waitFor()
      await app.settle()
    },
  },
  {
    // A sketch (brief N3): a viewer layer of 960, the tools above the canvas on a desktop and below it on a
    // phone, the canvas on its paper, and one primary. Two strokes drawn, so the paper shows ink.
    name: "notes-sketch",
    sean: { kind: "undrawn", area: "notes", screen: "sketch" },
    run: async (app) => {
      await openSketch(app)
      await doodle(app)
      await app.page.mouse.move(0, 0)
    },
    assert: async (app) => {
      const { page } = app
      const layer = sketchLayer(page)
      ensure((await strokes(page)) === "Sketch with 2 strokes", `the canvas says "${await strokes(page)}"`)
      const tools = layer.getByRole("toolbar", { name: "Drawing tools" })
      for (const name of ["Pen", "Marker", "Eraser", "Undo", "Redo", "Clear", "More room"]) ensure(await tools.getByRole("button", { name, exact: true }).count(), `the tools have no ${name}`)
      ensure(await tools.getByRole("button", { name: "Pen", exact: true }).getAttribute("aria-pressed") === "true", "the pen is not the tool")
      ensure((await layer.getByRole("button", { name: "Add to note", exact: true }).count()) === 1, "the layer has no ADD TO NOTE")
      // The tools above the canvas on a desktop, below it on a phone.
      const t = await tools.boundingBox()
      const c = await canvas(page).boundingBox()
      ensure(app.phone ? t.y > c.y : t.y < c.y, `the tools are ${t.y < c.y ? "above" : "below"} the canvas`)
      // The viewer size, 960; below that, the window less its 24 px margins (unicron's fitted size).
      const wide = Math.min(960, app.viewport.width - 48)
      if (!app.phone) ensure(Math.round((await layer.boundingBox()).width) === wide, `the layer is ${Math.round((await layer.boundingBox()).width)} wide, not ${wide}`)
    },
  },
  {
    // The empty canvas (brief N3): its one caption, and nothing to add yet.
    name: "notes-sketch-empty",
    run: openSketch,
    assert: async ({ page }) => {
      const layer = sketchLayer(page)
      ensure(await layer.getByText("Draw with a mouse, a finger or a pen.", { exact: true }).isVisible(), "the empty canvas has no caption")
      ensure(await layer.getByRole("button", { name: "Add to note", exact: true }).isDisabled(), "ADD TO NOTE works on an empty sketch")
    },
  },
  {
    // Draw, clear, undo, save and edit a sketch (brief N3): Clear asks nothing and Undo brings the strokes
    // back; ADD TO NOTE puts it in the note; the image's Edit sketch opens it again with its strokes, and
    // SAVE SKETCH replaces it. Closing with drawing asks "Discard changes?", with focus on KEEP EDITING.
    name: "notes-sketch-edit",
    run: async (app) => {
      const { page } = app
      await openSketch(app)
      await doodle(app)
      const tools = sketchLayer(page).getByRole("toolbar", { name: "Drawing tools" })
      await press(app, tools.getByRole("button", { name: "Clear", exact: true }))
      ensure((await strokes(page)) === "Empty sketch", "Clear left strokes")
      ensure(!(await page.getByRole("dialog", { name: "Discard changes?" }).count()), "Clear asked a question")
      await press(app, tools.getByRole("button", { name: "Undo", exact: true }))
      ensure((await strokes(page)) === "Sketch with 2 strokes", "Undo did not bring the strokes back")
      await press(app, tools.getByRole("button", { name: "Redo", exact: true }))
      await press(app, tools.getByRole("button", { name: "Undo", exact: true }))
      // Closing asks, and KEEP EDITING keeps the drawing.
      await press(app, sketchLayer(page).getByRole("button", { name: "Cancel", exact: true }))
      const question = page.getByRole("dialog", { name: "Discard changes?" })
      await question.waitFor()
      ensure(await page.evaluate(() => document.activeElement?.textContent?.trim().toLowerCase() === "keep editing"), "focus is not on KEEP EDITING")
      await press(app, question.getByRole("button", { name: "Keep editing" }))
      ensure((await strokes(page)) === "Sketch with 2 strokes", "KEEP EDITING lost the drawing")
      await press(app, sketchLayer(page).getByRole("button", { name: "Add to note", exact: true }))
      await sketchLayer(page).waitFor({ state: "detached" })
      const sketch = noteText(page).getByRole("img", { name: "Sketch", exact: true })
      await sketch.waitFor()
      // Edit it again: the strokes come back, one more is drawn, and the save replaces the image.
      const wrapper = noteText(page).locator(".note-image").filter({ has: page.getByRole("img", { name: "Sketch", exact: true }) })
      if (!app.touch) await wrapper.hover()
      await press(app, wrapper.getByRole("toolbar", { name: "Image" }).getByRole("button", { name: "Edit sketch" }))
      await page.getByRole("dialog", { name: "Edit sketch" }).waitFor()
      ensure((await strokes(page)) === "Sketch with 2 strokes", `the sketch opened with "${await strokes(page)}"`)
      await draw(app, [[0.1, 0.85], [0.9, 0.85]])
      ensure((await strokes(page)) === "Sketch with 3 strokes", "the new stroke did not land")
      await press(app, sketchLayer(page).getByRole("button", { name: "Save sketch", exact: true }))
      await sketchLayer(page).waitFor({ state: "detached" })
      ensure((await noteText(page).getByRole("img", { name: "Sketch", exact: true }).count()) === 1, "saving added a second sketch instead of replacing it")
    },
  },
  {
    // Scan a document, step one (brief N4): what scanning does, TAKE A PHOTO (primary) and CHOOSE A FILE.
    name: "notes-scan-capture",
    sean: { kind: "undrawn", area: "notes", screen: "scan-capture" },
    run: openScan,
    assert: async ({ page }) => {
      const layer = scanLayer(page)
      ensure(await layer.getByText("The text in it becomes searchable. It is read on this device.").isVisible(), "the capture step does not say what scanning does")
      for (const name of ["Take a photo", "Choose a file"]) ensure(await layer.getByRole("button", { name, exact: true }).isVisible(), `no ${name}`)
    },
  },
  {
    // Step two (brief N4): the photo with its four corners, LOOK, and RETAKE · NEXT PAGE · ADD TO NOTE.
    name: "notes-scan-adjust",
    sean: { kind: "undrawn", area: "notes", screen: "scan" },
    run: async (app) => {
      await openScan(app)
      await choosePhoto(app, 1)
    },
    assert: async ({ page }) => {
      const layer = scanLayer(page)
      for (const corner of ["Top left", "Top right", "Bottom right", "Bottom left"]) ensure(await layer.getByRole("button", { name: new RegExp(`^${corner}: \\d+% across, \\d+% down$`) }).count(), `no ${corner} handle`)
      ensure(await layer.getByRole("radiogroup", { name: "Look" }).getByRole("radio", { name: "Document" }).isChecked(), "the look is not Document")
      for (const name of ["Retake", "Next page", "Add to note"]) ensure(await layer.getByRole("button", { name, exact: true }).count(), `no ${name}`)
    },
  },
  {
    // The corners move by arrow keys and say where they are (brief N4).
    name: "notes-scan-corners",
    sizes: ["desktop"],
    run: async (app) => {
      const { page } = app
      await openScan(app)
      await choosePhoto(app, 1)
      const handle = scanLayer(page).getByRole("button", { name: /^Top left: / })
      const where = async () => /(\d+)% across, (\d+)% down/.exec((await handle.getAttribute("aria-label")) ?? "")?.slice(1).map(Number)
      await handle.focus()
      const [x, y] = await where()
      for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowRight")
      await page.keyboard.press("ArrowDown")
      await app.settle()
      const [x2, y2] = await where()
      ensure(x2 === x + 3 && y2 === y + 1, `the corner went from ${x}%, ${y}% to ${x2}%, ${y2}%`)
      ensure(await handle.evaluate((el) => el === document.activeElement), "the handle lost focus as it moved")
    },
  },
  {
    // Two pages from files (brief N4): NEXT PAGE keeps the first, the second is chosen, and ADD 2 PAGES TO
    // NOTE puts both in the note in order.
    name: "notes-scan-pages",
    run: async (app) => {
      const { page } = app
      await openScan(app)
      await choosePhoto(app, 1)
      await press(app, scanLayer(page).getByRole("button", { name: "Next page", exact: true }))
      const chips = scanLayer(page).getByRole("region", { name: "Scanned pages" })
      ensure(await chips.getByRole("button", { name: "Remove page 1" }).count(), "the first page is not among the pages")
      await choosePhoto(app, 2)
      await press(app, scanLayer(page).getByRole("button", { name: "Add 2 pages to note", exact: true }))
      await scanLayer(page).waitFor({ state: "detached" })
      for (const n of [1, 2]) await noteText(page).getByRole("img", { name: `Scanned document, page ${n} of 2` }).waitFor()
      await app.settle()
    },
  },
  {
    // An image's toolbar on hover or focus (brief N4): View, Edit sketch on a sketch, Describe.
    name: "notes-image-toolbar",
    scenario: "notes-images",
    run: async (app) => {
      await imageNote(app)
      await showImageTools(app, 0)
    },
    assert: async ({ page }) => {
      const tools = imageTools(page, 0)
      for (const name of ["View", "Edit sketch", "Describe"]) ensure(await tools.getByRole("button", { name, exact: true }).count(), `the sketch's toolbar has no ${name}`)
      ensure(!(await imageTools(page, 1).getByRole("button", { name: "Edit sketch" }).count()), "a picture that is not a sketch offers Edit sketch")
    },
  },
  {
    // Text in image (brief N4): the words read on this device, COPY and ADD TO NOTE.
    name: "notes-image-text",
    scenario: "notes-images",
    run: async (app) => {
      await imageNote(app)
      await showImageTools(app, 2)
      await press(app, imageTools(app.page, 2).getByRole("button", { name: "Text in image" }))
    },
    assert: async ({ page }) => {
      const layer = page.getByRole("dialog", { name: "Text in image" })
      ensure(await layer.getByText("Below 20 px: open the counters", { exact: false }).isVisible(), "the text read from the page is not shown")
      for (const name of ["Copy", "Add to note"]) ensure(await layer.getByRole("button", { name, exact: true }).count(), `no ${name}`)
    },
  },
  {
    // The viewer, full screen (brief N4): IMAGE 01 // 03, the description as title, Actual size, Save and
    // Close. A phone steps with the bottom row's buttons, a desktop with ← and →.
    name: "notes-image-viewer",
    scenario: "notes-images",
    sean: { kind: "undrawn", area: "notes", screen: "image-viewer" },
    run: async (app) => {
      const { page } = app
      await imageNote(app)
      await showImageTools(app, 0)
      await press(app, imageTools(page, 0).getByRole("button", { name: "View", exact: true }))
      await viewer(page).locator('[data-role="viewer-image"]').waitFor()
      ensure((await viewerOverline(page)) === "IMAGE 01 // 03", `the viewer opened at "${await viewerOverline(page)}"`)
      if (app.phone) {
        await press(app, button(page, "Next image"))
        ensure((await viewerOverline(page)) === "IMAGE 02 // 03", "Next image did not step")
        await press(app, button(page, "Previous image"))
        ensure((await viewerOverline(page)) === "IMAGE 01 // 03", "Previous image did not step back")
        await press(app, button(page, "Next image"))
      } else {
        await page.keyboard.press("ArrowRight")
        await app.settle()
        ensure((await viewerOverline(page)) === "IMAGE 02 // 03", "→ did not step")
        await page.keyboard.press("ArrowLeft")
        await app.settle()
        ensure((await viewerOverline(page)) === "IMAGE 01 // 03", "← did not step back")
        await page.keyboard.press("ArrowRight")
        await app.settle()
      }
      await viewer(page).locator('[data-role="viewer-image"]').waitFor()
      await page.mouse.move(0, 0)
      await app.settle()
    },
    assert: async (app) => {
      const { page } = app
      const v = viewer(page)
      ensure((await v.getByRole("heading").first().innerText()).trim() === "Six hue ramps, light to dark", "the title is not the image's description")
      for (const name of ["Actual size", "Save image", "Close", "Previous image", "Next image"]) ensure(await v.getByRole("button", { name, exact: true }).count(), `the viewer has no ${name}`)
      const box = await v.boundingBox()
      ensure(Math.round(box.width) === app.viewport.width, "the viewer is not the whole width")
      // On a phone the steps sit at the foot's start; on a desktop at the sides of the picture.
      const prev = await v.getByRole("button", { name: "Previous image" }).boundingBox()
      const next = await v.getByRole("button", { name: "Next image" }).boundingBox()
      if (app.phone) ensure(prev.y > box.height - 120 && next.x < box.width / 2, "the steps are not at the start of the bottom row")
      else ensure(prev.x < 100 && next.x > box.width - 100, "the steps are not at the sides")
    },
  },
  {
    // The phone's add button (Mobile / 15): a checklist note grows by an item, with the cursor in it; while
    // you write, the format bar takes the bottom row's place.
    name: "notes-add-line",
    sizes: ["phone"],
    sean: { kind: "undrawn", area: "notes", screen: "add-line", sizes: ["phone"] },
    run: async (app) => {
      const { page } = app
      await note(app, /Cabin packing list/)
      await press(app, button(page, "Add line"))
      ensure((await noteText(page).getByRole("checkbox").count()) === 5, "the add button did not add a checklist item")
      ensure(await page.evaluate(() => !!document.activeElement?.closest(".ProseMirror")), "the cursor is not in the new item")
      await page.keyboard.type("Headlamps")
      await app.settle()
      ensure(await checkbox(page, "Headlamps").count(), "the new item does not hold what was typed")
      ensure(await formatting(page).isVisible(), "the format bar does not show while writing")
      ensure(!(await button(page, "Add line").count()), "the add button stays while writing")
      // The bar came up under the finger that pressed the add button: no tooltip from it in the picture.
      await page.mouse.move(0, 0)
      await page.locator('[data-slot="tooltip-content"]').waitFor({ state: "detached" })
    },
  },
  {
    // A rename that leaves links behind (brief N2): a compact info banner on the note that stays until it is
    // answered, also after the note is closed and opened again; the old link now names no note.
    name: "notes-rename-banner",
    sean: { kind: "undrawn", area: "notes", screen: "rename-banner" },
    run: async (app) => {
      const { page } = app
      await note(app, /Icon axis ideas/)
      await titleField(page).fill("Icon axis notes")
      const banner = page.locator('[data-slot="banner"]').filter({ hasText: "1 note links to “Icon axis ideas”." })
      await banner.waitFor({ timeout: 8000 })
      // The agenda still names the old title: a link to a note that is not there, in the label ink.
      if (app.phone) await press(app, button(page, "Back"))
      await note(app, /Design review agenda/)
      ensure(await noteText(page).locator("a.wikilink[data-missing]").filter({ hasText: "Icon axis ideas" }).count(), "the link to the old title is not marked as missing")
      if (app.phone) await press(app, button(page, "Back"))
      await note(app, /Icon axis notes/)
      await banner.waitFor()
      await page.evaluate(() => document.activeElement?.blur())
      await app.settle()
    },
    assert: async ({ page }) => {
      const banner = page.locator('[data-slot="banner"]').filter({ hasText: "1 note links to" })
      ensure(await banner.getByRole("button", { name: "Update links" }).count(), "the banner has no Update links")
      ensure(await banner.getByRole("button", { name: "Dismiss" }).count(), "the banner cannot be dismissed")
    },
  },
  {
    // UPDATE LINKS points the other note's link at the new title, and the banner goes (brief N2).
    name: "notes-rename-update",
    run: async (app) => {
      const { page } = app
      await note(app, /Icon axis ideas/)
      await titleField(page).fill("Icon axis notes")
      const banner = page.locator('[data-slot="banner"]').filter({ hasText: "1 note links to “Icon axis ideas”." })
      await banner.waitFor({ timeout: 8000 })
      await press(app, banner.getByRole("button", { name: "Update links" }))
      ensure(await toastSaying(page, "Updated links in 1 note").count(), "no toast says the links were updated")
      ensure(!(await banner.count()), "the banner stayed after Update links")
      if (app.phone) await press(app, button(page, "Back"))
      await note(app, /Design review agenda/)
      const link = noteText(page).locator("a.wikilink").filter({ hasText: "Icon axis notes" })
      ensure((await link.count()) === 1 && (await link.getAttribute("data-missing")) === null, "the agenda's link does not name the new title")
    },
  },
  {
    // A note shared with you for reading (brief N2): the banner, no format bar, and nothing to change.
    name: "notes-readonly",
    scenario: "notes-shared-read",
    sean: { kind: "undrawn", area: "notes", screen: "readonly" },
    run: (app) => note(app, /Design review agenda/),
    assert: async (app) => {
      const { page } = app
      ensure(await page.locator('[data-slot="banner"]').filter({ hasText: "Shared with you for reading." }).isVisible(), "no banner says the note is shared for reading")
      ensure(!(await formatting(page).count()), "a note shared for reading has a format bar")
      ensure(await titleField(page).evaluate((el) => el.readOnly), "the title of a note shared for reading can be changed")
      ensure((await noteText(page).getAttribute("contenteditable")) === "false", "the text of a note shared for reading can be changed")
      ensure(/Shared \/\/ You can read/.test(await page.locator('[data-role="note-overline"]').textContent()), "the overline does not say it is shared for reading")
      if (app.phone) ensure(!(await button(page, "Add line").count()), "a note shared for reading has the add button")
    },
  },
  {
    // The color layer (brief N2): the swatch picker, No color then the ten colors with their squares.
    name: "notes-color",
    sean: { kind: "undrawn", area: "notes", screen: "color" },
    run: async (app) => {
      await note(app, /Cabin packing list/)
      await noteControl(app, "Color: Green", "Color: Green…")
    },
    assert: async ({ page }) => {
      const group = page.getByRole("radiogroup", { name: "Note color" })
      ensure((await group.getByRole("radio").count()) === 11, "the color layer is not No color and ten colors")
      ensure(await group.getByRole("radio", { name: "Green", exact: true }).isChecked(), "the note's color is not the one picked")
    },
  },
  {
    // Remind (brief N2): REMIND ME, the presets with their times, and Pick a date and time….
    name: "notes-remind",
    sean: { kind: "undrawn", area: "notes", screen: "remind" },
    run: async (app) => {
      await note(app, /Cabin packing list/)
      await noteControl(app, "Remind me", "Remind me…")
    },
    assert: async (app) => {
      ensure(await layerRow(app, /^Tomorrow/).count(), "the remind layer has no presets")
      ensure(await layerRow(app, "Pick a date and time…").count(), "the remind layer has no Pick a date and time…")
      ensure(!(await layerRow(app, "Remove reminder").count()), "Remove reminder shows with no reminder set")
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
  {
    // Import notes (brief T5): from the empty list's IMPORT, Settings › Notes with its form in the form layer: the three
    // sources, each with its line; CHOOSE A FOLDER… the primary, CHOOSE FILES… beside it, and the caption.
    name: "notes-import",
    scenario: "notes-empty",
    sean: { kind: "undrawn", area: "settings", screen: "import" },
    run: async (app) => {
      const { page } = app
      await area(app, "Notes")
      await press(app, page.getByRole("button", { name: "Import", exact: true }))
      let form = page.getByRole("dialog", { name: /Import notes/ })
      ensure(await form.isVisible(), "IMPORT did not open the import form")
      // Under the form (which hides the page from screen readers while it is open): Settings › Notes.
      await page.keyboard.press("Escape")
      await app.settle()
      ensure(await notesSettingsOpen(page), "IMPORT did not open Settings › Notes")
      await press(app, page.getByRole("group", { name: "Import", exact: true }).getByRole("button", { name: "Import", exact: true }))
      form = page.getByRole("dialog", { name: /Import notes/ })
      for (const name of ["Apple Notes", "Google Keep", "Obsidian, Bear or any Markdown"]) ensure(await form.getByRole("button", { name: new RegExp(`^${name}`) }).isVisible(), `the import form has no ${name}`)
      ensure(await formPrimary(form, "Choose a folder…").isVisible(), "the import form has no CHOOSE A FOLDER…")
      ensure(await form.getByRole("button", { name: "Choose files…", exact: true }).isVisible(), "the import form has no CHOOSE FILES…")
      ensure(await form.getByText("Notes are copied in. Nothing changes where they came from.").isVisible(), "the import form has no caption")
      await page.mouse.move(0, 0)
      await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
    },
  },
  {
    // Set up sync (brief T5), from Settings › Notes: RELAY ADDRESS, ACCESS TOKEN, TURN ON SYNC; no key field for a relay not known to be encrypted.
    name: "notes-sync",
    run: async (app) => {
      const { page } = app
      await notesSettings(app)
      await press(app, page.getByRole("group", { name: "Sync between devices", exact: true }).getByRole("button", { name: "Set up", exact: true }))
      const form = page.getByRole("dialog", { name: /Sync between devices/ })
      ensure(await form.getByText("Any Hocuspocus server works.").isVisible(), "RELAY ADDRESS has no helper")
      ensure(await form.getByText("Kept in your system keychain.").isVisible(), "ACCESS TOKEN has no helper")
      ensure(!(await form.getByText("Encryption key").count()), "the form asks for a key the relay was not known to need")
      ensure(await formPrimary(form, "Turn on sync").isVisible(), "the form has no TURN ON SYNC")
    },
  },
  {
    // Quick Note from a conversation (brief N7): QUICK NOTE // the conversation with UNLINK; DONE saves it, linked,
    // with "Saved to Notes" and OPEN; opened again there, the note is under HERE ALREADY.
    name: "notes-quick-note",
    sean: { kind: "undrawn", area: "notes", screen: "quick-note" },
    run: async (app) => {
      const { page } = app
      await area(app, "Mail")
      await conversation(app, /Token audit/)
      await page.keyboard.press("Alt+KeyN")
      await app.settle()
      let layer = quickNote(page)
      await layer.waitFor()
      ensure(/^Quick note \/\/ .*Token audit/i.test((await layer.locator('[data-role="quick-note-about"]').innerText()).trim()), "the overline does not name the open conversation")
      ensure(await layer.getByRole("button", { name: /^Unlink/ }).count(), "there is no UNLINK beside the overline")
      ensure((await page.evaluate(() => document.activeElement?.getAttribute("aria-label"))) === "Quick note", "the words do not take focus")
      await page.keyboard.type("Ask Ana for the audit's color pairs\nThe pairs that fail on stone.")
      await press(app, layer.getByRole("button", { name: "Done", exact: true }))
      const toast = toastSaying(page, "Saved to Notes")
      await toast.waitFor()
      ensure(await toast.getByRole("button", { name: "Open" }).count(), "the toast has no OPEN")
      ensure(!(await quickNote(page).count()), "DONE did not close the quick note")
      await toastGone(app)
      await page.keyboard.press("Alt+KeyN")
      await app.settle()
      layer = quickNote(page)
      const here = layer.getByRole("list", { name: "Notes here already" })
      await here.waitFor()
      ensure(await here.getByRole("button", { name: /Ask Ana for the audit's color pairs/ }).count(), "the saved note is not linked to the conversation")
    },
  },
  {
    // Closing a quick note any other way saves it too (brief N7); UNLINK saves it with no link.
    name: "notes-quick-note-close",
    sizes: ["desktop"],
    run: async (app) => {
      const { page } = app
      await area(app, "Mail")
      await conversation(app, /Token audit/)
      await page.keyboard.press("Alt+KeyN")
      await app.settle()
      const layer = quickNote(page)
      await press(app, layer.getByRole("button", { name: /^Unlink/ }))
      ensure((await layer.locator('[data-role="quick-note-about"]').innerText()).trim().toLowerCase() === "quick note", "UNLINK left the conversation in the overline")
      await page.keyboard.type("Book the ferry for the cabin")
      await page.keyboard.press("Escape")
      await toastSaying(page, "Saved to Notes").waitFor()
      await toastGone(app)
      await page.keyboard.press("Alt+KeyN")
      await app.settle()
      ensure(!(await quickNote(page).getByRole("list", { name: "Notes here already" }).count()), "an unlinked note was linked to the conversation")
      await page.keyboard.press("Escape")
      await app.settle()
      await area(app, "Notes")
      ensure(await notesList(page).getByRole("button", { name: /Book the ferry for the cabin/ }).count(), "Esc did not save the quick note")
    },
  },
  {
    // Open a shared note (brief N6), from Notes' folders: LINK, then what the link is, and ADD TO MY NOTES.
    name: "notes-open-shared",
    sean: { kind: "undrawn", area: "notes", screen: "open-shared" },
    run: async (app) => {
      const form = await openSharedForm(app)
      await form.getByLabel("Link", { exact: true }).fill(SHARED_LINK)
      await app.settle()
      await app.page.evaluate(() => document.activeElement?.blur())
    },
    assert: async (app) => {
      const form = openSharedLayer(app.page)
      // textContent: a value cut in the middle is two boxes, which innerText would break apart.
      const facts = await form.locator('[data-role="shared-link-facts"]').textContent()
      for (const w of ["Lake trip budget", "Priya Raman", "Edit"]) ensure(facts.includes(w), `the link's facts do not say ${w}`)
      ensure(await formPrimary(form, "Add to my notes").isEnabled(), "ADD TO MY NOTES is not offered for a note's link")
    },
  },
  {
    // Not a share link (brief N6): the field's error, and no way to add it; a conversation's link opens in Team.
    name: "notes-open-shared-wrong",
    run: async (app) => {
      const form = await openSharedForm(app)
      await form.getByLabel("Link", { exact: true }).fill("https://example.com/notes/cabin")
      await app.settle()
      await form.getByText("That isn't a shared-note link.").waitFor()
      ensure(await formPrimary(form, "Add to my notes").isDisabled(), "ADD TO MY NOTES works for a link that is not one")
      await form.getByLabel("Link", { exact: true }).fill(THREAD_LINK)
      await app.settle()
      ensure(await formPrimary(form, "Open in Team").count(), "a conversation's link does not offer OPEN IN TEAM")
    },
  },
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
