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
  /** The gateway's owner (ADR-0063): Team members and the gateway's sign-out show; Notifications don't. */
  "gateway-owner": ({ flags }) => {
    flags.gatewayOwner = true
  },
}
