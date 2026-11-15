import { NOT_NOW_KEY } from "@/features/onboarding/first-run"

import type { DemoScenarios } from "../demo-scenarios"

/** Settings (ADR-0081, ADR-0104): states of the settings the sample data doesn't reach by itself. */
export const settings: DemoScenarios = {
  /**
   * The server turns down a change to the mail settings: the control stays
   * where it was, with the server's words under its row (brief T0).
   */
  "settings-save-fails": ({ wrap }) => {
    const refuse = (what: string) => async () => {
      throw new Error(`Couldn't save ${what}: the settings file is read-only on this computer.`)
    }
    wrap("setMailPrefs", () => refuse("mail settings"))
    wrap("setScreener", () => refuse("the Screener"))
    wrap("setMeetingPrefs", () => refuse("calendar settings"))
    wrap("setMenuBarPrefs", () => refuse("calendar settings"))
    wrap("setPushSettings", () => refuse("notification settings"))
  },
  /**
   * The settings outlive a reload, as the core keeps them on disk (brief
   * T2, T4, T8): what Mail, the Screener, Calendar and Notifications saved
   * is kept in this tab and put back when the demo starts again.
   */
  "settings-kept": ({ client, wrap }) => {
    const KEY = "vale.demo.settings-kept"
    const read = (): Record<string, unknown> => {
      try {
        return JSON.parse(sessionStorage.getItem(KEY) ?? "{}") as Record<string, unknown>
      } catch {
        return {}
      }
    }
    const keep = (name: string, value: unknown) => {
      try {
        sessionStorage.setItem(KEY, JSON.stringify({ ...read(), [name]: value }))
      } catch {
        // No storage: nothing outlives the reload.
      }
    }
    const kept = read()
    // Put back before the app's first read; each setter changes the demo's value at once.
    if (kept.mail) void client.setMailPrefs(kept.mail as Parameters<typeof client.setMailPrefs>[0])
    if (typeof kept.screener === "boolean") void client.setScreener(kept.screener)
    if (kept.meeting) void client.setMeetingPrefs(kept.meeting as Parameters<typeof client.setMeetingPrefs>[0])
    if (kept.menuBar) void client.setMenuBarPrefs(kept.menuBar as Parameters<typeof client.setMenuBarPrefs>[0])
    if (kept.push) void client.setPushSettings(kept.push as Parameters<typeof client.setPushSettings>[0])
    const keeping = <A, R>(name: string, original: (a: A) => Promise<R>) => async (a: A) => {
      const r = await original(a)
      keep(name, a)
      return r
    }
    wrap("setMailPrefs", (o) => keeping("mail", o))
    wrap("setScreener", (o) => keeping("screener", o))
    wrap("setMeetingPrefs", (o) => keeping("meeting", o))
    wrap("setMenuBarPrefs", (o) => keeping("menuBar", o))
    // The relay's token is kept by the demo once saved; a reload asks for it no more.
    wrap("setPushSettings", (o) => async (input) => {
      const r = await o(input)
      keep("push", { ...input, relayToken: input.relayToken ?? (read().push as { relayToken?: string } | undefined)?.relayToken ?? null })
      return r
    })
  },
  /**
   * Senders you decided about (brief T2): one screened out, one blocked, one
   * always in People, and one screened out and moved to Updates, so its
   * row's second decision is in its menu.
   */
  "senders-decided": ({ client }) => {
    void client.decideSender("hi@growth.example", "screened_out")
    void client.decideSender("noreply@service.example", "blocked")
    void client.setSenderCategory("news@clayclub.example", "people")
    void client.decideSender("digest@dsweekly.example", "screened_out").then(() => client.setSenderCategory("digest@dsweekly.example", "updates"))
  },
  /**
   * This phone gets new mail through a relay (brief T8): connected, with
   * its UnifiedPush address, each account on the relay.
   */
  "relay-connected": ({ client }) => {
    void client.setPushSettings({ mode: "relay", relayUrl: "https://push.ash-home.example", relayToken: "relay-token-from-the-demo-0042", unifiedPushEndpoint: "https://ntfy.sh/vale-ash-7f3k" })
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
