import { useQuery } from "@tanstack/react-query"
import { useDeferredValue, useState, type ReactNode } from "react"

import { AdaptiveDialog, Badge, EmptyState, SearchField, SectionHeader, Skeleton } from "@unicron/ui"
import { OccurrenceCard } from "@/features/calendar/occurrence-card"
import { PersonRow } from "@/features/contacts/person-row"
import { MessageRow } from "@/features/mail/message-row"
import { getCoreClient } from "@/core/client"
import type { ContactSummary, MessageSummary, NoteLink, NoteTarget, Occurrence } from "@/core/types"

const DAY = 86_400

interface Found {
  event: Occurrence[]
  contact: ContactSummary[]
  thread: MessageSummary[]
}

/**
 * Events (a month back, three ahead), people, and conversations matching
 * the search, five of each. Empty search: what is nearest in time.
 */
async function search(q: string): Promise<Found> {
  const core = await getCoreClient()
  const lower = q.toLowerCase()
  const now = Math.floor(Date.now() / 1000)
  const [occ, people, inbox, archive] = await Promise.all([
    core.listOccurrences(now - 30 * DAY, now + 90 * DAY),
    core.listContacts(q || null),
    core.listMessages({ lane: "inbox", search: q || null, limit: 8 }),
    q ? core.listMessages({ lane: "archive", search: q, limit: 8 }) : Promise.resolve([]),
  ])
  // One occurrence an event: the one nearest now.
  const events = new Map<string, Occurrence>()
  for (const o of occ) {
    // Birthdays and holidays aren't events a note can link to.
    if (o.contactId || o.eventId.startsWith("special:") || !o.title.toLowerCase().includes(lower)) continue
    const seen = events.get(o.eventId)
    if (!seen || Math.abs(o.start - now) < Math.abs(seen.start - now)) events.set(o.eventId, o)
  }
  // One row a conversation.
  const threads = new Map<string, MessageSummary>()
  for (const m of [...inbox, ...archive]) if (!threads.has(m.threadId)) threads.set(m.threadId, m)
  return {
    event: [...events.values()].sort((a, b) => Math.abs(a.start - now) - Math.abs(b.start - now)).slice(0, 5),
    contact: people.slice(0, 5),
    thread: [...threads.values()].slice(0, 5),
  }
}

/**
 * "Link this note" (brief N2; ADR-0035): in the form layer's place, a
 * dialog (form 640) on a desktop and the whole screen on a phone. A search
 * field, then EVENTS, PEOPLE and CONVERSATIONS as the rows search shows
 * them (ADR-0085's adapters). A row already linked carries the tag LINKED,
 * and pressing it takes the link off. Pressing any other row links it.
 */
export function LinkPicker({
  open,
  onOpenChange,
  linked,
  onLink,
  onUnlink,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  linked: NoteLink[]
  onLink: (link: NoteLink) => void
  onUnlink: (link: NoteLink) => void
}) {
  return (
    <AdaptiveDialog open={open} onOpenChange={onOpenChange} size="form" height="full" overline="Note" title="Link this note" description="To an event, a person or a conversation. The note then shows with it.">
      {open && <Picker linked={linked} onLink={onLink} onUnlink={onUnlink} />}
    </AdaptiveDialog>
  )
}

function Picker({ linked, onLink, onUnlink }: { linked: NoteLink[]; onLink: (link: NoteLink) => void; onUnlink: (link: NoteLink) => void }) {
  const [q, setQ] = useState("")
  const query = useDeferredValue(q.trim())
  const { data, isPending } = useQuery({ queryKey: ["notes", "link-picker", query], queryFn: () => search(query) })
  const linkOf = (t: NoteTarget) => linked.find((l) => l.kind === t.kind && l.target === t.id) ?? null
  const pick = async (t: NoteTarget) => {
    const had = linkOf(t)
    if (had) return onUnlink(had)
    const link = await (await getCoreClient()).noteLinkFor(t)
    if (link) onLink(link)
  }
  const empty = data && !data.event.length && !data.contact.length && !data.thread.length
  return (
    <div className="flex flex-col gap-6">
      <SearchField aria-label="Search events, people and mail" placeholder="Search events, people and mail" value={q} onValueChange={setQ} />
      {isPending ? (
        <div className="flex flex-col gap-5" aria-busy="true" aria-label="Looking">
          <Skeleton variant="row" />
          <Skeleton variant="row" />
        </div>
      ) : empty ? (
        <EmptyState size="sm" overline="Link // 00" title={query ? `Nothing matches “${query}”` : "Nothing to link yet."} />
      ) : (
        data && (
          <>
            <Group title="Events" count={data.event.length}>
              {data.event.map((o) => (
                <Row key={o.eventId} linked={!!linkOf({ kind: "event", id: o.eventId })}>
                  <OccurrenceCard occurrence={o} date onOpen={() => void pick({ kind: "event", id: o.eventId })} />
                </Row>
              ))}
            </Group>
            <Group title="People" count={data.contact.length}>
              {data.contact.map((c) => (
                <Row key={c.id} linked={!!linkOf({ kind: "contact", id: c.id })}>
                  <PersonRow contact={c} onOpen={() => void pick({ kind: "contact", id: c.id })} />
                </Row>
              ))}
            </Group>
            <Group title="Conversations" count={data.thread.length}>
              {data.thread.map((m) => (
                <Row key={m.threadId} linked={!!linkOf({ kind: "thread", id: m.threadId })}>
                  <MessageRow message={m} onOpen={() => void pick({ kind: "thread", id: m.threadId })} />
                </Row>
              ))}
            </Group>
          </>
        )
      )}
    </div>
  )
}

function Group({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  if (!count) return null
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <SectionHeader title={title} count={count} level={3} />
      <div role="list" aria-label={title} className="flex flex-col">
        {children}
      </div>
    </section>
  )
}

/**
 * One result. A linked one carries LINKED in a column of its own at the end,
 * since the adapters have no slot for it yet (a gap asked of their owners).
 */
function Row({ linked, children }: { linked: boolean; children: ReactNode }) {
  if (!linked) return <div role="listitem">{children}</div>
  return (
    <div role="listitem" data-linked="" className="flex items-center gap-3">
      <div className="min-w-0 flex-1">{children}</div>
      <Badge>Linked</Badge>
    </div>
  )
}
