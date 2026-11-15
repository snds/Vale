// Outside the app, in the focus frame: first run (brief X8; ADR-0107) and the gateway's door, to sign
// in or join the team (brief X9; ADR-0112). The demo plays a gateway's door through the scenarios
// gateway-signin, gateway-join and invitation-ended (apps/web/src/core/demo-scenarios/settings.ts).
import { button, ensure, press } from "./helpers.mjs"

/** The focus frame's column, while first run shows. */
const firstRun = (page) => page.getByRole("main", { name: "First run" })
/** Step 1's six providers, in order. */
const PROVIDERS = ["Gmail", "Outlook / Microsoft 365", "iCloud", "Fastmail", "Other (IMAP)", "Other (JMAP)"]
const provider = (page, name) => firstRun(page).getByRole("list", { name: "Providers" }).getByRole("button", { name, exact: true })
/** The folio at the end of the lockup's row. */
const folio = (page) => firstRun(page).locator('[data-slot="app-frame-focus-head"] p')

/** Step 2 for one provider, from step 1. */
const step2 = async (app, name) => {
  await press(app, provider(app.page, name))
  ensure((await folio(app.page).innerText()).trim().toLowerCase() === "step 02 // 02", "step 2's folio does not read STEP 02 // 02")
}

/** A password provider's form, filled as a person would, with the scene's own address. */
const fillPassword = async (page) => {
  await page.getByRole("textbox", { name: "Email address" }).fill("robin.ash@icloud.com")
  await page.getByRole("textbox", { name: "Name on sent mail" }).fill("Robin Ash")
  await page.getByLabel("App-specific password").fill("abcd-efgh-ijkl-mnop")
}

/** Nothing in the picture has focus or a hover by chance. */
const still = async (app) => {
  await app.page.mouse.move(0, 0)
  await app.page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
  await app.settle()
}

/** The gateway's door, by what it asks: "Sign in" or "Join the team". */
const door = (page, name) => page.getByRole("main", { name })
/** The door's one primary (decisions §4). */
const primaries = (page, name) => door(page, name).locator('[data-slot="button"][data-variant="default"]')
/** A field's error, as the Text Field shows it: the field is invalid and the line under it says what. */
const fieldError = async (page, label) => {
  const field = page.getByLabel(label, { exact: true })
  if ((await field.getAttribute("aria-invalid")) !== "true") return null
  const ids = ((await field.getAttribute("aria-describedby")) ?? "").split(/\s+/).filter(Boolean)
  const lines = await Promise.all(ids.map((id) => page.locator(`[id="${id}"]`).innerText()))
  return lines.join(" ").trim()
}
/** Types into the password field and presses the door's primary, as a person would. */
const tryPassword = async (app, label, password, primary) => {
  await app.page.getByLabel(label, { exact: true }).fill(password)
  await press(app, button(app.page, primary))
}

/** The door's primary, when the right password opens the app: the page loads again, then settles. */
const getIn = async (app, label, password, primary) => {
  const { page } = app
  await page.getByLabel(label, { exact: true }).fill(password)
  await Promise.all([page.waitForEvent("load"), button(page, primary).click()])
  await page.waitForFunction(() => !!document.getElementById("root")?.innerText.trim())
  await app.settle()
}

/** Mail's state for someone with no account: "Add your first account." and ADD ACCOUNT. */
const mailNoAccount = (page) => page.getByRole("button", { name: "Add account", exact: true })

