import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"

import { useUi } from "@/app/ui-store"
import { FormLayer, FormLayerForm } from "@/components/editor-frame"
import {
  AdaptiveMenu,
  AdaptiveMenuRadioGroup,
  AdaptiveMenuRadioItem,
  Button,
  ChipField,
  FieldRow,
  FieldRowAction,
  FilterChip,
  FilterChipGroup,
  IconButton,
  ListRow,
  SwipeRow,
  TextField,
  ToggleRow,
  toast,
  type SwipeRowAction,
} from "@unicron/ui"
import { getCoreClient } from "@/core/client"
import { useAccounts, useInboxOverview, useMailAction, useSplits } from "@/core/queries"
import type { Category, Split, SplitInput } from "@/core/types"
import { useLeaveGuard } from "@/lib/leave-guard"

import { CATEGORIES } from "./lanes"
import { rowTime } from "./row-time"

const fail = (e: unknown) => toast.error(e instanceof Error ? e.message : String(e))

/** A chip's value: "all", a category, or a split by its id. */
const splitValue = (id: string) => `split:${id}`

/**
 * The Inbox's filters (ADR-0091; brief M2): one row of single-choice chips under the page head, on both
 * widths. All, the three categories and one chip per split, with the split's unread count; it scrolls
 * sideways when it runs past the column. After it: New split, and Edit split while a split is chosen.
 */
export function InboxChips({ accountId, onPick }: { accountId: string | null; onPick: () => void }) {
  const { data: splits = [] } = useSplits()
  const { data: overview } = useInboxOverview(accountId)
  const category = useUi((s) => s.mailCategory)
  const split = useUi((s) => s.mailSplit)
  const open = useUi((s) => s.openSplitEditor)
  const active = split ? splits.find((s) => s.id === split) : undefined
  const value = active ? splitValue(active.id) : (category ?? "all")
  const choose = (v: string) => {
    const ui = useUi.getState()
    if (v.startsWith("split:")) ui.setMailSplit(v.slice("split:".length))
    else ui.setMailCategory(v === "all" ? null : (v as Category))
    onPick()
  }
  return (
    <FilterChipGroup
      type="single"
      scroll
      label="Show"
      value={value}
      onValueChange={choose}
      action={
        <div className="flex items-center gap-1">
          {active && <IconButton label="Edit split" icon="edit" size="icon-sm" onClick={() => open({ id: active.id, initial: active })} />}
          <IconButton label="New split" icon="add" size="icon-sm" onClick={() => open({ initial: {} })} />
        </div>
      }
    >
      <FilterChip value="all">All</FilterChip>
      {CATEGORIES.map((c) => (
        <FilterChip key={c.id} value={c.id}>
          {c.label}
        </FilterChip>
      ))}
      {splits.map((s) => {
        const unread = overview?.splits.find((c) => c.id === s.id)?.unread ?? 0
        return (
          <FilterChip key={s.id} value={splitValue(s.id)} count={unread > 0 ? unread : undefined}>
            {s.name}
          </FilterChip>
        )
      })}
    </FilterChipGroup>
  )
}

/** Creates or edits a split: who it's from, what the subject says, and whether it leaves All. */
export function SplitEditor() {
  const state = useUi((s) => s.splitEditor)
  const open = useUi((s) => s.openSplitEditor)
  return (
    <FormLayer open={state !== null} onClose={() => open(null)}>
      {state && <SplitForm key={state.id ?? "new"} id={state.id} initial={state.initial} onDone={() => open(null)} />}
    </FormLayer>
  )
}

/** An address, or a whole domain written with @ in front: anything else is a red chip. */
const badSender = (v: string) => !v.includes("@") || v.endsWith("@")
const senderText = (v: string) => v.trim().toLowerCase() || null

/** What a split holds, as the create call takes it. */
const inputOf = (s: Partial<SplitInput>): SplitInput => ({
  name: s.name ?? "",
  senders: s.senders ?? [],
  subject: s.subject ?? null,
  hasAttachments: s.hasAttachments ?? false,
  accountId: s.accountId ?? null,
  exclusive: s.exclusive ?? true,
})

