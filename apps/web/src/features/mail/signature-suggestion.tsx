import { useState } from "react"

import { useUi } from "@/app/ui-store"
import { Banner, Button, toast } from "@unicron/ui"
import { getCoreClient } from "@/core/client"
import { useContactSuggestion } from "@/core/queries"
import type { ContactSuggestion } from "@/core/types"

// Dismissing lasts for this session: the same message won't ask again until the app restarts.
const dismissed = new Set<string>()

const list = (words: string[]) =>
  words.length < 2 ? (words[0] ?? "") : words.length === 2 ? words.join(" and ") : `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`

/** "a phone number", "a title", "an email address": what a signature has, as a sentence says it. */
const WORDS: Record<string, string> = { phone: "a phone number", title: "a title", company: "a company", email: "an email address" }

/**
 * Under a message whose signature has contact details you don't (ADR-0093;
 * brief M5): a compact info banner, "{Name}'s signature has a phone number.",
 * with REVIEW, which opens the contact form filled in (P3), and dismiss. It
 * never saves on its own.
 */
export function SignatureSuggestion({ messageId }: { messageId: string }) {
  const { data: s } = useContactSuggestion(messageId)
  const [hidden, setHidden] = useState(() => dismissed.has(messageId))
  if (!s || hidden) return null
  const name = s.card.fullName || s.card.emails[0]?.value || "The sender"
  const what = list(s.adds.filter((a) => a !== "contact").map((a) => WORDS[a] ?? a))
  // A new person with nothing else to add still has their name and address to keep.
  const sentence = what ? `${name}’s signature has ${what}.` : `${name} isn’t in your contacts.`
  return (
    <Banner
      size="compact"
      tone="info"
      icon="user--profile"
      aria-label="Contact details in the signature"
      body={sentence}
      action={
        <Button variant="secondary" size="sm" onClick={() => void review(s).catch((e) => toast.error(e instanceof Error ? e.message : String(e)))}>
          Review
        </Button>
      }
      dismissLabel="Not now"
      onDismiss={() => {
        dismissed.add(messageId)
        setHidden(true)
      }}
    />
  )
}

/** Opens the contact form: a new contact from the card, or yours with the new details filled in. */
async function review(s: ContactSuggestion) {
  const { openContactEditor } = useUi.getState()
  const { card } = s
  if (!s.contactId) {
    openContactEditor({ initial: { fullName: card.fullName, org: card.org, title: card.title, emails: card.emails, phones: card.phones } })
    return
  }
  // The whole card goes in, so saving keeps its note, birthday, and labels.
  const c = await (await getCoreClient()).getContact(s.contactId)
  openContactEditor({
    contactId: c.id,
    initial: { bookId: c.bookId, fullName: c.fullName, org: card.org ?? c.org, title: card.title ?? c.title, emails: card.emails, phones: card.phones, birthday: c.birthday, note: c.note, labels: c.labels },
  })
}