export const scenes = [
  {
    // Step 1: WELCOME, the storage sentence, six providers, what works without an account, NOT NOW.
    // The web preview can't add a password account, so those four are off, with their reason.
    name: "onboarding-welcome",
    scenario: "no-account",
    sizes: ["desktop", "phone", "medium"],
    sean: { kind: "undrawn", area: "onboarding", screen: "welcome" },
    run: still,
    assert: async ({ page }) => {
      ensure(await firstRun(page).isVisible(), "first run does not show for someone with no account")
      ensure((await folio(page).innerText()).trim().toLowerCase() === "step 01 // 02", "step 1's folio does not read STEP 01 // 02")
      ensure(await page.getByRole("heading", { name: "Add your first account.", level: 1 }).isVisible(), "step 1's title is not Add your first account.")
      const names = await firstRun(page).getByRole("list", { name: "Providers" }).getByRole("button").evaluateAll((els) => els.map((el) => el.querySelector('[data-slot="nav-item-label"]')?.textContent.trim()))
      ensure(JSON.stringify(names) === JSON.stringify(PROVIDERS), `step 1 lists ${names.join(", ")}`)
      ensure(await firstRun(page).getByText("Calendars and notes on this device work without an account.").isVisible(), "step 1 does not say what works without an account")
      ensure(await button(page, "Not now").isVisible(), "step 1 has no NOT NOW")
      // No primary on this step: each row is the action (decisions §4).
      ensure(!(await firstRun(page).locator('[data-slot="button"][data-variant="default"]').count()), "step 1 has a primary button")
    },
  },
  {
    // A provider this build cannot add is off, says why in a visible line tied to it, and stays in
    // the tab order (#37); pressing it goes nowhere.
    name: "onboarding-disabled-provider",
    scenario: "no-account",
    sizes: ["desktop"],
    run: async (app) => {
      const { page } = app
      const icloud = provider(page, "iCloud")
      ensure((await icloud.getAttribute("aria-disabled")) === "true", "iCloud is not off in the web preview")
      const reason = await icloud.getAttribute("aria-describedby")
      ensure(reason && (await page.locator(`[id="${reason}"]`).isVisible()), "the off provider's reason is not a visible line tied to it")
      ensure((await page.locator(`[id="${reason}"]`).innerText()).trim() === "Needs the desktop app", "the off provider's reason is not Needs the desktop app")
      // Tab from Outlook reaches iCloud.
      await provider(page, "Outlook / Microsoft 365").focus()
      await page.keyboard.press("Tab")
      ensure(await icloud.evaluate((el) => el === document.activeElement), "Tab skips the off provider")
      await page.keyboard.press("Enter")
      await app.settle()
      ensure((await folio(page).innerText()).trim().toLowerCase() === "step 01 // 02", "the off provider opened step 2")
    },
  },
  {
    // NOT NOW enters the app, and this device remembers it: after a reload Mail's own empty state
    // shows, not first run. Its ADD ACCOUNT opens step 1 again, and NOT NOW there goes back.
    name: "onboarding-not-now",
    scenario: "no-account",
    run: async (app) => {
      const { page } = app
      await press(app, button(page, "Not now"))
      ensure(!(await firstRun(page).count()), "NOT NOW did not leave first run")
      ensure(await mailNoAccount(page).isVisible(), "NOT NOW did not open Mail")
      await page.reload()
      await page.waitForFunction(() => !!document.getElementById("root")?.innerText.trim())
      await app.settle()
      ensure(!(await firstRun(page).count()), "after a reload first run showed again")
      await press(app, mailNoAccount(page))
      ensure(await firstRun(page).isVisible(), "Mail's ADD ACCOUNT did not open step 1")
      ensure((await folio(page).innerText()).trim().toLowerCase() === "step 01 // 02", "Mail's ADD ACCOUNT did not open first run at step 1")
      await press(app, button(page, "Not now"))
      ensure(await mailNoAccount(page).isVisible(), "NOT NOW from Mail's ADD ACCOUNT did not return to Mail")
      await still(app)
    },
  },
  {
    // Step 2 for a password provider: EMAIL ADDRESS, NAME ON SENT MAIL, the app-specific password
    // with its help and link, the note on calendars, ADD ACCOUNT and "Checked before saving."
    name: "onboarding-password",
    scenario: ["no-account", "accounts-addable"],
    sizes: ["desktop", "phone", "medium"],
    sean: { kind: "undrawn", area: "onboarding", screen: "add-account" },
    run: async (app) => {
      await step2(app, "iCloud")
      await fillPassword(app.page)
      await still(app)
    },
    assert: async ({ page }) => {
      ensure(await page.getByRole("heading", { name: "Add iCloud", level: 1 }).isVisible(), "step 2's title is not Add iCloud")
      ensure(await page.getByRole("link", { name: "How", exact: true }).isVisible(), "the password's help has no link")
      ensure(await button(page, "Add account").isVisible(), "step 2 has no ADD ACCOUNT")
      ensure(await page.getByText("Checked before saving.").isVisible(), "ADD ACCOUNT has no Checked before saving.")
    },
  },
  {
    // Other (IMAP): its servers under INCOMING (IMAP) and OUTGOING (SMTP), each SERVER, PORT and
    // SECURITY, then the optional calendar and contacts servers.
    name: "onboarding-imap",
    scenario: ["no-account", "accounts-addable"],
    sizes: ["desktop", "phone"],
    run: async (app) => {
      await step2(app, "Other (IMAP)")
      await still(app)
    },
    assert: async ({ page }) => {
      for (const group of ["Incoming (IMAP)", "Outgoing (SMTP)"]) {
        const box = page.getByRole("region", { name: group, exact: true })
        for (const field of ["Server", "Port", "Security"]) ensure(await box.getByLabel(field, { exact: true }).count(), `${group} has no ${field}`)
      }
      ensure(await page.getByLabel("Calendar server (CalDAV)").count(), "Other (IMAP) does not ask for a calendar server")
    },
  },
  {
    // The server turns the password down: the form stays as typed, with the server's words in a
    // compact critical Banner above ADD ACCOUNT.
    name: "onboarding-wrong-password",
    scenario: ["no-account", "accounts-addable", "wrong-password"],
    run: async (app) => {
      const { page } = app
      await step2(app, "iCloud")
      await fillPassword(page)
      await press(app, button(page, "Add account"))
      await still(app)
    },
    assert: async ({ page }) => {
      const alert = firstRun(page).locator('[data-slot="banner"][role="alert"]')
      ensure(await alert.isVisible(), "a refused password shows no critical Banner")
      ensure(/AUTHENTICATIONFAILED/.test(await alert.innerText()), "the Banner does not hold the server's words")
      ensure((await page.getByRole("textbox", { name: "Email address" }).inputValue()) === "robin.ash@icloud.com", "the form lost what was typed")
    },
  },
  {
    // Done: no third screen. The Inbox opens, the status says FIRST SYNC // the account, and the
    // toast names the address.
    name: "onboarding-done",
    scenario: ["no-account", "accounts-addable"],
    run: async (app) => {
      const { page } = app
      await step2(app, "iCloud")
      await fillPassword(page)
      await press(app, button(page, "Add account"))
      ensure(!(await firstRun(page).count()), "adding the account did not leave first run")
      const toast = page.locator("[data-sonner-toast]").first()
      ensure(/Added robin\.ash@icloud\.com/.test(await toast.innerText()), "the toast does not read Added robin.ash@icloud.com")
      await page.mouse.move(0, 0)
      // On a phone the toast holds the strip's slot for its time (5.1c C6); the strip comes back after it.
      if (app.phone) await toast.waitFor({ state: "detached", timeout: 15_000 })
      await app.settle()
    },
    assert: async ({ page }) => {
      ensure(await page.getByText(/First sync \/\/ Robin Ash/i).first().isVisible(), "the status does not say FIRST SYNC // Robin Ash")
    },
  },
  {
    // Gmail with the build's own client: what Google will ask for, the optional address, the info
    // Banner about Google's warning page. CONTINUE IN BROWSER keeps its word while it waits, with
    // "Finish signing in in your browser" and CANCEL; CANCEL ends it quietly, back on step 2.
    name: "onboarding-oauth-wait",
    scenario: ["no-account", "oauth-waits"],
    loading: true,
    sizes: ["desktop", "phone", "medium"],
    sean: { kind: "undrawn", area: "onboarding", screen: "browser-wait" },
    run: async (app) => {
      const { page } = app
      await step2(app, "Gmail")
      ensure(await page.getByRole("heading", { name: "Add Gmail", level: 1 }).isVisible(), "step 2's title is not Add Gmail")
      ensure(await firstRun(page).locator('[data-slot="banner"]').filter({ hasText: "warning page" }).isVisible(), "Gmail's step has no Banner about Google's warning page")
      ensure(await button(page, "Use your own client").isVisible(), "Gmail's step has no USE YOUR OWN CLIENT")
      const go = page.getByRole("button", { name: /Continue in browser/ })
      await press(app, go)
      ensure((await go.innerText()).trim().toLowerCase() === "continue in browser", "the waiting button lost its word")
      ensure((await go.getAttribute("aria-busy")) === "true", "the waiting button is not busy")
      ensure(await page.getByText("Finish signing in in your browser").isVisible(), "the wait does not say Finish signing in in your browser")
      await press(app, button(page, "Cancel"))
      ensure((await go.getAttribute("aria-busy")) !== "true", "CANCEL did not end the wait")
      ensure(!(await firstRun(page).locator('[data-slot="banner"][role="alert"]').count()), "CANCEL raised an error")
      await press(app, go)
      await page.mouse.move(0, 0)
      await app.settle()
    },
  },
  {
    // A build with no Google sign-in set up opens on the own-client form: CLIENT ID and CLIENT
    // SECRET with Google's instructions, SAVE CLIENT. Saved, the sign-in shows with CHANGE CLIENT,
    // which opens the form again with REMOVE CLIENT.
    name: "onboarding-own-client",
    scenario: "no-account",
    sizes: ["desktop", "phone"],
    run: async (app) => {
      const { page } = app
      await step2(app, "Gmail")
      ensure(await page.getByText(/This build has no Google sign-in set up/).isVisible(), "the own-client form does not say this build has no sign-in")
      await page.getByRole("textbox", { name: "Client ID" }).fill("123456789012-desktop.apps.googleusercontent.com")
      await press(app, button(page, "Save client"))
      ensure(await button(page, "Change client").isVisible(), "a saved client does not offer CHANGE CLIENT")
      await press(app, button(page, "Change client"))
      ensure(await button(page, "Remove client").isVisible(), "a saved client's form has no REMOVE CLIENT")
      await press(app, button(page, "Remove client"))
      ensure(await page.getByText(/This build has no Google sign-in set up/).isVisible(), "REMOVE CLIENT did not return to the form")
      await still(app)
    },
    assert: async ({ page }) => {
      ensure(await page.getByRole("link", { name: "Step-by-step guide" }).isVisible(), "the client form has no guide link")
      ensure(await page.getByLabel("Client secret").count(), "Google's client form has no CLIENT SECRET")
    },
  },
  {
    // The gateway's door (brief X9): EMAIL with its helper, GATEWAY PASSWORD with the owner's helper,
    // one primary SIGN IN, in the focus frame. Typing an email turns the field into PASSWORD.
    name: "outside-signin",
    scenario: "gateway-signin",
    sizes: ["desktop", "phone", "medium"],
    sean: { kind: "undrawn", area: "outside", screen: "gateway-sign-in" },
    run: async (app) => {
      const { page } = app
      ensure(await door(page, "Sign in").isVisible(), "the gateway's door does not show")
      await page.getByLabel("Email", { exact: true }).fill("noor@studio.example")
      ensure(await page.getByLabel("Password", { exact: true }).isVisible(), "an email does not turn the field into PASSWORD")
      ensure(!(await page.getByText("The GATEWAY_PASSWORD it was started with.").count()), "a member is shown the owner's helper")
      await page.getByLabel("Email", { exact: true }).fill("")
      await still(app)
    },
    assert: async ({ page }) => {
      ensure(await page.getByLabel("Gateway password", { exact: true }).isVisible(), "the owner's field is not GATEWAY PASSWORD")
      ensure(await page.getByText("Only if you were invited to the team.").isVisible(), "EMAIL has no helper")
      ensure(await page.getByText("The GATEWAY_PASSWORD it was started with.").isVisible(), "the owner's helper is missing")
      ensure((await primaries(page, "Sign in").count()) === 1 && (await button(page, "Sign in").isVisible()), "the door's one primary is not SIGN IN")
      ensure(!(await page.getByRole("navigation", { name: "Vale" }).count()) && !(await page.getByRole("tablist", { name: "Sections" }).count()), "the app shows behind the door")
    },
  },
  {
    // A wrong password is the field's error, in the shared words (decisions §4): a member's first,
    // then the owner's, which the picture shows.
    name: "outside-signin-wrong",
    scenario: "gateway-signin",
    sizes: ["desktop", "phone"],
    run: async (app) => {
      const { page } = app
      await page.getByLabel("Email", { exact: true }).fill("noor@studio.example")
      await tryPassword(app, "Password", "not-my-password", "Sign in")
      const member = await fieldError(page, "Password")
      ensure(member === "That isn't your password.", `a member's wrong password says ${JSON.stringify(member)}`)
      await page.getByLabel("Email", { exact: true }).fill("")
      await tryPassword(app, "Gateway password", "letmein", "Sign in")
      await still(app)
    },
    assert: async ({ page }) => {
      const owner = await fieldError(page, "Gateway password")
      ensure(owner === "That isn't the gateway password.", `the owner's wrong password says ${JSON.stringify(owner)}`)
      ensure(await door(page, "Sign in").isVisible(), "a wrong password left the door")
    },
  },
  {
    // The right password goes in: the door gives way to the app (the demo's gateway takes its own).
    name: "outside-signin-done",
    scenario: "gateway-signin",
    sizes: ["desktop"],
    run: async (app) => {
      const { page } = app
      await getIn(app, "Gateway password", "demo-gateway-password", "Sign in")
      ensure(!(await door(page, "Sign in").count()), "the door stays after the right password")
    },
    assert: async ({ page }) => {
      ensure(await page.getByRole("navigation", { name: "Vale" }).isVisible(), "signing in did not open the app")
    },
  },
  {
    // Joining the team at /join#<code> (brief X9): CHOOSE A PASSWORD, at least 12 characters, and JOIN.
    name: "outside-join",
    scenario: "gateway-join",
    path: "/join#demo-invitation-1-k3v9x2",
    sizes: ["desktop", "phone", "medium"],
    sean: { kind: "undrawn", area: "outside", screen: "join" },
    run: still,
    assert: async ({ page }) => {
      ensure(await door(page, "Join the team").isVisible(), "the invitation does not open the door to join")
      ensure(await page.getByLabel("Choose a password", { exact: true }).isVisible(), "the door has no CHOOSE A PASSWORD")
      ensure(await page.getByText("At least 12 characters.").isVisible(), "CHOOSE A PASSWORD has no helper")
      ensure((await primaries(page, "Join the team").count()) === 1 && (await button(page, "Join").isVisible()), "the door's one primary is not JOIN")
    },
  },
  {
    // A short password is the field's error; one of 12 or more joins, and the app opens off the invitation's address.
    name: "outside-join-short",
    scenario: "gateway-join",
    path: "/join#demo-invitation-1-k3v9x2",
    sizes: ["desktop"],
    run: async (app) => {
      const { page } = app
      await tryPassword(app, "Choose a password", "short", "Join")
      const said = await fieldError(page, "Choose a password")
      ensure(said === "At least 12 characters.", `a short password says ${JSON.stringify(said)}`)
      await getIn(app, "Choose a password", "a long enough passphrase", "Join")
      ensure(new URL(page.url()).pathname === "/", "joining did not leave the invitation's address")
    },
    assert: async ({ page }) => {
      ensure(await page.getByRole("navigation", { name: "Vale" }).isVisible(), "joining did not open the app")
    },
  },
  {
    // A used or expired invitation (brief X9): the critical empty state, with nothing to press.
    name: "outside-invitation-ended",
    scenario: "invitation-ended",
    path: "/join#demo-invitation-used-9q2w7e",
    sizes: ["desktop", "phone"],
    sean: { kind: "undrawn", area: "outside", screen: "invitation-ended" },
    run: async (app) => {
      await tryPassword(app, "Choose a password", "a long enough passphrase", "Join")
      await still(app)
    },
    assert: async ({ page }) => {
      ensure(await page.getByText("This invitation has ended.").isVisible(), "a spent invitation does not say it has ended")
      ensure(await page.getByText("Ask for a new link.").isVisible(), "a spent invitation does not say what to do")
      ensure(!(await page.getByLabel("Choose a password", { exact: true }).count()), "a spent invitation still asks for a password")
    },
  },
]
