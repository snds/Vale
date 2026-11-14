import type { DemoScenarios } from "../demo-scenarios"

const nowSecs = () => Math.floor(Date.now() / 1000)

/** 8:00 tomorrow, when snoozed mail comes back. */
const tomorrowAtEight = () => {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(8, 0, 0, 0)
  return Math.floor(d.getTime() / 1000)
}

/** Mail (ADR-0081, ADR-0090): the inbox and its lanes, such as swipe slots or an inbox worked to zero. Names and words are the demo's own. */
export const mail: DemoScenarios = {
  /**
   * All four swipe slots in use, as States / 01 draws them: READ leading, and STAR, SNOOZE and ARCHIVE
   * trailing. Set through the client's own setter, as Settings would; the defaults stay where the core keeps them (Q4).
   */
  "swipes-drawn": ({ client }) => {
    void client.setSwipeActions({ right: "read", rightLong: "star", left: "archive", leftLong: "snooze-tomorrow" })
  },
  /** The Inbox worked to zero: everything archived but two conversations, snoozed until 8:00 tomorrow. */
  "inbox-zero": ({ state }) => {
    const until = tomorrowAtEight()
    const received = state.messages.filter((m) => m.mailbox !== "Sent" && !m.archived)
    const keep = new Set(received.slice(0, 2).map((m) => m.threadId))
    for (const m of received) {
      if (keep.has(m.threadId)) m.snoozedUntil = until
      else m.archived = true
    }
    // Reminders that came due would bring sent mail back to the inbox.
    state.followUps.clear()
  },
  /** A reminder came due an hour ago: your own sent mail is back in the Inbox with NO REPLY YET. */
  "no-reply-yet": ({ state }) => {
    for (const id of state.followUps.keys()) state.followUps.set(id, nowSecs() - 3600)
  },
  /**
   * The Work account signs in with its provider, and the provider refused it forty minutes ago (Mobile / 07):
   * the banner's action is SIGN IN. The demo can't sign in, so pressing it shows the demo's refusal.
   */
  "sync-error-sign-in": ({ state }) => {
    const work = state.accounts.find((a) => a.id === "work")
    if (work)
      Object.assign(work, {
        oauth: { issuer: "https://accounts.google.com", clientId: "demo" },
        lastSync: nowSecs() - 40 * 60,
        lastError: "Google refused the sign-in: the access was revoked.",
      })
  },
}
