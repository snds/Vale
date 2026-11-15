import type { DemoMessage, DemoScenarios, DemoState } from "../demo-scenarios"
import type { Address, Draft, Invite, OutboxItem } from "../types"

const nowSecs = () => Math.floor(Date.now() / 1000)

/** 8:00 tomorrow, when snoozed mail comes back. */
const tomorrowAtEight = () => {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(8, 0, 0, 0)
  return Math.floor(d.getTime() / 1000)
}


const HOUR = 3600

/** A day from today at a clock time, in seconds: the demo's own dates move with the clock. */
const dayAt = (days: number, hour: number, minute = 0) => {
  const d = new Date()
  d.setDate(d.getDate() + days)
  d.setHours(hour, minute, 0, 0)
  return Math.floor(d.getTime() / 1000)
}

/** A message received on an account, in its own conversation unless `threadId` says which, with nothing else carried. */
function received(state: DemoState, id: string, accountId: string, from: Address, subject: string, body: string, ago: number, extra: Partial<DemoMessage> = {}): DemoMessage {
  const date = nowSecs() - ago
  const me = state.accounts.find((a) => a.id === accountId)
  const m: DemoMessage = {
    id, accountId, threadId: id, threadCount: 1, hasAttachments: false, from, subject, preview: body.replace(/\s+/g, " ").slice(0, 160),
    date, sortAt: date, seen: false, flagged: false, archived: false, snoozedUntil: null, mailbox: "INBOX",
    to: me ? [{ name: me.displayName, email: me.address }] : [], cc: [], messageId: `${id}@demo.example`, bodyText: body, bodyHtml: null,
    attachments: [], references: [], invite: null, unsubscribe: null, files: {}, ...extra,
  }
  state.messages.push(m)
  return m
}

