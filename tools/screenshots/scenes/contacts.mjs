// Contacts: the list, a person, editing, groups, sharing, duplicates and restore.
import { area, button, ensure, formLayer, formPrimary, goBack, groups, headTitle, leaveLayer, oneCurrent, pick, press, switcherLayer, toastGone } from "./helpers.mjs"

/** The people in the open list (ADR-0102): letter sections of rows. */
const people = (page) => page.getByRole("group", { name: "People", exact: true })

/** Opens a person from the Contacts list by name. */
export const person = async (app, name) => {
  await area(app, "Contacts")
  await press(app, people(app.page).getByRole("button", { name }))
}

/** The open person's Field Rows. */
const details = (page) => page.getByRole("group", { name: "Details", exact: true })
/** A row of the open person by its label, as the row is named (FieldRow: the label names the group). */
const row = (page, label) => details(page).getByRole("group", { name: label, exact: true })
const toasts = (page) => page.locator("[data-sonner-toast]")

/**
 * The person's ways to share (brief P2): SHARE's menu on a desktop and at
 * medium width, the top bar's More on a phone, which also holds Quick note
 * and Delete.
 */
const shareMenu = async (app) => {
  const { page } = app
  await press(app, button(page, app.phone ? "More" : "Share"))
}
/** A row of an open menu or of a phone's menu sheet. */
const menuRow = (page, name) => page.getByRole("menuitem", { name, exact: true }).or(page.getByRole("dialog").getByRole("button", { name, exact: true }))

/** The open smart group form: the form layer's dialog, or a phone's full-screen sheet. */
const form = (page) => page.getByRole("dialog").last()

