// Contacts: the list, a person, editing, groups, sharing, duplicates and restore.
import { area, button, discardQuestion, ensure, formLayer, formPrimary, goBack, groups, headTitle, leaveLayer, oneCurrent, pick, press, sidebar, switcherLayer, toastGone } from "./helpers.mjs"

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

/** Where the contact form stands (ADR-0103): beside the list on a desktop; the form layer at medium width and on a phone. */
const inPane = (app) => app.size === "desktop"
/** The open contact form: the pane's form by its name, or the form layer's dialog. */
const contactForm = (app, name = /^(Edit|New) contact$/) => (inPane(app) ? app.page.getByRole("form", { name }) : app.page.getByRole("dialog").last())
const field = (f, name) => f.getByRole("textbox", { name, exact: true })
/** PASTE A SIGNATURE: at the head's right in the pane, at the form's top right in the layer. */
const paster = (app, f) => (inPane(app) ? app.page : f).getByRole("button", { name: "Paste a signature", exact: true })
const crumbs = (page) => page.getByRole("navigation", { name: "Breadcrumb" })
const statusLine = (page) => page.locator('[data-slot="app-frame-status-line"]')
/** Opens a person, then EDIT: the button on a desktop, the top bar's on a phone. */
const editPerson = async (app, name) => {
  await person(app, name)
  await press(app, button(app.page, "Edit"))
}
/** Takes focus and the pointer off the last control, so its ring and hover are not in the picture by chance. */
const rest = async (page) => {
  await page.evaluate(() => document.activeElement?.blur())
  await page.mouse.move(0, 0)
}

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
    // Desktop / 10, Mobile / 13 (brief P3): the form in the detail column beside the list on a desktop, with
    // CONTACTS // {NAME} // EDIT; the whole screen on a phone (close, "Edit contact", the checkmark); the form
    // layer's dialog at medium width.
    name: "contacts-edit",
    sizes: ["desktop", "phone", "medium"],
    sean: { kind: "drawn", area: "contacts", screen: "edit" },
    run: async (app) => {
      await editPerson(app, /Priya Raman/)
      await rest(app.page)
    },
    assert: async (app) => {
      const { page } = app
      const f = contactForm(app)
      ensure(await f.isVisible(), "the contact form is not open")
      ensure((await field(f, "Name").inputValue()) === "Priya Raman", "NAME does not hold the card's name")
      ensure((await field(f, "Company").inputValue()) === "Studio", "COMPANY does not hold the card's company")
      ensure(await paster(app, f).isVisible(), "the form has no PASTE A SIGNATURE")
      // BIRTHDAY is the app's date picker, not the browser's date field (ADR-0088).
      ensure(!(await f.locator('input[type="date"]').count()), "BIRTHDAY is the browser's date field")
      ensure(await f.getByRole("group", { name: "Birthday", exact: true }).getByRole("button", { name: "Pick a birthday", exact: true }).isVisible(), "BIRTHDAY has no picker")
      if (inPane(app)) {
        ensure(!(await page.getByRole("dialog").count()), "on a desktop the form opened as a dialog, not in the pane")
        ensure(await people(page).isVisible(), "the list is not beside the form")
        ensure((await people(page).locator('[aria-current="true"]').count()) === 1, "Priya's row is not the selected one while she is edited")
        ensure(/contacts\s*\/\/\s*priya raman\s*\/\/\s*edit/i.test(await crumbs(page).innerText()), `the breadcrumb reads ${await crumbs(page).innerText()}`)
        ensure(!/unsaved/i.test(await statusLine(page).innerText()), "an untouched form says it has unsaved changes")
        const words = (await f.getByRole("group", { name: "Form actions" }).getByRole("button").allInnerTexts()).map((w) => w.trim().toLowerCase())
        ensure(words.join() === "cancel,save", `the form's buttons read ${words.join(", ")}, not Cancel, Save`)
      } else if (app.phone) {
        ensure((await f.locator('[data-slot="top-bar-title"]').innerText()).trim() === "Edit contact", "the phone's top row does not say Edit contact")
      }
    },
  },
  {
    // BIRTHDAY in the app's date style (Mobile / 13: "Mar 04"), the year beside it; a day picked in the
    // shared DatePicker keeps the year; REMOVE BIRTHDAY empties both.
    name: "contacts-edit-birthday",
    sizes: ["desktop", "phone"],
    run: async (app) => {
      const { page } = app
      await editPerson(app, /Marcus Lee/)
      // The form, held by name: on a phone the picker is a dialog too.
      const f = inPane(app) ? contactForm(app) : page.getByRole("dialog", { name: /Edit contact/ })
      const day = field(f, "Birthday")
      ensure(/^[A-Z][a-z]{2} \d{2}$/.test(await day.inputValue()), `BIRTHDAY reads ${await day.inputValue()}, not the app's date style`)
      ensure((await field(f, "Year").inputValue()) === "1990", "YEAR does not hold the card's year")
      const group = f.getByRole("group", { name: "Birthday", exact: true })
      await press(app, group.getByRole("button", { name: /^Birthday, / }))
      // The month grid's 4th: each day is named by its full date ("Friday, November 4").
      const fourth = page.getByRole("gridcell", { name: /^\w+, \w+ 4(,|$)/ }).first()
      await fourth.waitFor()
      await press(app, fourth)
      ensure(/ 04$/.test(await day.inputValue()), `picking the 4th left BIRTHDAY at ${await day.inputValue()}`)
      ensure((await field(f, "Year").inputValue()) === "1990", "picking a day lost the year")
      await press(app, group.getByRole("button", { name: "Remove birthday", exact: true }))
      ensure((await day.inputValue()) === "" && !(await field(f, "Year").count()), "REMOVE BIRTHDAY left a birthday")
    },
  },
  {
    // A phone number error as Desktop / 10 and Mobile / 13 draw it, with a rule that is always true; the photo
    // removed; UNSAVED CHANGES in the status line; SAVE keeps the form while a number is wrong.
    name: "contacts-edit-error",
    scenario: "contacts-full",
    run: async (app) => {
      const { page } = app
      await editPerson(app, /Priya Raman/)
      const f = contactForm(app)
      ensure(await f.locator('[data-slot="initial-tile-image"]').isVisible(), "the card's photo is not in the form")
      await press(app, f.getByRole("button", { name: "Remove photo", exact: true }))
      ensure(!(await f.locator('[data-slot="initial-tile-image"]').count()), "REMOVE PHOTO left the photo")
      ensure(await f.getByRole("button", { name: "Add photo", exact: true }).isVisible(), "with no photo the form does not offer ADD PHOTO")
      await press(app, f.getByRole("button", { name: "Add phone", exact: true }))
      const added = f.getByRole("textbox", { name: "Phone 3", exact: true })
      await added.fill("+1 555 FLOWERS")
      await added.press("Tab")
      await app.settle()
      await press(app, f.getByRole("button", { name: "Save", exact: true }))
      await rest(page)
    },
    assert: async (app) => {
      const { page } = app
      const f = contactForm(app)
      ensure(await f.isVisible(), "SAVE closed the form with a wrong number")
      ensure(await f.getByText("Use digits, spaces and +.", { exact: true }).isVisible(), "the wrong number has no error under it")
      ensure((await f.getByRole("textbox", { name: "Phone 3", exact: true }).getAttribute("aria-invalid")) === "true", "the wrong number's field is not marked invalid")
      ensure((await f.getByText("Use digits, spaces and +.").count()) === 1, "a number the card already had was questioned")
      if (inPane(app)) ensure(/unsaved changes/i.test(await statusLine(page).innerText()), "the status line does not say UNSAVED CHANGES")
    },
  },
  {
    // A new contact (brief P3): the same form, CONTACTS // NEW on a desktop, and SAVED IN with CHANGE.
    name: "contacts-new",
    sean: { kind: "undrawn", area: "contacts", screen: "new" },
    run: async (app) => {
      await area(app, "Contacts")
      await press(app, button(app.page, "New contact"))
      await rest(app.page)
    },
    assert: async (app) => {
      const { page } = app
      const f = contactForm(app, "New contact")
      ensure(await f.isVisible(), "NEW CONTACT did not open the form")
      ensure(await f.getByRole("group", { name: "Saved in", exact: true }).isVisible(), "a new contact has no SAVED IN")
      ensure(await f.getByRole("button", { name: "Change", exact: true }).isVisible(), "SAVED IN has no CHANGE")
      if (inPane(app)) ensure(/contacts\s*\/\/\s*new/i.test(await crumbs(page).innerText()), `the breadcrumb reads ${await crumbs(page).innerText()}`)
    },
  },
  {
    // Leaving with changes asks (brief X6): another row, a section, Esc, the close button. KEEP EDITING is the
    // no, takes focus, and keeps the form as it was. The picture is the question.
    name: "contacts-leave-guard",
    sizes: ["desktop", "phone"],
    run: async (app) => {
      const { page } = app
      await editPerson(app, /Priya Raman/)
      const f = contactForm(app)
      await field(f, "Name").fill("Priya R. Raman")
      const keep = async (why) => {
        await discardQuestion(page).waitFor()
        const focused = await page.evaluate(() => document.activeElement?.textContent?.trim())
        ensure(/keep editing/i.test(focused ?? ""), `${why}: focus is on ${focused}, not KEEP EDITING`)
        await press(app, discardQuestion(page).getByRole("button", { name: "Keep editing", exact: true }))
        ensure((await field(contactForm(app), "Name").inputValue()) === "Priya R. Raman", `${why}: KEEP EDITING lost what was typed`)
      }
      if (inPane(app)) {
        await press(app, people(page).getByRole("button", { name: /Marcus Lee/ }))
        await keep("another row")
        await press(app, sidebar(page).getByRole("button", { name: "Calendar", exact: true }))
        await keep("another section")
        ensure((await headTitle(page)) === "People", "KEEP EDITING still left Contacts")
        // A new form in place of this one asks too: the sidebar's NEW CONTACT, and ⌘K › New contact.
        await press(app, sidebar(page).getByRole("button", { name: "New contact", exact: true }))
        await keep("NEW CONTACT")
        await page.keyboard.press("Control+KeyK")
        await app.settle()
        const menu = page.getByRole("dialog", { name: "Command menu" })
        await menu.getByRole("combobox").fill("new contact")
        await press(app, menu.getByRole("option", { name: "New contact", exact: true }))
        await keep("⌘K › New contact")
        await field(contactForm(app), "Name").press("Escape")
        await app.settle()
        await keep("Esc")
        await press(app, people(page).getByRole("button", { name: /Marcus Lee/ }))
      } else {
        await press(app, f.getByRole("button", { name: "Close", exact: true }))
        await keep("the close button")
        await press(app, contactForm(app).getByRole("button", { name: "Close", exact: true }))
      }
      await discardQuestion(page).waitFor()
    },
  },
  {
    // DISCARD makes the move: the other person opens and the form is gone.
    name: "contacts-leave-discard",
    sizes: ["desktop"],
    run: async (app) => {
      const { page } = app
      await editPerson(app, /Priya Raman/)
      await field(contactForm(app), "Name").fill("Priya R. Raman")
      await press(app, people(page).getByRole("button", { name: /Marcus Lee/ }))
      await press(app, discardQuestion(page).getByRole("button", { name: "Discard", exact: true }))
    },
    assert: async (app) => {
      const { page } = app
      ensure(!(await contactForm(app).count()), "DISCARD left the form open")
      ensure(await page.getByRole("article", { name: "Marcus Lee" }).isVisible(), "DISCARD did not open the row that was pressed")
      ensure(!/unsaved/i.test(await statusLine(page).innerText()), "the status line still says UNSAVED CHANGES")
    },
  },
  {
    // PASTE A SIGNATURE (brief P3): text it can't read stays in the popover with the field's error; a real
    // signature fills NAME, COMPANY, JOB TITLE, the email and the phone, with the toast "Filled in …".
    name: "contacts-paste-signature",
    run: async (app) => {
      const { page } = app
      await area(app, "Contacts")
      await press(app, button(page, "New contact"))
      const f = contactForm(app, "New contact")
      const layer = () => page.getByRole("dialog", { name: "Paste a signature" })
      await press(app, paster(app, f))
      await layer().getByRole("textbox", { name: "Signature" }).fill("Thanks!")
      await press(app, layer().getByRole("button", { name: "Fill in", exact: true }))
      ensure(await layer().getByText("Couldn't find a name, phone or email in that text", { exact: true }).isVisible(), "text with no card in it gave no error")
      await layer().getByRole("textbox", { name: "Signature" }).fill("Noor Haddad\nProgramme lead | Harbour Arts\nnoor@harbourarts.example\nm: +44 20 7946 0321")
      await press(app, layer().getByRole("button", { name: "Fill in", exact: true }))
      ensure(!(await layer().count()), "FILL IN left the popover open")
      const toast = toasts(page).filter({ hasText: "Filled in name" })
      await toast.waitFor()
      ensure(/Filled in name, title, company, phone, email/.test(await toast.innerText()), `the toast reads ${await toast.innerText()}`)
      await toastGone(app)
      await rest(page)
    },
    assert: async (app) => {
      const f = contactForm(app, "New contact")
      const want = { Name: "Noor Haddad", Company: "Harbour Arts", "Job title": "Programme lead", "Email 1": "noor@harbourarts.example", "Phone 1": "+44 20 7946 0321" }
      for (const [name, value] of Object.entries(want)) ensure((await field(f, name).inputValue()) === value, `${name} reads ${await field(f, name).inputValue()}, not ${value}`)
    },
  },
  {
    // The contact form in the form layer (ADR-0087) where it opens there: a phone's whole screen and a dialog at
    // medium width. On a desktop it stands in the pane (ADR-0103), checked the same way: Esc closes it untouched,
    // it asks once it holds writing, and Ctrl+Enter saves it.
    name: "form-layer-contact",
    sizes: ["desktop", "phone", "medium"],
    run: async (app) => {
      const { page } = app
      const open = async () => {
        await area(app, "Contacts")
        await press(app, button(page, "New contact"))
        return contactForm(app, "New contact")
      }
      const write = (form) => field(form, "Name").fill("Noor Haddad")
      if (inPane(app)) {
        let form = await open()
        await page.keyboard.press("Escape")
        await app.settle()
        ensure(!(await discardQuestion(page).count()), "an untouched form asked before closing")
        ensure(!(await form.count()), "Esc did not close the form")
        form = await open()
        await write(form)
        await page.keyboard.press("Escape")
        await app.settle()
        ensure(await discardQuestion(page).isVisible(), "a form with writing closed without asking")
        await press(app, discardQuestion(page).getByRole("button", { name: "Keep editing", exact: true }))
        await field(form, "Name").focus()
        await page.keyboard.press("Control+Enter")
        await form.waitFor({ state: "detached" })
        await app.settle()
        ensure(await page.getByRole("article", { name: "Noor Haddad" }).isVisible(), "the saved contact did not open")
      } else await formLayer(app, { open, write, primary: "Save" })
      await toastGone(app)
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
    // Duplicates (brief P4), reached from the person's REVIEW: a set per person, "Keep which?" as rows with a
    // leading radio, each card's real addresses and its book, what the kept card holds, and MERGE.
    name: "contacts-duplicates",
    sean: { kind: "undrawn", area: "contacts", screen: "duplicates" },
    run: async (app) => {
      await person(app, /Ana Duarte/)
      const banner = app.page.getByRole("status").filter({ hasText: "2 cards look like this person." })
      ensure(await banner.isVisible(), "Ana's card does not say it has duplicates")
      await press(app, banner.getByRole("button", { name: "Review", exact: true }))
      await rest(app.page)
    },
    assert: async (app) => {
      const { page } = app
      ensure((await headTitle(page)) === "Duplicates", "REVIEW did not open Duplicates")
      const keep = page.getByRole("radiogroup", { name: "Keep which?" })
      ensure((await keep.getByRole("radio").count()) === 2, "the set does not offer its two cards")
      ensure(await page.getByText("Keeps 1 email, 1 phone.", { exact: true }).isVisible(), "the set does not say what the kept card holds")
      ensure(await button(page, "Merge").isVisible(), "the set has no MERGE")
      ensure(/\+351 912 345 678/.test(await keep.innerText()), "a card's row does not show its number")
    },
  },
  {
    // MERGE asks (DC13; decisions §10): "Merge 2 cards into {name}?", focus on Cancel. A press on a row's name
    // picks that card. The picture is the question.
    name: "contacts-merge-confirm",
    run: async (app) => {
      const { page } = app
      await area(app, "Contacts")
      await pick(app, "Duplicates")
      if (await switcherLayer(page).count()) await leaveLayer(app)
      const keep = page.getByRole("radiogroup", { name: "Keep which?" })
      ensure((await keep.getByRole("radio", { name: /^Ana Duarte/, checked: true }).count()) === 1, "the card with the fullest name is not picked first")
      await press(app, keep.getByText("Ana D.", { exact: true }))
      ensure((await keep.getByRole("radio", { name: /^Ana D\. /, checked: true }).count()) === 1, "a press on Ana D.'s row did not pick that card")
      await press(app, keep.getByText("Ana Duarte", { exact: true }))
      ensure((await keep.getByRole("radio", { name: /^Ana Duarte/, checked: true }).count()) === 1, "a press on Ana Duarte's row did not pick that card")
      await press(app, button(page, "Merge"))
    },
    assert: async (app) => {
      const { page } = app
      const q = page.getByRole("dialog", { name: /Merge 2 cards into Ana Duarte\?/ })
      ensure(await q.isVisible(), "MERGE did not ask")
      ensure(await q.getByText("The other cards go to Recently deleted. Merged details can't be split again.").isVisible(), "the question does not say what happens")
      const focused = await page.evaluate(() => document.activeElement?.textContent?.trim())
      ensure(/^cancel$/i.test(focused ?? ""), `focus is on ${focused}, not Cancel`)
    },
  },
  {
    // The merge itself: "Merged into {name}" with OPEN, the merged card holding both cards' details, the set gone.
    name: "contacts-merge",
    run: async (app) => {
      const { page } = app
      await area(app, "Contacts")
      await pick(app, "Duplicates")
      if (await switcherLayer(page).count()) await leaveLayer(app)
      await press(app, page.getByRole("radiogroup", { name: "Keep which?" }).getByText("Ana Duarte", { exact: true }))
      await press(app, button(page, "Merge"))
      await press(app, page.getByRole("dialog", { name: /^Merge 2 cards/ }).getByRole("button", { name: "Merge", exact: true }))
      const toast = toasts(page).filter({ hasText: "Merged into Ana Duarte" })
      await toast.waitFor()
      ensure(await page.getByText("No duplicates left.").isVisible(), "the merged set is still listed")
      await press(app, toast.getByRole("button", { name: "Open", exact: true }))
      await page.mouse.move(0, 0)
      await toast.waitFor({ state: "detached", timeout: 15_000 })
    },
    assert: async (app) => {
      const card = app.page.getByRole("article", { name: "Ana Duarte" })
      ensure(await card.isVisible(), "OPEN did not show the merged card")
      ensure(await row(app.page, "Cell").isVisible(), "the merged card lacks the other card's phone")
      ensure(!(await app.page.getByText("2 cards look like this person.").count()), "the merged card still says it has duplicates")
    },
  },
  {
    // Restore contacts (brief P5) on the form layer: RESTORE TO Yesterday with CHANGE, and WHAT CHANGES naming
    // the cards from the core's preview.
    name: "contacts-restore",
    scenario: "contacts-changed",
    sean: { kind: "undrawn", area: "contacts", screen: "restore" },
    run: async (app) => {
      await area(app, "Contacts")
      await pick(app, "Restore contacts")
      await rest(app.page)
    },
    assert: async (app) => {
      const f = app.page.getByRole("dialog", { name: "Restore contacts" })
      ensure(await f.getByText("Puts every contact back the way it was then.").isVisible(), "the form's line is missing")
      // textContent: a value cut in the middle is two spans, which innerText would part with a space.
      const value = async (label) => ((await f.getByRole("group", { name: label, exact: true }).textContent()) ?? "").replace(/\s+/g, " ")
      ensure(/Yesterday/.test(await value("Restore to")), `RESTORE TO reads ${await value("Restore to")}`)
      ensure(/Lena Fischer/.test(await value("Puts back")), `PUTS BACK reads ${await value("Puts back")}`)
      ensure(/Diego Alvarez and Sam Okafor/.test(await value("Brings back")), `BRINGS BACK reads ${await value("Brings back")}`)
      ensure(/Jonah Brandt, Noor Haddad and 2 more/.test(await value("Removes")), `REMOVES reads ${await value("Removes")}`)
      ensure(/They go to Recently deleted\./.test(await value("Removes")), "REMOVES does not say where they go")
      ensure((await button(f, "Restore").getAttribute("aria-disabled")) !== "true", "RESTORE is disabled with changes to restore")
    },
  },
  {
    // RESTORE, its toast and its UNDO: the added cards leave and the deleted come back, then UNDO puts it all back.
    name: "contacts-restore-undo",
    scenario: "contacts-changed",
    run: async (app) => {
      const { page } = app
      await area(app, "Contacts")
      await pick(app, "Restore contacts")
      await press(app, button(page.getByRole("dialog", { name: "Restore contacts" }), "Restore"))
      const toast = toasts(page).filter({ hasText: "Restored 7 contacts to yesterday" })
      await toast.waitFor()
      const names = async () => people(page).innerText()
      ensure(/Sam Okafor/.test(await names()) && !/Noor Haddad/.test(await names()), "RESTORE did not bring Sam back and take Noor out")
      await press(app, toast.getByRole("button", { name: "Undo", exact: true }))
      await page.waitForFunction(() => /Noor Haddad/.test(document.body.innerText))
      await app.settle()
      ensure(!/Sam Okafor/.test(await names()), "UNDO did not put the restore back")
      await page.mouse.move(0, 0)
    },
  },
  {
    // Nothing changed since then: the line, and RESTORE disabled with that line as its visible reason. It stays
    // in the tab order and is described by the reason.
    name: "contacts-restore-nothing",
    run: async (app) => {
      await area(app, "Contacts")
      await pick(app, "Restore contacts")
    },
    assert: async (app) => {
      const { page } = app
      const f = page.getByRole("dialog", { name: "Restore contacts" })
      const restore = button(f, "Restore")
      ensure((await restore.getAttribute("aria-disabled")) === "true", "RESTORE is not disabled with nothing to restore")
      await restore.focus()
      ensure(await restore.evaluate((el) => el === document.activeElement), "the disabled RESTORE cannot take focus")
      const ids = ((await restore.getAttribute("aria-describedby")) ?? "").split(/\s+/).filter(Boolean)
      const said = await page.evaluate((list) => list.map((id) => document.getElementById(id)?.textContent ?? "").join(" "), ids)
      ensure(/No contacts changed since then\./.test(said), `RESTORE is described by "${said}", not its reason`)
      await restore.click({ force: true })
      await app.settle()
      ensure(await f.isVisible(), "the disabled RESTORE did something")
      await page.evaluate(() => document.activeElement?.blur())
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
    // Duplicates is a place (brief P4): one column, no detail beside it.
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
      ensure(/^duplicates\s*\/\/\s*01 set$/i.test((await page.locator('[data-slot="page-head-overline"]:visible').first().innerText()).trim()), "the overline does not count the sets")
      ensure((await oneCurrent(await groups(app), "Contacts' groups")).startsWith("Duplicates"), "Duplicates is not the current place")
      if (await switcherLayer(page).count()) await leaveLayer(app)
      await goBack(app)
      ensure((await headTitle(page)) === "People", "Back from Duplicates did not return to everyone")
      await page.goForward()
      await app.settle()
    },
  },
  {
    // Recently deleted is a place (brief P5): the name, the day it went, RESTORE.
    name: "places-recently-deleted",
    sizes: ["phone", "desktop", "medium"],
    scenario: "contacts-deleted",
    sean: { kind: "undrawn", area: "contacts", screen: "recently-deleted" },
    run: async (app) => {
      await area(app, "Contacts")
      await pick(app, "Recently deleted")
    },
    assert: async (app) => {
      const { page } = app
      ensure((await headTitle(page)) === "Recently deleted", "the page head does not name Recently deleted")
      const pane = page.getByRole("region", { name: "Recently deleted" })
      ensure(await pane.isVisible(), "the Recently deleted pane is not showing")
      const rows = pane.getByRole("listitem")
      ensure((await rows.count()) === 2, `Recently deleted lists ${await rows.count()} cards, not 2`)
      ensure(/Deleted Thu 11\.12/.test(await rows.first().innerText()), "a row does not say the day it was deleted")
      ensure(await pane.getByRole("button", { name: "Restore Sam Okafor", exact: true }).isVisible(), "a row has no RESTORE")
      ensure((await oneCurrent(await groups(app), "Contacts' groups")) === "Recently deleted", "Recently deleted is not the current place")
      if (await switcherLayer(page).count()) await leaveLayer(app)
    },
  },
  {
    // RESTORE brings the card back: the toast "Restored {name}", and the card open among everyone.
    name: "places-recently-deleted-restore",
    sizes: ["desktop", "phone", "medium"],
    scenario: "contacts-deleted",
    run: async (app) => {
      const { page } = app
      await area(app, "Contacts")
      await pick(app, "Recently deleted")
      if (await switcherLayer(page).count()) await leaveLayer(app)
      await press(app, page.getByRole("button", { name: "Restore Sam Okafor", exact: true }))
      await toasts(page).filter({ hasText: "Restored Sam Okafor" }).waitFor()
      await toastGone(app)
    },
    assert: async (app) => {
      const { page } = app
      ensure(await page.getByRole("article", { name: "Sam Okafor" }).isVisible(), "the restored card is not open")
      // Beside the list on a desktop; at medium width the card is a pushed screen, and Back shows the list.
      if (app.size === "desktop") ensure(await people(page).getByRole("button", { name: /Sam Okafor/ }).isVisible(), "the restored card is not in the list")
    },
  },
  {
    // Nothing deleted (copy 5.2): RECENTLY DELETED // 00, "Nothing deleted." and how long cards stay.
    name: "places-recently-deleted-empty",
    run: async (app) => {
      await area(app, "Contacts")
      await pick(app, "Recently deleted")
      if (await switcherLayer(app.page).count()) await leaveLayer(app)
    },
    assert: async (app) => {
      const pane = app.page.getByRole("region", { name: "Recently deleted" })
      ensure(await pane.getByText("Nothing deleted.").isVisible(), "the empty state's title is missing")
      ensure(await pane.getByText("Deleted contacts stay here for 30 days.").isVisible(), "the empty state's line is missing")
    },
  },
]
