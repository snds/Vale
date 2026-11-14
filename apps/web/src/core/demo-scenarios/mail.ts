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
  /**
   * Two splits (ADR-0091; brief M2): Studio, for mail from the studio's domain, and Travel, for the ferry's bookings.
   * Neither keeps its mail out of All, so the other lists stay as they were. Made through the client's own call, as the form does.
   */
  splits: ({ client }) => {
    void client.saveSplit(null, { name: "Studio", senders: ["@studio.example"], subject: null, hasAttachments: false, accountId: null, exclusive: false })
    void client.saveSplit(null, { name: "Travel", senders: ["@ferry.example"], subject: null, hasAttachments: false, accountId: null, exclusive: false })
  },
  /**
   * Three first-time senders in the Screener (brief M3). Use with the `?screener` address, which turns the Screener on
   * and brings the first; this adds two more, written to no one, within the last half hour.
   */
  "screener-waiting": ({ state }) => {
    const first = state.messages.find((m) => m.from.email === "hi@growth.example")
    if (!first) return
    const t = nowSecs()
    const more = [
      { from: { name: "Jonas Weber", email: "jonas@kilnworks.example" }, subject: "Wholesale order for spring", body: "We stock a few small studios and would like to talk about a spring order. Is there a price list?", ago: 12 * 60 },
      { from: { name: "Lena Ortiz", email: "lena@printhaus.example" }, subject: "Risograph proofs for the zine", body: "The proofs are ready. Two colours, 24 pages. Can you look before Friday?", ago: 20 * 60 },
    ]
    more.forEach((x, i) => {
      const id = `demo-screener-${i + 1}`
      state.messages.push({
        ...first,
        id,
        threadId: id,
        messageId: `${id}@demo.example`,
        from: x.from,
        subject: x.subject,
        preview: x.body,
        bodyText: x.body,
        date: t - x.ago,
        sortAt: t - x.ago,
        files: {},
      })
    })
  },
}
