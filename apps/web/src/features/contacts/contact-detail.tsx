import { cloneElement, useEffect, useMemo, useRef, type ReactElement, type ReactNode, type RefObject } from "react"

import { usePushedChrome } from "@/app/screen"
import { useUi } from "@/app/ui-store"
import {
  AdaptiveMenu,
  AdaptiveMenuItem,
  AppFrameInset,
  Badge,
  Banner,
  Button,
  EmptyState,
  FieldRow,
  FieldRowAction,
  FieldRowValue,
  FloatButton,
  Icon,
  InitialTile,
  SectionHeader,
  Skeleton,
  toast,
  useAppFrame,
  type IconName,
} from "@unicron/ui"
import { getCoreClient } from "@/core/client"
import { useAccounts, useCollections, useContact, useContactActivity, useContactCopies, useDuplicates, usePimAction } from "@/core/queries"
import type { Account, Collection, ContactActivity, ContactDetail, ContactField, MessageSummary, Occurrence } from "@/core/types"
import { useCopy } from "@/lib/copy"
import { calendarSwatches, eventSwatch } from "@/lib/swatches"

import { OccurrenceCard } from "../calendar/occurrence-card"
import { MessageRow } from "../mail/message-row"
import { LinkedNotes } from "../notes/linked-notes"
import { useQuickContext } from "../notes/use-quick-context"
import { birthdayLabel, contactInitials, fieldLabel } from "./contact-format"
import { useShareContact } from "./share"

/** A number as `tel:` and `sms:` want it: digits and a leading +. */
const dial = (phone: string) => phone.replace(/[^\d+]/g, "")

const ACTION = "h-auto min-w-18 flex-col gap-1 px-3 py-2 text-xs"

/**
 * A tall icon-over-word button. Only the sender panel beside a message uses
 * it now (mail-search's `sender-profile.tsx`); the person uses Field Row
 * actions and one row of buttons (ADR-0102).
 */
export function Action({ icon, label, href, onClick, disabled }: { icon: IconName; label: string; href?: string; onClick?: () => void; disabled?: boolean }) {
  const cls = ACTION
  if (href && !disabled) {
    return (
      <Button variant="secondary" className={cls} render={<a href={href} />}>
        <Icon name={icon} className="size-5" />
        {label}
      </Button>
    )
  }
  return (
    <Button variant="secondary" className={cls} onClick={onClick} disabled={disabled}>
      <Icon name={icon} className="size-5" />
      {label}
    </Button>
  )
}

/** A book's name for SAVED IN and ALSO IN: the account's, with the book's own when it says more; "On this device" when it has no account. */
function bookName(books: Collection[], accounts: Account[], id: string) {
  const b = books.find((x) => x.id === id)
  const a = accounts.find((x) => x.id === b?.accountId)
  if (!a) return "On this device"
  return b && b.name !== a.displayName && b.name !== "Contacts" ? `${a.displayName} // ${b.name}` : a.displayName
}

/** One email: its own label (WORK, HOME) or EMAIL, and COPY, which says "Copied" for 2 s and raises no toast (decisions §1). */
function EmailRow({ field, size }: { field: ContactField; size: "default" | "stacked" }) {
  const { copied, copy } = useCopy({ what: "email address", label: "Email" })
  return (
    <FieldRow
      size={size}
      label={fieldLabel(field.label, "Email")}
      action={
        <>
          {/* Said once it has copied; before the action, which stays the row's last control, flush with its edge. */}
          <span role="status" className="sr-only">
            {copied ? `Copied ${field.value}` : ""}
          </span>
          <FieldRowAction onClick={() => void copy(field.value)}>{copied ? "Copied" : "Copy"}</FieldRowAction>
        </>
      }
    >
      {field.value}
    </FieldRow>
  )
}

/** WRITE: a new message to the card's address, or a menu of them when it has more than one. `trigger` draws it. */
function WriteControl({ c, trigger }: { c: ContactDetail; trigger: ReactElement<Record<string, unknown>> }) {
  const openComposer = useUi((s) => s.openComposer)
  const write = (email: string) => openComposer({ to: [{ name: c.fullName, email }] })
  if (c.emails.length < 2) return cloneElement(trigger, { onClick: () => write(c.emails[0]!.value) })
  return (
    <AdaptiveMenu title="Write to" trigger={trigger} align="start">
      {c.emails.map((e) => (
        <AdaptiveMenuItem key={e.value} icon="email" onSelect={() => write(e.value)}>
          {e.value}
        </AdaptiveMenuItem>
      ))}
    </AdaptiveMenu>
  )
}

