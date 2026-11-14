import { NOT_NOW_KEY } from "@/features/onboarding/first-run"

import type { DemoScenarios } from "../demo-scenarios"

/** Settings (ADR-0081, ADR-0104): states of the settings the sample data doesn't reach by itself. */
export const settings: DemoScenarios = {
  /**
   * The server turns down a change to the mail settings: the control stays
   * where it was, with the server's words under its row (brief T0).
   */
  "settings-save-fails": ({ wrap }) => {
    wrap("setMailPrefs", () => async () => {
      throw new Error("Couldn't save mail settings: the settings file is read-only on this computer.")
    })
  },
  /**
   * The work account signs in with Google, and Google has asked for a new
   * sign-in: its row reads "Gmail // sign-in needed" with SIGN IN (Desktop /
   * 12, Mobile / 16).
   */
  "sign-in-needed": ({ state }) => {
    const work = state.accounts.find((a) => a.id === "work")
    if (!work) return
    Object.assign(work, {
      provider: "google",
      oauth: { issuer: "google", clientId: "built-in" },
      imap: { host: "imap.gmail.com", port: 993, security: "tls" },
      smtp: { host: "smtp.gmail.com", port: 465, security: "tls" },
      lastError: "Google asked for a new sign-in (invalid_grant).",
    })
  },
  /**
   * The demo plays the desktop app for adding an account (brief X8): every
   * provider can be picked, and a password provider's form adds the account
   * as the core would, waiting for its first sync. With `no-account`, that is
   * first run from start to the Inbox.
   */
  "accounts-addable": ({ flags, state, wrap }) => {
    flags.desktopApp = true
    wrap("addAccount", () => async (config) => {
      const account = { ...config, id: `added-${state.accounts.length + 1}`, lastSync: null, lastError: null, davLastSync: null, davError: null }
      state.accounts.push(account)
      return account
    })
  },
  /** The server turns the password down when the account is checked, in its own words (brief X8). */
  "wrong-password": ({ wrap }) => {
    wrap("addAccount", () => async (config) => {
      throw new Error(`${config.imap.host || config.jmap?.sessionUrl || "the server"} refused the sign-in: [AUTHENTICATIONFAILED] Invalid credentials (Failure)`)
    })
  },
  /**
   * This build signs in to Google and Microsoft with its own client, and the
   * browser never comes back: CONTINUE IN BROWSER waits until CANCEL, which
   * ends it as the core does (brief X8).
   */
  "oauth-waits": ({ wrap }) => {
    let stop: (() => void) | null = null
    wrap("getOAuthClient", () => async () => ({ clientId: "built-in", hasSecret: true, builtIn: true }))
    wrap("addOAuthAccount", () => () => new Promise((_, reject) => (stop = () => reject(new Error("sign-in was cancelled")))))
    wrap("cancelOAuthSignIn", () => async () => {
      stop?.()
      stop = null
    })
  },
  /**
   * "Not now" was chosen on this device before (brief X8): with `no-account`,
   * the app opens on Mail's own "Add your first account." instead of first run.
   */
  "first-run-skipped": () => {
    try {
      localStorage.setItem(NOT_NOW_KEY, "1")
    } catch {
      // No storage: first run shows.
    }
  },
  /** The gateway's owner (ADR-0063): Team members and the gateway's sign-out show; Notifications don't. */
  "gateway-owner": ({ flags }) => {
    flags.gatewayOwner = true
  },
}
