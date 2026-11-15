import type { Category, Lane } from "@/core/types"

/**
 * A lane of conversations, the Outbox, or conversations shared with teammates. The Outbox keeps the id
 * "scheduled" it had as the Scheduled lane (ADR-0095: renamed, Q3 and DC9), so a place kept anywhere still opens it.
 */
export type MailTab = Lane | "scheduled" | "team" | "mine"

export const LANES: { id: MailTab; label: string; empty: string }[] = [
  { id: "inbox", label: "Inbox", empty: "You're all caught up." },
  // A shared inbox (ADR-0063): only with a team on the gateway.
  { id: "mine", label: "Assigned to me", empty: "Nothing's assigned to you. Conversations you take, or someone gives you, show up here." },
  { id: "screener", label: "Screener", empty: "No new senders waiting. Mail from people writing for the first time shows up here." },
  { id: "unread", label: "Unread", empty: "Nothing unread." },
  { id: "starred", label: "Starred", empty: "Star messages to keep them close." },
  { id: "snoozed", label: "Snoozed", empty: "Snoozed mail waits here until it's time." },
  { id: "waiting", label: "Waiting", empty: "Mail you're waiting on a reply to. Set a reminder when you send." },
  { id: "scheduled", label: "Outbox", empty: "Nothing waiting to go." },
  { id: "team", label: "Team", empty: "Conversations you share with teammates, or they share with you." },
  { id: "archive", label: "Archive", empty: "Archived mail shows up here." },
]

/** The inbox's filter chips (Spark's smart inbox). */
export const CATEGORIES: { id: Category; label: string; empty: string }[] = [
  { id: "people", label: "People", empty: "No mail from people." },
  { id: "updates", label: "Updates", empty: "No receipts or alerts." },
  { id: "newsletters", label: "Newsletters", empty: "No newsletters." },
]