/** EDIT, DELETE, QUICK NOTE: what the person's buttons and a phone's top bar run. */
function usePersonActions(c: ContactDetail | undefined, onDeleted: () => void) {
  const jumpTo = useUi((s) => s.jumpTo)
  const openEditor = useUi((s) => s.openContactEditor)
  const openQuickNote = useUi((s) => s.openQuickNote)
  const remove = usePimAction((core, cid: string) => core.deleteContact(cid))
  const edit = () => {
    if (!c) return
    openEditor({ contactId: c.id, initial: { bookId: c.bookId, fullName: c.fullName, org: c.org, title: c.title, emails: c.emails, phones: c.phones, birthday: c.birthday, note: c.note, labels: c.labels, photo: c.photo } })
  }
  // The code can undo a delete (Recently deleted), so it does not ask (decisions §10).
  const del = async () => {
    if (!c) return
    // Close the card first: the delete refreshes contact queries, and an open card would ask for itself again.
    onDeleted()
    try {
      await remove.mutateAsync(c.id)
      // Undo restores it from Recently deleted (its newest copy there).
      const core = await getCoreClient()
      const kept = (await core.deletedContacts()).find((d) => d.fullName === c.fullName)
      toast(`Deleted ${c.fullName}`, {
        action: kept ? { label: "Undo", onClick: () => void core.restoreContact(kept.id).then((back) => jumpTo({ kind: "contact", id: back.id })).catch((e) => toast.error(String(e))) } : undefined,
      })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
      // It's still there: show it again.
      jumpTo({ kind: "contact", id: c.id })
    }
  }
  const quickNote = () => c && openQuickNote({ kind: "contact", id: c.id, label: c.fullName })
  return { edit, del, quickNote, deleting: remove.isPending }
}

/** Loading (brief 4.0): the tile and the name's line. */
function PersonSkeleton() {
  return (
    <div className="flex items-center gap-4" aria-busy data-slot="contact-loading">
      <div className="grid size-16 shrink-0">
        <Skeleton />
      </div>
      <div className="grid h-9 w-1/2">
        <Skeleton />
      </div>
    </div>
  )
}

/**
 * One person (ADR-0102; brief P2, Desktop / 09, Mobile / 12): the head, a
 * Field Row for each way to reach them, where the card is kept, a row of
 * buttons, then what you have going with them. In the detail column beside
 * the list, or pushed on a phone and at medium width. Search opens it too
 * (a7), so its props stay as they are.
 */
export function ContactDetailPane({ id, onDeleted }: { id: string; onDeleted: () => void }) {
  const { data: c, error, isPending } = useContact(id)
  // Quick Note links to the person that's open (ADR-0037).
  useQuickContext(c ? { kind: "contact", id, label: c.fullName } : null)
  let content: ReactNode
  if (isPending) content = <PersonSkeleton />
  else if (error || !c) content = <EmptyState size="sm" overline="Contacts" title="That contact is gone." body={error instanceof Error ? error.message : undefined} />
  else content = <Person c={c} onDeleted={onDeleted} />
  return <AppFrameInset>{content}</AppFrameInset>
}