function SplitForm({ id, initial, onDone }: { id?: string; initial: Partial<SplitInput>; onDone: () => void }) {
  const { data: accounts = [] } = useAccounts()
  const qc = useQueryClient()
  const setSplit = useUi((s) => s.setMailSplit)
  const [name, setName] = useState(initial.name ?? "")
  const [senders, setSenders] = useState<string[]>(initial.senders ?? [])
  const [typing, setTyping] = useState("")
  const [subject, setSubject] = useState(initial.subject ?? "")
  const [attachments, setAttachments] = useState(initial.hasAttachments ?? false)
  const [account, setAccount] = useState(initial.accountId ?? "")
  // New splits keep their mail out of All by default: that's the point of a split.
  const [exclusive, setExclusive] = useState(initial.exclusive ?? true)
  const save = useMailAction((c, input: SplitInput) => c.saveSplit(id ?? null, input))
  const remove = useMailAction((c) => c.deleteSplit(id!))
  // Closing asks first once a value differs from when the form opened (ADR-0087).
  const values = JSON.stringify([name, senders, typing, subject, attachments, account, exclusive])
  const [opened] = useState(values)
  useLeaveGuard(values !== opened)
  const [error, setError] = useState<string | null>(null)
  const bad = senders.some(badSender)
  const submit = async () => {
    setError(null)
    // An address still being typed counts, as if Enter had taken it.
    const typed = senderText(typing)
    const all = typed && !senders.includes(typed) ? [...senders, typed] : senders
    if (all.some(badSender)) {
      setSenders(all)
      setTyping("")
      return
    }
    const input = inputOf({ name, senders: all, subject: subject || null, hasAttachments: attachments, accountId: account || null, exclusive })
    try {
      const split = (await save.mutateAsync(input)) as Split
      toast(id ? `Saved ${split.name}` : `Created ${split.name}`)
      setSplit(split.id)
      onDone()
    } catch (e) {
      // The form stays open with the server's words above its actions.
      setError(e instanceof Error ? e.message : String(e))
    }
  }
  const del = async () => {
    // What was saved, not what was typed since: Undo makes that split again.
    const kept = inputOf(initial)
    try {
      await remove.mutateAsync(undefined)
      setSplit(null)
      toast(`Deleted ${kept.name}`, {
        action: {
          label: "Undo",
          onClick: async () => {
            try {
              const split = await (await getCoreClient()).saveSplit(null, kept)
              await qc.invalidateQueries({ queryKey: ["messages"] })
              useUi.getState().setMailSplit(split.id)
            } catch (e) {
              fail(e)
            }
          },
        },
      })
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }
  const chosen = accounts.find((a) => a.id === account)
  return (
    <FormLayerForm
      overline={id ? "Edit split" : "New split"}
      title={name.trim() || (id ? "Edit split" : "New split")}
      primary={{ label: id ? "Save" : "Create split", loading: save.isPending }}
      error={error}
      onSubmit={() => void submit()}
      footerStart={
        id && (
          <Button type="button" variant="ghost-destructive" loading={remove.isPending} onClick={() => void del()}>
            Delete
          </Button>
        )
      }
    >
      <p className="type-body text-muted-foreground">Mail must match everything you fill in.</p>
      <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} data-form-focus="" autoComplete="off" />
      <ChipField
        label="From"
        helper="An address, or a domain with @ in front."
        error={bad ? "Fix or remove the address in red." : undefined}
        value={senders}
        onValueChange={setSenders}
        inputValue={typing}
        onInputValueChange={setTyping}
        parse={senderText}
        isInvalid={badSender}
        autoComplete="off"
      />
      <TextField label="Subject has" value={subject} onChange={(e) => setSubject(e.target.value)} autoComplete="off" />
      {accounts.length > 1 && (
        <FieldRow
          label="Account"
          action={
            <AdaptiveMenu title="Account" trigger={<FieldRowAction>Change</FieldRowAction>}>
              <AdaptiveMenuRadioGroup value={account} onValueChange={setAccount}>
                <AdaptiveMenuRadioItem value="">Any account</AdaptiveMenuRadioItem>
                {accounts.map((a) => (
                  <AdaptiveMenuRadioItem key={a.id} value={a.id}>
                    {a.displayName}
                  </AdaptiveMenuRadioItem>
                ))}
              </AdaptiveMenuRadioGroup>
            </AdaptiveMenu>
          }
        >
          {chosen?.displayName ?? "Any account"}
        </FieldRow>
      )}
      <div className="flex flex-col">
        <ToggleRow label="Only with attachments" checked={attachments} onCheckedChange={setAttachments} />
        <ToggleRow label="Keep out of All" description="Its mail shows only in this tab." checked={exclusive} onCheckedChange={setExclusive} rule="both" />
      </div>
    </FormLayerForm>
  )
}

/**
 * The newsletter bundle (ADR-0091; brief M2): while All is chosen, the Inbox's newsletters fold into one compact
 * row. A tap chooses Newsletters. MARK READ and ARCHIVE ALL sit behind a left swipe, in the row's overflow
 * button at every width, on right-click and on the Menu key; ARCHIVE ALL is the full swipe, since it has Undo.
 */
export function NewsletterBundle({ accountId, now, onOpen }: { accountId: string | null; now: number; onOpen: () => void }) {
  const { data: overview } = useInboxOverview(accountId)
  const read = useMailAction((c) => c.bundleMarkRead(accountId))
  const archive = useMailAction((c) => c.bundleArchive(accountId))
  const unarchive = useMailAction((c, keys: string[]) => c.unarchiveBundle(keys))
  const b = overview?.bundle
  if (!b) return null
  const clear = async () => {
    try {
      const keys = (await archive.mutateAsync(undefined)) as string[]
      toast(`Archived ${b.threads} newsletters`, {
        action: { label: "Undo", onClick: () => unarchive.mutate(keys, { onError: fail }) },
      })
    } catch (e) {
      fail(e)
    }
  }
  const trailing: SwipeRowAction[] = [
    // Nothing to mark when every newsletter is read: then the row holds Archive all alone.
    ...(b.unread > 0 ? [{ icon: "view", label: "Mark read", tone: "neutral", reversible: false, onAction: () => read.mutate(undefined, { onError: fail }) } satisfies SwipeRowAction] : []),
    { icon: "archive", label: "Archive all", tone: "primary", reversible: true, onAction: () => void clear() },
  ]
  return (
    <SwipeRow trailing={trailing}>
      <ListRow
        layout="message"
        size="compact"
        sender="Newsletters"
        count={b.threads}
        unread={b.unread > 0}
        preview={b.senders.join(", ")}
        time={rowTime(b.latest, new Date(now * 1000))}
        onClick={onOpen}
      />
    </SwipeRow>
  )
}

/**
 * The Screener's pointer (ADR-0091; brief M3): where the sidebar does not list Mail's folders (a phone, a medium
 * window, a collapsed sidebar), one compact row at the top of the Inbox says how many new senders wait.
 */
export function ScreenerPointer({ waiting, onOpen }: { waiting: number; onOpen: () => void }) {
  return <ListRow layout="message" size="compact" sender="Screener" preview={`${waiting} new ${waiting === 1 ? "sender" : "senders"} waiting`} onClick={onOpen} />
}