export const scenes = [
  {
    // Mobile / 11, Desktop / 09's list (brief P1): letter sections with counts, no Favorites (W5), rows
    // with the first label at the right and the address book after the detail line.
    name: "contacts",
    sean: { kind: "drawn", area: "contacts", screen: "list" },
    run: (app) => area(app, "Contacts"),
    assert: async (app) => {
      const { page } = app
      ensure((await headTitle(page)) === "People", "the list's title is not People")
      const sections = people(page).locator('[data-slot="section-header"]')
      ensure((await sections.count()) >= 5, `the list has ${await sections.count()} letter sections`)
      ensure(!(await people(page).getByText(/favorite/i).count()), "the list shows a Favorites section, which has no data")
      const priya = people(page).getByRole("listitem").filter({ hasText: "Priya Raman" })
      ensure(/priya@studio\.example \/\/ Work/.test(await priya.innerText()), "Priya's row does not read her email, then her address book")
    },
  },
  {
    // Mobile / 12, Desktop / 09's person (brief P2). COPY says "Copied" for 2 s in its own place and raises no toast.
    name: "contacts-person",
    sean: { kind: "drawn", area: "contacts", screen: "person" },
    run: (app) => person(app, /Priya Raman/),
    assert: async (app) => {
      const { page } = app
      await page.context().grantPermissions(["clipboard-read", "clipboard-write"])
      const work = row(page, "Work")
      await work.getByRole("button", { name: "Copy", exact: true }).click()
      await work.getByRole("button", { name: "Copied", exact: true }).waitFor({ timeout: 1000 })
      ensure(!(await toasts(page).count()), "COPY raised a toast")
      ensure((await page.evaluate(() => navigator.clipboard.readText())) === "priya@studio.example", "COPY did not copy the address")
      // Back to its word after two seconds: the picture shows the row at rest.
      await work.getByRole("button", { name: "Copy", exact: true }).waitFor({ timeout: 4000 })
      await page.evaluate(() => document.activeElement?.blur())
      await page.mouse.move(0, 0)
      await app.settle()
      ensure(!(await toasts(page).count()), "a toast showed after COPY")
    },
  },
  {
    // Desktop / 09 as a whole: the list with a person open beside it, the row selected.
    name: "contacts-list-person",
    sizes: ["desktop"],
    sean: { kind: "drawn", area: "contacts", screen: "list-person" },
    run: (app) => person(app, /Marcus Lee/),
    assert: async (app) => {
      const { page } = app
      ensure((await people(page).locator('[aria-current="true"]').count()) === 1, "the open person's row is not the one selected")
      ensure(await row(page, "Birthday").isVisible(), "Marcus's birthday has no row")
    },
  },
  {
    // A card with every row (brief P2): the photo, two emails, two phones, labels, a birthday, a note,
    // where it is kept, and the meetings and mail with them.
    name: "contacts-photo",
    scenario: "contacts-full",
    run: (app) => person(app, /Priya Raman/),
    assert: async (app) => {
      const { page } = app
      const card = page.getByRole("article", { name: "Priya Raman" })
      ensure(await card.locator('[data-slot="initial-tile-image"]').first().isVisible(), "the card's photo does not show")
      for (const label of ["Work", "Home", "Cell", "Birthday", "Note", "Saved in"]) ensure(await row(page, label).first().isVisible(), `the ${label} row is missing`)
      ensure((await details(page).getByRole("button", { name: "Copy", exact: true }).count()) === 2, "each email should have COPY")
      ensure((await details(page).getByRole("link", { name: /^Call / }).count()) === 2, "each phone should have CALL")
      ensure((await card.getByRole("list", { name: "Labels" }).getByRole("listitem").count()) === 2, "the two labels are not badges")
      for (const section of ["Upcoming", "Recent mail", "Met recently"]) ensure(await card.getByRole("region", { name: section }).isVisible(), `${section} is missing`)
      ensure(/Design systems lead/.test(await card.innerText()), "the head does not say the job title")
    },
  },
  {
    name: "contacts-edit",
    run: async (app) => {
      await person(app, /Priya Raman/)
      await press(app, button(app.page, "Edit"))
    },
  },
  {
    name: "contacts-new",
    run: async (app) => {
      await area(app, "Contacts")
      await press(app, button(app.page, "New contact"))
    },
  },
  {
    // A contact in the form layer (ADR-0087): still a dialog on a desktop until it is edited in the pane.
    name: "form-layer-contact",
    sizes: ["desktop", "phone", "medium"],
    run: async (app) => {
      const { page } = app
      const open = async () => {
        await area(app, "Contacts")
        await press(app, button(page, "New contact"))
        return page.getByRole("dialog", { name: "New contact" })
      }
      const write = (form) => form.getByRole("textbox", { name: "Name", exact: true }).fill("Noor Haddad")
      await formLayer(app, { open, write, primary: "Add" })
      const toast = page.locator("[data-sonner-toast]").first()
      await toast.waitFor()
      await page.mouse.move(0, 0)
      await toast.waitFor({ state: "detached", timeout: 15_000 })
      await write(await open())
    },
  },
  {
    // SHARE's menu (brief P2): Save as vCard file and Show QR code (Share… where the device can).
    // A phone's More holds them, then Quick note and Delete.
    name: "contacts-share",
    sean: { kind: "undrawn", area: "contacts", screen: "share-menu" },
    run: async (app) => {
      await person(app, /Priya Raman/)
      await shareMenu(app)
    },
    assert: async (app) => {
      const { page } = app
      for (const name of ["Save as vCard file", "Show QR code"]) ensure(await menuRow(page, name).isVisible(), `${name} is not in the menu`)
      if (app.phone) for (const name of ["Quick note", "Delete"]) ensure(await menuRow(page, name).isVisible(), `More has no ${name}`)
    },
  },
  {
    // The QR code (brief P2): dark on its light square in both themes, in a question-size dialog or a sheet.
    name: "contacts-qr",
    sean: { kind: "undrawn", area: "contacts", screen: "qr" },
    run: async (app) => {
      await person(app, /Priya Raman/)
      await shareMenu(app)
      await press(app, menuRow(app.page, "Show QR code"))
    },
    assert: async (app) => {
      const dialog = app.page.getByRole("dialog", { name: "Priya Raman" })
      ensure(await dialog.getByRole("img", { name: "QR code to add Priya Raman" }).isVisible(), "the QR code does not show")
      ensure(await dialog.getByText("Scan with a phone's camera to add this contact.").isVisible(), "the QR code has no line under it")
    },
  },
  {
    // A card in a read-only address book (brief P2): no EDIT or DELETE, and the locked caption.
    name: "contacts-readonly",
    scenario: "contacts-readonly",
    run: (app) => person(app, /Priya Raman/),
    assert: async (app) => {
      const { page } = app
      ensure(await page.getByText("This address book is read-only.").isVisible(), "the read-only caption is missing")
      for (const name of ["Edit", "Delete"]) ensure(!(await button(page, name).count()), `a read-only card offers ${name}`)
    },
  },
  {
    // An account's address books did not sync (brief X4): Contacts' one critical banner, with OPEN ACCOUNTS.
    name: "contacts-dav-error",
    scenario: "dav-error",
    run: (app) => area(app, "Contacts"),
    assert: async (app) => {
      const banner = app.page.getByRole("alert").filter({ hasText: "Work contacts didn't sync" })
      ensure(await banner.isVisible(), "the sync banner is missing")
      ensure(await banner.getByRole("button", { name: "Open Accounts", exact: true }).isVisible(), "the banner cannot open Accounts")
    },
  },
  {
    name: "contacts-loading",
    scenario: "contacts-loading",
    loading: true,
    run: (app) => area(app, "Contacts"),
  },
  {
    // Possible duplicates (brief P2): the person's banner, whose REVIEW opens the Duplicates place.
    name: "contacts-duplicates",
    run: async (app) => {
      await person(app, /Ana Duarte/)
      const banner = app.page.getByRole("status").filter({ hasText: "2 cards look like this person." })
      ensure(await banner.isVisible(), "Ana's card does not say it has duplicates")
      await press(app, banner.getByRole("button", { name: "Review", exact: true }))
    },
    assert: async (app) => ensure((await headTitle(app.page)) === "Duplicates", "REVIEW did not open Duplicates"),
  },
  {
    name: "contacts-restore",
    run: async (app) => {
      await area(app, "Contacts")
      await pick(app, "Restore contacts")
    },
  },
  {
    name: "contacts-smart-group",
    sean: { kind: "undrawn", area: "contacts", screen: "smart-group-form" },
    run: async (app) => {
      await area(app, "Contacts")
      await pick(app, "New smart group…")
    },
    assert: async (app) => {
      const f = form(app.page)
      ensure(await f.getByText("People join and leave as their cards change. They must match everything you fill in.").isVisible(), "the form's line is missing")
      for (const name of ["Name", "Has any of these labels", "Company", "Email domain"]) ensure(await f.getByRole("textbox", { name, exact: true }).count(), `the form has no ${name}`)
      ensure(await f.getByRole("textbox", { name: "In touch within", exact: true }).count(), "the form has no In touch within")
      for (const name of ["Has a phone number", "Has a birthday"]) ensure(await f.getByRole("switch", { name, exact: true }).count(), `the form has no ${name}`)
    },
  },
  {
    // A smart group (brief P1): its name and count in the head, and chips under it that narrow it by label.
    name: "contacts-group",
    scenario: "contacts-group",
    sean: { kind: "undrawn", area: "contacts", screen: "group" },
    run: async (app) => {
      await area(app, "Contacts")
      await pick(app, "Studio and clay club")
      if (await switcherLayer(app.page).count()) await leaveLayer(app)
    },
    assert: async (app) => {
      const { page } = app
      ensure((await headTitle(page)) === "Studio and clay club", "the group's name is not the title")
      const chips = page.getByRole("radiogroup", { name: "Narrow Studio and clay club by label" })
      const all = await people(page).getByRole("listitem").count()
      await press(app, chips.getByRole("radio", { name: /^Clay club/ }))
      const narrowed = await people(page).getByRole("listitem").count()
      ensure(narrowed > 0 && narrowed < all, `the Clay club chip shows ${narrowed} of ${all}`)
      await press(app, chips.getByRole("radio", { name: /^All/ }))
      ensure((await people(page).getByRole("listitem").count()) === all, "ALL did not bring everyone back")
      await page.evaluate(() => document.activeElement?.blur())
    },
  },
  {
    // A smart group saves, opens, and deletes with UNDO (brief P1): UNDO makes it again from its rule.
    name: "contacts-smart-group-undo",
    run: async (app) => {
      const { page } = app
      const name = "Clay club people"
      await area(app, "Contacts")
      await pick(app, "New smart group…")
      await form(page).getByRole("textbox", { name: "Name", exact: true }).fill(name)
      const labels = form(page).getByRole("textbox", { name: "Has any of these labels", exact: true })
      await labels.fill("Clay club")
      await labels.press("Enter")
      await press(app, formPrimary(form(page), "Create group"))
      ensure((await headTitle(page)) === name, "the new group did not open")
      await pick(app, `Edit smart group ${name}`)
      await press(app, form(page).getByRole("button", { name: "Delete", exact: true }))
      const toast = toasts(page).filter({ hasText: `Deleted ${name}` })
      await toast.waitFor()
      ensure(/Nobody in it was changed/.test(await toast.innerText()), "the toast does not say nobody was changed")
      ensure((await headTitle(page)) === "People", "deleting the group did not return to everyone")
      await press(app, toast.getByRole("button", { name: "Undo", exact: true }))
      ensure((await headTitle(page)) === name, "UNDO did not bring the group back")
      if (await toasts(page).count()) await toastGone(app)
    },
  },
  {
    // Contacts' groups and clean-up tools (ADR-0084; brief X1): the page head's sheet on a phone, its
    // popover at medium width, the sidebar's groups on a desktop.
    name: "contacts-groups-sheet",
    sizes: ["phone", "desktop", "medium"],
    sean: { kind: "undrawn", area: "contacts", screen: "groups-sheet" },
    run: async (app) => {
      const { page } = app
      await area(app, "Contacts")
      // A label is a place: it opens from its row, and Back is everyone again.
      await pick(app, "Work")
      ensure((await headTitle(page)) === "Work", "the Work label did not open from the groups")
      await goBack(app)
      ensure((await headTitle(page)) === "People", "Back from a label did not return to everyone")
      // Restore contacts opens through its intent; the layer closes first.
      await pick(app, "Restore contacts")
      ensure(await page.getByRole("dialog", { name: "Restore contacts" }).isVisible(), "Restore contacts did not open")
      ensure(!(await switcherLayer(page).count()), "the layer stayed open under the form")
      await leaveLayer(app)
      await groups(app)
    },
    assert: async (app) => {
      const list = await groups(app)
      ensure((await oneCurrent(list, "Contacts' groups")).startsWith("All contacts"), "All contacts is not the current place")
      for (const row of ["Duplicates", "Recently deleted", "Restore contacts", "New smart group…"]) ensure(await list.locator(`[aria-label="${row}"], [aria-label^="${row}, "]`).count(), `${row} is not in Contacts' groups`)
    },
  },
  {
    // Duplicates is a place (brief P4): today's pane, with the list's room.
    name: "places-duplicates",
    sizes: ["phone", "desktop", "medium"],
    run: async (app) => {
      await area(app, "Contacts")
      await pick(app, "Duplicates")
    },
    assert: async (app) => {
      const { page } = app
      ensure((await headTitle(page)) === "Duplicates", "the page head does not name Duplicates")
      ensure(await button(page, "Merge").first().isVisible(), "the duplicates cannot be merged from here")
      ensure((await oneCurrent(await groups(app), "Contacts' groups")).startsWith("Duplicates"), "Duplicates is not the current place")
      if (await switcherLayer(page).count()) await leaveLayer(app)
      await goBack(app)
      ensure((await headTitle(page)) === "People", "Back from Duplicates did not return to everyone")
      await page.goForward()
      await app.settle()
    },
  },
  {
    // Recently deleted is a place (brief P5): today's pane, with the list's room. Nothing is deleted in the sample data.
    name: "places-recently-deleted",
    sizes: ["phone", "desktop", "medium"],
    run: async (app) => {
      await area(app, "Contacts")
      await pick(app, "Recently deleted")
    },
    assert: async (app) => {
      const { page } = app
      ensure((await headTitle(page)) === "Recently deleted", "the page head does not name Recently deleted")
      ensure(await page.getByRole("region", { name: "Recently deleted" }).isVisible(), "the Recently deleted pane is not showing")
      ensure((await oneCurrent(await groups(app), "Contacts' groups")) === "Recently deleted", "Recently deleted is not the current place")
      if (await switcherLayer(page).count()) await leaveLayer(app)
    },
  },
]