function Person({ c, onDeleted }: { c: ContactDetail; onDeleted: () => void }) {
  const frame = useAppFrame()
  const size = frame.phone ? "stacked" : "default"
  const { data: books = [] } = useCollections("contacts")
  const { data: accounts = [] } = useAccounts()
  const jumpTo = useUi((s) => s.jumpTo)
  const setPlace = useUi((s) => s.setContactsPlace)
  // Cross-vertical context: conversations and meetings with this person.
  const { data: activity } = useContactActivity(c.id)
  // The same person's cards in other address books (ADR-0027).
  const { data: copies = [] } = useContactCopies(c.id)
  const { data: dupes = [] } = useDuplicates()
  const twins = dupes.find((set) => set.some((k) => k.id === c.id))
  const share = useShareContact(c)
  const actions = usePersonActions(c, onDeleted)
  const latest = useRef({ actions, share })
  useEffect(() => {
    latest.current = { actions, share }
  })
  usePhoneChrome(frame.phone ? c : undefined, latest)
  const line = [c.org, c.title].filter(Boolean).join(" // ")

  return (
    <article className="flex flex-col gap-8" aria-label={c.fullName} data-slot="contact-detail">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <InitialTile size="l" initials={contactInitials(c.fullName)} src={c.photo ?? undefined} />
          <div className="flex min-w-0 flex-col">
            <h2 className={frame.phone ? "type-lead break-words" : "type-title break-words"}>{c.fullName}</h2>
            {line && <p className="type-meta text-text-label">{line}</p>}
          </div>
        </div>
        {c.labels.length > 0 && (
          <ul className="flex flex-wrap gap-2" aria-label="Labels">
            {c.labels.map((l) => (
              <li key={l}>
                <Badge>{l}</Badge>
              </li>
            ))}
          </ul>
        )}
        {twins && (
          <Banner
            size="compact"
            tone="info"
            body={`${twins.length} cards look like this person.`}
            action={
              <Button variant="secondary" size="sm" onClick={() => setPlace({ kind: "duplicates" })}>
                Review
              </Button>
            }
          />
        )}
      </div>

      <div className="flex flex-col" role="group" aria-label="Details">
        {c.emails.map((e) => (
          <EmailRow key={`e-${e.value}`} field={e} size={size} />
        ))}
        {c.phones.map((p) => (
          <FieldRow
            key={`p-${p.value}`}
            size={size}
            label={fieldLabel(p.label, "Phone")}
            action={
              <FieldRowAction href={`tel:${dial(p.value)}`} aria-label={`Call ${p.value}`}>
                Call
              </FieldRowAction>
            }
          >
            {p.value}
          </FieldRow>
        ))}
        {c.birthday && (
          <FieldRow size={size} label="Birthday">
            {birthdayLabel(c.birthday)}
          </FieldRow>
        )}
        {c.note && (
          <FieldRow size={size} label="Note">
            <FieldRowValue truncate="wrap">{c.note}</FieldRowValue>
          </FieldRow>
        )}
        <FieldRow size={size} label="Saved in">
          {bookName(books, accounts, c.bookId)}
        </FieldRow>
        {copies.map((k) => (
          <FieldRow
            key={k.id}
            size={size}
            label="Also in"
            action={
              <FieldRowAction onClick={() => jumpTo({ kind: "contact", id: k.id })} aria-label={`Open ${k.fullName} in ${bookName(books, accounts, k.bookId)}`}>
                Open
              </FieldRowAction>
            }
          >
            {`${bookName(books, accounts, k.bookId)}${k.fullName !== c.fullName ? ` // as ${k.fullName}` : ""}`}
          </FieldRow>
        ))}
      </div>

      {!frame.phone && (
        <div className="flex flex-wrap gap-4" role="group" aria-label="Contact actions">
          {c.emails.length > 0 && (
            <WriteControl
              c={c}
              trigger={
                <Button variant="secondary">
                  <Icon name="email" /> Write
                </Button>
              }
            />
          )}
          {c.writable && (
            <Button variant="secondary" onClick={actions.edit}>
              <Icon name="edit" /> Edit
            </Button>
          )}
          <ShareMenu
            items={share.items}
            trigger={
              <Button variant="secondary">
                <Icon name="share" /> Share
              </Button>
            }
          />
          {c.writable && (
            <Button variant="secondary" onClick={() => void actions.del()} loading={actions.deleting}>
              <Icon name="trash-can" /> Delete
            </Button>
          )}
        </div>
      )}
      {!c.writable && (
        <p className="flex items-center gap-2 type-caption text-text-secondary" data-slot="read-only">
          <Icon name="locked" size="sm" /> This address book is read-only.
        </p>
      )}

      {activity && <Activity activity={activity} />}
      <LinkedNotes target={{ kind: "contact", id: c.id }} title={c.fullName} />
      {share.layer}
    </article>
  )
}

/**
 * A phone's pushed person (Mobile / 12): Edit and More in the top bar (More:
 * the three ways to share, Quick note, Delete); the bottom row writes mail,
 * and messages (`sms:`) when the card has a phone. A read-only card has no
 * Edit or Delete.
 */
function usePhoneChrome(c: ContactDetail | undefined, latest: RefObject<{ actions: ReturnType<typeof usePersonActions>; share: ReturnType<typeof useShareContact> }>) {
  const chrome = useMemo(() => {
    if (!c) return null
    const phone = c.phones[0]?.value
    return {
      actions: (
        <>
          {c.writable && <FloatButton label="Edit" icon="edit" size="l" onClick={() => latest.current.actions.edit()} />}
          <AdaptiveMenu title="More" align="end" trigger={<FloatButton label="More" icon="overflow-menu--horizontal" size="l" />}>
            <MoreItems writable={c.writable} latest={latest} />
          </AdaptiveMenu>
        </>
      ),
      start:
        c.emails.length || phone ? (
          <>
            {c.emails.length > 0 && <WriteControl c={c} trigger={<FloatButton label="Write mail" icon="email" size="l" />} />}
            {phone && <FloatButton label="Message" icon="chat" size="l" onClick={() => window.open(`sms:${dial(phone)}`, "_self")} />}
          </>
        ) : undefined,
    }
  }, [c, latest])
  usePushedChrome(chrome)
}

/** The phone's More menu, read from the latest actions when it opens. */
function MoreItems({ writable, latest }: { writable: boolean; latest: RefObject<{ actions: ReturnType<typeof usePersonActions>; share: ReturnType<typeof useShareContact> }> }) {
  const { actions, share } = latest.current
  return (
    <>
      {share.items}
      <AdaptiveMenuItem icon="notebook" onSelect={actions.quickNote}>
        Quick note
      </AdaptiveMenuItem>
      {writable && (
        <AdaptiveMenuItem icon="trash-can" variant="destructive" onSelect={() => void actions.del()}>
          Delete
        </AdaptiveMenuItem>
      )}
    </>
  )
}

/**
 * What you have going with someone (brief P2), each section only with rows:
 * UPCOMING and MET RECENTLY as event cards, RECENT MAIL as message rows. Each
 * opens where it lives. The sender panel beside a message shows it too.
 */
export function Activity({ activity: { threads, upcoming, past }, onThread }: { activity: ContactActivity; onThread?: (row: MessageSummary) => void }) {
  const jumpTo = useUi((s) => s.jumpTo)
  const { data: calendars = [] } = useCollections("calendar")
  const swatches = useMemo(() => calendarSwatches(calendars), [calendars])
  if (!threads.length && !upcoming.length && !past.length) return null
  const meetings = (title: string, list: Occurrence[]) =>
    list.length > 0 && (
      <section className="flex flex-col gap-2" aria-label={title}>
        <SectionHeader title={title} count={list.length} level={3} />
        <ul className="flex flex-col gap-2">
          {list.map((o) => (
            <li key={`${o.eventId}-${o.start}`}>
              <OccurrenceCard occurrence={o} date swatch={eventSwatch(swatches.get(o.calendarId))} onOpen={() => jumpTo({ kind: "event", id: o.eventId, start: o.start })} />
            </li>
          ))}
        </ul>
      </section>
    )
  // Its own column, read from the start: the sender panel around it centres its text.
  return (
    <div className="flex w-full flex-col gap-8 text-left">
      {meetings("Upcoming", upcoming)}
      {threads.length > 0 && (
        <section className="flex flex-col gap-2" aria-label="Recent mail">
          <SectionHeader title="Recent mail" count={threads.length} level={3} />
          <ul className="flex flex-col">
            {threads.map((t) => (
              <li key={t.threadId}>
                <MessageRow message={t} onOpen={() => (onThread ? onThread(t) : jumpTo({ kind: "thread", id: t.threadId, row: t }))} />
              </li>
            ))}
          </ul>
        </section>
      )}
      {meetings("Met recently", past)}
    </div>
  )
}

/** SHARE on the person (a desktop and medium width): the three ways, as a menu under the button. */
function ShareMenu({ items, trigger }: { items: ReturnType<typeof useShareContact>["items"]; trigger: ReactElement<Record<string, unknown>> }) {
  return (
    <AdaptiveMenu title="Share" trigger={trigger} align="start">
      {items}
    </AdaptiveMenu>
  )
}
