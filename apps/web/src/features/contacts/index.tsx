import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"

import { useRefresh, useScreenFact, useScreenPlace } from "@/app/screen"
import { useSectionBanner, type SectionBanner } from "@/app/section-banner"
import { useSectionSwitcher } from "@/app/places"
import { SectionSwitcher } from "@/app/section-switcher"
import { pendingJump, useUi } from "@/app/ui-store"

import { EmptyState, FilterChip, FilterChipGroup, formatNavCount, SectionHeader, Skeleton, useAppFrame } from "@unicron/ui"
import { LoadState } from "@/components/load-state"
import { MasterDetail } from "@/components/master-detail"
import { ScreenHead } from "@/components/page"
import { useAccounts, useCollections, useContacts, useDuplicates } from "@/core/queries"
import type { ContactSummary } from "@/core/types"
import { leaveThen } from "@/lib/leave-guard"

import { ContactDetailPane } from "./contact-detail"
import { ContactPaneEditor } from "./contact-editor"
import { closePaneEditor, useContactPane, useContactPaneHost } from "./contact-pane"
import { ContactsNav } from "./contacts-nav"
import { DuplicatesPane } from "./duplicates"
import { PersonRow } from "./person-row"
import { RecentlyDeletedPane } from "./recently-deleted"
import { closeRestoreContacts, useRestoreContacts } from "./open-restore"
import { RestoreContactsLayer } from "./restore"
import { SmartGroupEditor } from "./smart-groups"
import { contactsPlaceName, useContactsPlace } from "./use-contacts-place"

/** Nothing open beside the list (brief P2; decisions §9). */
const PICK = "Pick a contact to see it here."

/** Section letter for the A–Z list (accents fold: "Élodie" files under E). */
const letter = (c: ContactSummary) => {
  const words = c.fullName.trim().split(/\s+/)
  const first = (c.fullName === c.org ? words[0] : words.at(-1))?.[0] ?? "#"
  const base = first.normalize("NFD").replace(/\p{M}/gu, "").toUpperCase()
  return /[A-Z]/.test(base) ? base : "#"
}

/** The labels the people in a list carry, each with how many carry it, by name. */
function labelsIn(list: ContactSummary[]) {
  const counts = new Map<string, { name: string; count: number }>()
  for (const c of list) {
    for (const l of new Set(c.labels.map((x) => x.toLowerCase()))) {
      const name = c.labels.find((x) => x.toLowerCase() === l)!
      counts.set(l, { name: counts.get(l)?.name ?? name, count: (counts.get(l)?.count ?? 0) + 1 })
    }
  }
  return [...counts.values()].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()))
}

/** Three rows while the list arrives (brief 4.0). */
function ListSkeleton() {
  return (
    <div className="flex flex-col gap-8 pt-4" aria-hidden data-slot="contacts-loading">
      {[0, 1, 2].map((i) => (
        <div key={i} className="grid h-12 gap-2">
          <Skeleton />
          <Skeleton />
        </div>
      ))}
    </div>
  )
}