const jo = { name: "Jo Tanaka", email: "jo@joinery.example" }

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
   * The token audit as a conversation of five (ADR-0092; brief M4): two more turns after Priya's sheet, the newest
   * unread. The older ones show as rows, the newest and the unread open.
   */
  "thread-5": ({ state }) => {
    const priya = state.messages.filter((m) => m.threadId === "t-audit").sort((a, b) => b.date - a.date)[0]
    const mine = state.messages.find((m) => m.threadId === "t-audit" && m.mailbox === "Sent")
    if (!priya || !mine) return
    const t = nowSecs()
    priya.seen = true
    const turns = [
      { from: mine, body: "Thursday works. Can you add a column for which component reads each alias?", ago: 14 * 60 },
      { from: priya, body: "Added it. Eleven components read the three flat surfaces, most of them in the list pane.\n\nI'll book the room for 10:00.\n\nPriya", ago: 4 * 60 },
    ]
    turns.forEach((x, i) => {
      const id = `demo-audit-${i + 4}`
      state.messages.push({ ...x.from, id, messageId: `${id}@demo.example`, preview: x.body.replace(/\s+/g, " ").slice(0, 160), bodyText: x.body, date: t - x.ago, sortAt: t - x.ago, seen: x.from === mine, flagged: false, files: {} })
    })
  },
  /** AI summaries and replies set up with a model on this computer (ADR-0059), as Settings would: the conversation offers them. */
  "ai-on": ({ client }) => {
    void client.setAiPrefs({ provider: "local", local: { url: "http://localhost:11434/v1", model: "llama3.2" }, anthropicModel: "claude-opus-5-5", compatible: { url: "https://api.openai.com/v1", model: "" } })
  },
  /** With `ai-on`: the model never answers, so the summary and the replies stay loading. */
  "ai-slow": ({ wrap }) => {
    wrap("summarizeThread", () => () => new Promise(() => {}))
    wrap("suggestReplies", () => () => new Promise(() => {}))
  },
  /** With `ai-on`: the model server cannot be reached. */
  "ai-fails": ({ wrap }) => {
    const refuse = () => Promise.reject(new Error("The model server at localhost:11434 didn't answer."))
    wrap("summarizeThread", () => refuse)
    wrap("suggestReplies", () => refuse)
  },
  /** Opening the token audit takes as long as a slow server: the conversation stays loading. */
  "thread-slow": ({ wrap }) => {
    wrap("getThread", (original) => (id) => (id === "t-audit" ? new Promise(() => {}) : original(id)))
  },
  /** The token audit was deleted on another device: its row is still listed, and opening it finds nothing. */
  "thread-gone": ({ wrap }) => {
    wrap("getThread", (original) => (id) => (id === "t-audit" ? Promise.reject(new Error("that conversation is no longer here")) : original(id)))
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
  /**
   * The kitchen-shelves quote waits on Jo (ADR-0093; brief M5): Jo wrote first, you asked for the quote and set a
   * reminder, and it came due an hour ago with no reply. The conversation is back in the Inbox with NO REPLY YET.
   */
  "follow-up-due": ({ state }) => {
    const mine = state.messages.find((m) => m.threadId === "t-quote" && m.mailbox === "Sent")
    if (!mine?.messageId) return
    received(state, "demo-joinery-1", mine.accountId, jo, "Oak shelves for the kitchen", "Thanks for stopping by the workshop. Send me the alcove measurements and I'll work out a price for the oak shelves.\n\nJo", 3 * 24 * HOUR, {
      threadId: "t-quote",
      seen: true,
    })
    mine.subject = "Re: Oak shelves for the kitchen"
    state.followUps.set(mine.messageId, nowSecs() - HOUR)
  },
  /**
   * With `follow-up-due`: Jo's first message also invited you to measure the alcoves on site, and you haven't answered.
   * Two things wait in one conversation: the reminder takes the block, the invitation a row under WAITING ON YOU.
   */
  "invite-waiting": ({ state }) => {
    const first = state.messages.find((m) => m.id === "demo-joinery-1")
    if (!first) return
    const start = dayAt(2, 16, 30)
    Object.assign(first, {
      subject: "Invitation: Measure the alcoves",
      inviteSeed: {
        uid: "alcoves-1@joinery.example", title: "Measure the alcoves", location: "Your kitchen", start, end: start + 45 * 60, organizer: jo,
        attendees: [{ ...jo, status: "accepted" }, { name: "Me", email: "me@personal.example", status: "needs-action" }],
      },
    })
  },
  /**
   * An invitation in each state the request card has no demo mail for (ADR-0093; brief M5). Use with the `?counter`
   * address, which adds Studio sync (yours) and Sam's proposal for it. This adds: Dana canceling the intro call, Ana's
   * yes to Studio sync with a note, Priya keeping Design review's time, and an older copy of Design review's invitation
   * that your calendar has already moved past. REMOVE FROM CALENDAR deletes the intro call from the demo's calendar.
   */
  "invite-states": ({ state, client, wrap }) => {
    const dana = { name: "Dana Wells", email: "dana@wellsdesign.example" }
    const ana = { name: "Ana Duarte", email: "ana@example.com" }
    const priya = { name: "Priya Raman", email: "priya@studio.example" }
    const me = { name: "Me", email: "me@studio.example" }
    const add = (id: string, from: Address, subject: string, body: string, ago: number) => received(state, id, "work", from, subject, body, ago)
    add("demo-invite-cancel", dana, "Canceled: Intro call with Dana Wells", "Dana Wells canceled “Intro call with Dana Wells”. Something came up; I'll book another slot next week.", 0.4 * HOUR)
    add("demo-invite-reply", ana, "Accepted: Studio sync", "Ana Duarte accepted your invitation to “Studio sync”.", 0.6 * HOUR)
    add("demo-invite-kept", priya, "Original time kept: Design review", "Priya Raman kept the original time for “Design review”.", 0.9 * HOUR)
    add("demo-invite-old", priya, "Updated invitation: Design review", "Priya Raman updated “Design review”.", 26 * HOUR)
    // The events these mails are about, by title, from the demo's own calendar.
    const eventId = async (title: string) => {
      const list = await client.listOccurrences(nowSecs() - 30 * 24 * HOUR, nowSecs() + 30 * 24 * HOUR)
      return list.find((o) => o.title === title) ?? null
    }
    const invite = async (id: string): Promise<Invite | null> => {
      const base = { uid: "", location: null, allDay: false, recurring: false, attendees: [], myStatus: null, outdated: false, from: null }
      if (id === "demo-invite-cancel") {
        const o = await eventId("Intro call with Dana Wells")
        return { ...base, method: "cancel", uid: "intro-dana@wellsdesign.example", title: "Intro call with Dana Wells", start: o?.start ?? dayAt(1, 11), end: o?.end ?? dayAt(1, 11, 30), organizer: dana, eventId: o?.eventId ?? null }
      }
      if (id === "demo-invite-reply") {
        const o = await eventId("Studio sync")
        return { ...base, method: "reply", uid: "sync-1@vale", title: "Studio sync", start: o?.start ?? dayAt(3, 11), end: o?.end ?? dayAt(3, 12), organizer: me, eventId: o?.eventId ?? null, from: { ...ana, status: "accepted" }, comment: "See you there. I'll bring the glaze samples." }
      }
      if (id === "demo-invite-kept") {
        const o = await eventId("Design review")
        return { ...base, method: "declinecounter", title: "Design review", start: o?.start ?? null, end: o?.end ?? null, organizer: priya, eventId: o?.eventId ?? null }
      }
      if (id === "demo-invite-old") {
        const o = await eventId("Design review")
        return { ...base, method: "request", title: "Design review", start: o?.start ?? null, end: o?.end ?? null, organizer: priya, eventId: o?.eventId ?? null, myStatus: "accepted", outdated: true }
      }
      return null
    }
    wrap("getThread", (original) => async (threadId) => {
      const list = await original(threadId)
      return Promise.all(list.map(async (m) => ({ ...m, invite: (await invite(m.id)) ?? m.invite })))
    })
    // Applying a cancellation removes the event, as the core does; a guest's answer is already in the demo's copy.
    wrap("applyInviteUpdate", (original) => async (messageId) => {
      const i = await invite(messageId)
      if (!i) return original(messageId)
      if (i.method === "cancel" && i.eventId) await client.deleteEvent(i.eventId)
      return (await invite(messageId)) ?? i
    })
  },
  /**
   * The Outbox with one of each (ADR-0095; brief M7): a reply to Marcus in its undo window, eight seconds left; the
   * estimate to Priya that the server refused this morning; and the studio's invoice scheduled for Monday at 8:00.
   */
  outbox: ({ state }) => {
    const draft = (accountId: string, to: Address[], subject: string, body: string): Draft => ({
      accountId, to, cc: [], subject, body, bodyHtml: null, inReplyTo: null, references: [], attachments: [], followUpAfter: null, requestReceipt: false,
    })
    const priya = { name: "Priya Raman", email: "priya@studio.example" }
    const items: OutboxItem[] = [
      {
        id: "outbox-sending-ferry",
        draft: draft("personal", [{ name: "Marcus Lee", email: "marcus@example.com" }], "Re: Saturday ferry", "Booked the 08:15 crossing for both of us. Meet at the pier at 7:45?"),
        sendAt: nowSecs() + 8,
        state: "queued",
        error: null,
        scheduled: false,
      },
      {
        id: "outbox-failed-estimate",
        draft: draft("work", [priya], "Estimate for the spring catalogue", "Priya, the estimate is attached. The print run is the open question; I priced both sizes."),
        sendAt: nowSecs() - 40 * 60,
        state: "failed",
        error: "The server refused the message: the mailbox me@studio.example is over its sending limit for today.",
      },
      {
        id: "outbox-scheduled-invoice",
        draft: draft("work", [priya, { name: "Sam Okafor", email: "sam@studio.example" }], "November invoice", "Hi both, the November invoice is below. Payment within 14 days, as usual. Thank you!"),
        // Monday at 8:00, the week after the demo's Thursday.
        sendAt: dayAt(4, 8),
        state: "queued",
        error: null,
        scheduled: true,
      },
    ]
    for (const item of items) state.outbox.set(item.id, item)
  },
  /** The mail server refuses the next message sent, once, in its own words (brief M6: the composer's critical notice). */
  "send-refused": ({ wrap }) => {
    let refused = false
    wrap("queueSend", (original) => async (draft, undoSecs, sendAt) => {
      if (refused) return original(draft, undoSecs, sendAt)
      refused = true
      throw new Error("The mail server refused the message: 554 5.7.1 Relay access denied.")
    })
  },
}
