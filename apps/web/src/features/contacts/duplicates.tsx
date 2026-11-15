import { useState } from "react"

import { useUi } from "@/app/ui-store"
import { AppFrameInset, Button, EmptyState, ListRow, RadioGroup, RadioGroupItem, SectionHeader, Skeleton, toast, useAppFrame } from "@unicron/ui"
import { useAccounts, useCollections, useDuplicates, usePimAction } from "@/core/queries"
import type { Account, Collection, ContactSummary } from "@/core/types"
import { useConfirm } from "@/lib/confirm"

/**
 * The card to keep at first: the fullest name ("Ana Duarte", not "Ana D."), since the kept card keeps its
 * name; then the one with most emails and phones, then a company. The others' details join it either way.
 */
const fullest = (g: ContactSummary[]) =>
  [...g].sort(
    (a, b) =>
      b.fullName.trim().length - a.fullName.trim().length ||
      b.emails.length + b.phones.length - (a.emails.length + a.phones.length) ||
      Number(!!b.org) - Number(!!a.org),
  )[0]!

/** What the merged card holds: every address and number in the set, each once, as the core merges them. */
function keeps(group: ContactSummary[]) {
  const emails = new Set(group.flatMap((c) => c.emails.map((e) => e.value.trim().toLowerCase())))
  const phones = new Set(group.flatMap((c) => c.phones.map((p) => p.value.replace(/[^\d+]/g, ""))))
  const n = (count: number, one: string) => `${count} ${one}${count === 1 ? "" : "s"}`
  const parts = [emails.size && n(emails.size, "email"), phones.size && n(phones.size, "phone")].filter(Boolean)
  return parts.length ? `Keeps ${parts.join(", ")}.` : "Keeps the name and company."
}

/** The address book a card lives in, as the list's rows name it. */
function bookOf(books: Collection[], accounts: Account[], id: string) {
  const b = books.find((x) => x.id === id)
  return accounts.find((a) => a.id === b?.accountId)?.displayName ?? (b?.accountId ? b.name : "On this device")
}

/**
 * One set (brief P4): the person's name and how many cards; "Keep which?"
 * as rows with a leading radio, each with its real addresses and numbers and
 * its address book; what the kept card will hold; MERGE, which asks.
 */
function DuplicateSet({ group }: { group: ContactSummary[] }) {
  const phone = useAppFrame().phone
  const { data: books = [] } = useCollections("contacts")
  const { data: accounts = [] } = useAccounts()
  const [keep, setKeep] = useState(() => fullest(group).id)
  const merge = usePimAction((c, args: { primary: string; others: string[] }) => c.mergeContacts(args.primary, args.others))
  const confirm = useConfirm()
  const kept = group.find((g) => g.id === keep) ?? group[0]!
  // The set is named by its fullest name, whichever card is kept.
  const [name] = useState(() => fullest(group).fullName)
  const run = async () => {
    let merged: ContactSummary | null = null
    const yes = await confirm.ask({
      title: `Merge ${group.length} cards into ${kept.fullName}?`,
      description: "The other cards go to Recently deleted. Merged details can't be split again.",
      confirmLabel: "Merge",
      confirmIcon: "merge",
      tone: "default",
      run: async () => {
        merged = await merge.mutateAsync({ primary: kept.id, others: group.filter((g) => g.id !== kept.id).map((g) => g.id) })
      },
    })
    const done = merged as ContactSummary | null
    if (!yes || !done) return
    toast.success(`Merged into ${done.fullName}`, { action: { label: "Open", onClick: () => useUi.getState().jumpTo({ kind: "contact", id: done.id }) } })
  }
  return (
    <section className="flex flex-col gap-4" aria-label={name}>
      <SectionHeader title={name} count={group.length} level={2} inset={phone} />
      <RadioGroup aria-label="Keep which?" value={keep} onValueChange={(v) => setKeep(String(v))}>
        {group.map((c) => (
          <ListRow
            key={c.id}
            // The whole row is the radio's label, so a press on the name picks it too.
            render={<label />}
            leading={<RadioGroupItem value={c.id} />}
            title={c.fullName}
            meta={[...c.emails.map((e) => e.value), ...c.phones.map((p) => p.value)].join(" // ") || c.org || "No email or phone"}
            metaStyle="plain"
            status={bookOf(books, accounts, c.bookId)}
          />
        ))}
      </RadioGroup>
      <AppFrameInset>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="type-caption text-muted-foreground">{keeps(group)}</p>
          <Button variant="secondary" onClick={() => void run()} loading={merge.isPending}>
            Merge
          </Button>
        </div>
      </AppFrameInset>
      {confirm.question()}
    </section>
  )
}

/** Possible duplicates (brief P4): one column up to 720, a set after another. Cards that share an email, a phone number or a full name. */
export function DuplicatesPane() {
  const { data: groups = [], isPending } = useDuplicates()
  if (isPending)
    return (
      <div className="flex max-w-180 flex-col" aria-hidden data-slot="duplicates-loading">
        <Skeleton variant="row" />
        <Skeleton variant="row" />
        <Skeleton variant="row" />
      </div>
    )
  if (groups.length === 0)
    return (
      <AppFrameInset>
        <EmptyState overline="Duplicates // 00" title="No duplicates left." />
      </AppFrameInset>
    )
  return (
    <div className="flex max-w-180 flex-col gap-8 pb-10">
      {groups.map((g) => (
        <DuplicateSet key={g.map((c) => c.id).join()} group={g} />
      ))}
    </div>
  )
}