export function ContactsView() {
  // The open card. Which list it is picked from is the place (ADR-0084): everyone, a label, a smart group;
  // Duplicates and Recently deleted are places too, and take the list's room.
  // `keep`: opened by a jump that also changed the place, so that change of place leaves it open.
  const [open, setOpen] = useState<{ id: string; keep?: boolean } | null>(() => {
    const id = pendingJump("contact")?.id
    return id ? { id } : null
  })
  // The contact form stands in the detail column beside the list (ADR-0103; Desktop / 10).
  const frame = useAppFrame()
  useContactPaneHost(frame.split)
  const editor = useUi((s) => s.contactEditor)
  const inPane = useContactPane((s) => s.inPane) && !!editor && frame.split
  const unsaved = useContactPane((s) => s.dirty)
  const selected = inPane ? (editor.contactId ?? null) : (open?.id ?? null)
  const setSelected = (id: string | null) => setOpen(id ? { id } : null)
  // A move inside Contacts that the places store doesn't see (another row, Back) asks first when the form holds changes.
  const moveTo = (id: string | null) =>
    leaveThen(() => {
      closePaneEditor()
      setSelected(id)
    })
  useEffect(() => void useUi.getState().takeJump("contact"), [])
  // A jump while Contacts is already open (a birthday, an Undo) selects that card.
  useEffect(
    () =>
      useUi.subscribe((s, before) => {
        if (s.jump?.kind !== "contact") return
        setOpen({ id: s.jump.id, keep: s.contactsPlace !== before.contactsPlace })
        s.takeJump("contact")
      }),
    [],
  )
  // A label or a smart group that's gone (its last contact edited, the group deleted) gives way to everyone.
  const at = useContactsPlace()
  const { place } = at
  const setPlace = useUi((s) => s.setContactsPlace)
  const active = place.kind === "label" ? place.name : null
  const activeGroup = place.kind === "group" ? at.group : null
  const tool = place.kind === "duplicates" || place.kind === "deleted"
  // Inside a smart group, one of its labels narrows it (brief P1); ALL is none.
  const [chip, setChip] = useState<string | null>(null)
  // Another place, picked in the nav: the card that was open belongs to the one left behind.
  const placeKey = JSON.stringify(place)
  const [placeSeen, setPlaceSeen] = useState(placeKey)
  if (placeSeen !== placeKey) {
    setPlaceSeen(placeKey)
    setOpen(open?.keep ? { id: open.id } : null)
    setChip(null)
  }
  // Another place closes a form in the pane (with changes, the store asked first). A new contact from a
  // clean-up tool (NEW CONTACT, quick create) stands beside everyone instead.
  const placeBefore = useRef(placeKey)
  const keepForm = useRef(false)
  useEffect(() => {
    if (placeKey !== placeBefore.current && !keepForm.current) closePaneEditor()
    placeBefore.current = placeKey
    keepForm.current = false
  }, [placeKey])
  useEffect(() => {
    if (!inPane || !tool) return
    keepForm.current = true
    setPlace({ kind: "all" })
  }, [inPane, tool, setPlace])
  const restoring = useRestoreContacts((s) => s.openedAt)
  // A phone's list runs edge to edge: its letter headers take the rows' 16 px.
  const phone = frame.phone
  const { data: contacts = [], isPending, error, refetch, isRefetching } = useContacts("", active, activeGroup?.id ?? null)
  const { data: dupes = [] } = useDuplicates()
  // Source names (ADR-0027): with more than one address book showing, each
  // row says where that card lives, so you edit the copy you mean.
  const { data: books = [] } = useCollections("contacts")
  const { data: accounts = [] } = useAccounts()
  const shown = books.filter((b) => !b.hidden && b.id !== "birthdays")
  const sourceOf = (bookId: string) => {
    if (shown.length < 2) return undefined
    const b = books.find((x) => x.id === bookId)
    return accounts.find((a) => a.id === b?.accountId)?.displayName ?? b?.name ?? undefined
  }

  // An account's address books that did not sync: Contacts' one banner (brief X4, channel 4).
  const failing = accounts.find((a) => a.davError)
  const banner = useMemo<SectionBanner | null>(
    () =>
      failing
        ? { title: `${failing.displayName} contacts didn't sync`, body: failing.davError ?? undefined, action: { label: "Open Accounts", onClick: () => useUi.getState().openSettings("accounts") } }
        : null,
    [failing],
  )
  useSectionBanner("contacts", banner)

  const chips = activeGroup ? labelsIn(contacts) : []
  const narrowed = chip && chips.some((l) => l.name === chip) ? contacts.filter((c) => c.labels.some((l) => l.toLowerCase() === chip.toLowerCase())) : contacts

  // The core sorts by family name; group consecutive rows by that letter.
  const sections: { letter: string; items: ContactSummary[] }[] = []
  for (const c of narrowed) {
    const l = letter(c)
    if (sections.at(-1)?.letter === l) sections.at(-1)!.items.push(c)
    else sections.push({ letter: l, items: [c] })
  }

  // What the shell says about this screen (ADR-0083): the group as the place, and how many people it lists.
  const placeName = contactsPlaceName(at)
  // Editing in the pane: CONTACTS // {NAME} // EDIT, or CONTACTS // NEW, and UNSAVED CHANGES once something changed (Desktop / 10).
  useScreenPlace(inPane ? (editor.contactId ? `${editor.initial.fullName || "Contact"} // Edit` : "New") : placeName)
  useScreenFact(inPane ? (unsaved ? "Unsaved changes" : null) : isPending || tool ? null : `${formatNavCount(contacts.length)} people`)
  useRefresh(refetch)
  // The page head opens the groups wherever the sidebar does not list them (brief X1).
  const switching = useSectionSwitcher("Change group.")
  const switcher = (
    <SectionSwitcher state={switching} overline={`Contacts // ${placeName}`} title="Groups">
      <ContactsNav layer />
    </SectionSwitcher>
  )

  if (tool) {
    // A clean-up tool has the list's room and no detail beside it; a card it restores opens among everyone.
    return (
      <>
        <MasterDetail
          section="Contacts"
          pick={PICK}
          listFills
          onBack={() => setPlace({ kind: "all" })}
          header={
            <ScreenHead
              overline={place.kind === "duplicates" ? `Duplicates // ${formatNavCount(dupes.length)} ${dupes.length === 1 ? "set" : "sets"}` : "Recently deleted // 30 days"}
              title={placeName}
              switcher={switching.switcher}
              below={switcher}
            />
          }
          list={
            place.kind === "duplicates" ? (
              <DuplicatesPane />
            ) : (
              <RecentlyDeletedPane
                onRestored={(id) => {
                  useUi.getState().jumpTo({ kind: "contact", id })
                }}
              />
            )
          }
          detail={null}
        />
        <Layers restoring={restoring} />
      </>
    )
  }

  // The head (brief P1): CONTACTS // 008 and "People"; a label or a group by its name and its count.
  const name = active ?? activeGroup?.name ?? null
  const overline = `${name ?? "Contacts"} // ${isPending ? "" : formatNavCount(contacts.length)}`

  let body: ReactNode
  if (isPending) body = <ListSkeleton />
  else if (!contacts.length && !error)
    body = activeGroup ? (
      <EmptyState title={`No one fits ${activeGroup.name} right now.`} body="People join as their cards change." />
    ) : active ? (
      <EmptyState title={`No one has the ${active} label.`} />
    ) : (
      <EmptyState title="No contacts yet." body="Add one, or connect an account that has some." />
    )
  else
    body = (
      <div className="flex flex-col gap-4" role="group" aria-label="People">
        {sections.map((s) => (
          <section key={s.letter} aria-label={s.letter}>
            <SectionHeader title={s.letter} count={s.items.length} variant="index" level={3} inset={phone} />
            <ul>
              {s.items.map((c) => (
                <PersonRow key={c.id} render={<li />} list contact={c} book={sourceOf(c.bookId)} selected={selected === c.id} onOpen={() => moveTo(c.id)} />
              ))}
            </ul>
          </section>
        ))}
      </div>
    )

  return (
    <MasterDetail
      section="Contacts"
      pick={PICK}
      onBack={() => moveTo(null)}
      header={
        <>
          <ScreenHead
            overline={overline}
            title={name ?? "People"}
            switcher={switching.switcher}
            below={
              <>
                {switcher}
                {chips.length > 0 && (
                  <FilterChipGroup type="single" label={`Narrow ${activeGroup!.name} by label`} scroll value={chip ?? "all"} onValueChange={(v) => setChip(v === "all" ? null : v)}>
                    <FilterChip value="all" count={contacts.length}>
                      All
                    </FilterChip>
                    {chips.map((l) => (
                      <FilterChip key={l.name} value={l.name} count={l.count}>
                        {l.name}
                      </FilterChip>
                    ))}
                  </FilterChipGroup>
                )}
              </>
            }
          />
          <Layers restoring={restoring} />
        </>
      }
      list={
        <LoadState place="your contacts" overline="Contacts" error={error} hasData={contacts.length > 0} onRetry={() => void refetch()} retrying={isRefetching}>
          {body}
        </LoadState>
      }
      detail={
        inPane ? (
          <ContactPaneEditor onSaved={(id) => setSelected(id)} />
        ) : selected ? (
          <ContactDetailPane key={selected} id={selected} onDeleted={() => setSelected(null)} />
        ) : null
      }
    />
  )
}

/** What the groups list opens over Contacts (brief X1): Restore contacts by its intent, and the smart group form. */
function Layers({ restoring }: { restoring: number | null }) {
  return (
    <>
      <RestoreContactsLayer openedAt={restoring} onClose={closeRestoreContacts} />
      <SmartGroupEditor />
    </>
  )
}
