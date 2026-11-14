import { useQueryClient } from "@tanstack/react-query"
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactElement, type ReactNode } from "react"

import { usePushedChrome } from "@/app/screen"
import { useUi } from "@/app/ui-store"
import {
  AdaptiveMenu,
  AdaptiveMenuItem,
  AdaptiveMenuSeparator,
  AdaptivePopover,
  AppFrameInset,
  Banner,
  Button,
  Chip,
  ChipAction,
  ChipRemove,
  EmptyState,
  FloatButton,
  Icon,
  Skeleton,
  TextField,
  Toolbar,
  ToolbarButton,
  ToolbarToggle,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  toast,
  useAppFrame,
} from "@unicron/ui"
import { getCoreClient } from "@/core/client"
import { useLockedNote, useNote, useNoteAction, useNoteBacklinks, useNotesLock, useNotesPrefs, useNoteTags } from "@/core/queries"
import type { NoteColor, NoteLink, NoteMeta, NotesPrefs } from "@/core/types"
import { useNowSecs } from "@/hooks/use-now"
import { reminderLabel } from "@/lib/time"
import { copyText } from "@/lib/copy"

import { titleAndSnippet } from "@/core/demo-notes"

import { PeopleHere } from "./people-here"
import { LinkPicker } from "./link-picker"
import { LockedPanel, PassphraseDialog } from "./lock"
import { notesSync } from "./sync"
import { colorLabel } from "./note-color"
import { NoteColorMenu } from "./note-color-menu"
import { remindLabel, rowTime } from "./note-meta"
import { RelayDialog } from "./relay-dialog"
import { RemindMenu, RemindSheet } from "./remind-menu"
import { ShareDialog } from "./share-dialog"
import { useLiveShareModes } from "./shared-docs"
import { NoteEditor, type NoteEditorHandle } from "./note-editor"
import { askRename, renameLinks, useRenameQuestions } from "./rename-links"
import { LINK_ICON, useOpenLink } from "./use-open-link"

/** A layer the phone's More sheet opens in its place: it has no button of its own. */
type PhoneLayer = "remind" | "color" | null

/** A note's name in a toast: its title, or "note" while it has none. */
const named = (title: string) => title.trim() || "note"

/**
 * The note (brief N2; Mobile / 15, Desktop / 11's detail column). Its props
 * are kept for the places that open a note from outside the list (Search).
 *
 * - **Top line:** `NOTE // EDITED 08:40`, with `// SHARED` or `// LOCKED`;
 *   on a desktop, who else is here and the note's toolbar: Pin, Remind,
 *   Color, More. On a phone the top bar's More opens one sheet with all of it.
 * - **The title** as its own field, then the chips (the reminder, links,
 *   tags, TAG and LINK) and LINKED FROM, then the text and the format bar.
 * - Esc leaves the text; Esc again closes the note.
 */
export function NoteDetailPane({ id, fresh, onClosed }: { id: string; fresh: boolean; onClosed: () => void }) {
  const { data: note, error, isPending, refetch } = useNote(id)
  const qc = useQueryClient()
  const setMeta = useNoteAction((c, meta: NoteMeta) => c.setNoteMeta(id, meta))
  const remove = useNoteAction<void>((c) => c.deleteNote(id))
  const restore = useNoteAction<void>((c) => c.restoreNote(id))
  const { data: prefs } = useNotesPrefs()
  const setPrefs = useNoteAction((c, change: Partial<NotesPrefs>) => c.setNotesPrefs({ sortChecked: true, ...prefs, ...change }))
  const open = useOpenLink()
  const phone = useAppFrame().phone
  const [meta, setLocal] = useState<NoteMeta | null>(null)
  const [picking, setPicking] = useState(false)
  const [colorOpen, setColorOpen] = useState(false)
  const [phoneLayer, setPhoneLayer] = useState<PhoneLayer>(null)
  const [writing, setWriting] = useState(false)
  const markdownRef = useRef<string | null>(null)
  const editorHandle = useRef<NoteEditorHandle | null>(null)
  const article = useRef<HTMLElement>(null)
  // Locked notes (ADR-0043): the text comes from the core only while unlocked.
  const { data: lockInfo } = useNotesLock()
  const unlocked = !!lockInfo?.unlocked
  const { data: openLocked, error: lockedError } = useLockedNote(id, !!note?.locked && unlocked)
  const [askPassphrase, setAskPassphrase] = useState(false)
  const [sharing, setSharing] = useState(false)
  const liveModes = useLiveShareModes()
  const [relayOpen, setRelayOpen] = useState(false)
  const refresh = () => void qc.invalidateQueries({ queryKey: ["notes"], predicate: (q) => q.queryKey[1] !== "note" })

  // Renames (ADR-0035): the title other notes' links use, and a pending
  // check that runs once the title has stopped changing (or the note closes).
  // The question is a banner on the note that stays until it is answered (brief N2).
  const linkedTitle = useRef<string | null>(null)
  const renameCheck = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const question = useRenameQuestions((s) => s[id])
  const [renaming, setRenaming] = useState(false)
  const [renameError, setRenameError] = useState<string | null>(null)
  const currentTitle = () => (markdownRef.current === null ? null : titleAndSnippet(markdownRef.current)[0])
  const offerRename = useCallback(() => {
    clearTimeout(renameCheck.current)
    renameCheck.current = undefined
    const old = useRenameQuestions.getState()[id]?.old ?? linkedTitle.current
    const next = markdownRef.current === null ? null : titleAndSnippet(markdownRef.current)[0]
    if (!old?.trim() || !next?.trim()) return
    if (old === next) return askRename(id, null)
    void getCoreClient()
      .then((c) => c.notesLinkingTo(old, id))
      .then((linking) => {
        if (linking.length === 0) {
          linkedTitle.current = next
          return askRename(id, null)
        }
        askRename(id, { old, next, count: linking.length })
      })
  }, [id])
  useEffect(() => () => void (renameCheck.current !== undefined && offerRename()), [offerRename])
  const updateLinks = async () => {
    if (!question) return
    const next = currentTitle() ?? question.next
    setRenaming(true)
    setRenameError(null)
    try {
      const n = await renameLinks(question.old, next, id)
      linkedTitle.current = next
      askRename(id, null)
      toast(`Updated links in ${n === 1 ? "1 note" : `${n} notes`}`)
    } catch (e) {
      setRenameError(e instanceof Error ? e.message : String(e))
    } finally {
      setRenaming(false)
    }
  }

  // A new note left empty is thrown away when you leave it, like Apple Notes.
  useEffect(() => {
    if (note && markdownRef.current === null) markdownRef.current = note.markdown
    if (note && linkedTitle.current === null) linkedTitle.current = note.title
  }, [note])
  useEffect(
    () => () => {
      if (fresh && !note?.locked && markdownRef.current !== null && !markdownRef.current.trim())
        void getCoreClient()
          .then((c) => c.deleteNote(id))
          .then(() => qc.invalidateQueries({ queryKey: ["notes"], predicate: (q) => q.queryKey[1] !== "note" }))
    },
    [fresh, id, qc, note?.locked],
  )

  // ── What the note's controls do ─────────────────────────────────────────
  const current = note ? { pinned: note.pinned, archived: note.archived, tags: note.tags, links: note.links, ...meta } : null
  // Local changes say "" (or 0) for none; the note says null.
  const color = note ? (meta?.color ?? note.color) || null : null
  const remindAt = note ? (meta?.remindAt ?? note.remindAt) || null : null
  // A note's name for a toast, read when the toast is raised: the title as typed.
  const nameNow = () => named(currentTitle() ?? note?.title ?? "")
  const guest = note?.share?.role === "guest" ? note.share : null
  const guestMode = (guest && liveModes[id]) ?? guest?.mode
  const shared = !!note?.share && !note.share.revoked
  const update = async (change: NoteMeta) => {
    setLocal((was) => ({ ...was, ...change }))
    try {
      await setMeta.mutateAsync(change)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    }
  }
  const pin = (pinned: boolean) => void update({ pinned })
  const remind = (at: number | null) => void update({ remindAt: at ?? 0 }).then(() => toast(at ? `Reminder set for ${reminderLabel(at)}` : "Reminder removed"))
  const paint = (c: NoteColor | null) => void update({ color: c ?? "" })
  const archive = async () => {
    if (!current) return
    const was = current.archived
    await update({ archived: !was })
    onClosed()
    toast(was ? `Unarchived ${nameNow()}` : `Archived ${nameNow()}`, { duration: 6000, action: { label: "Undo", onClick: () => void setMeta.mutateAsync({ archived: was }) } })
  }
  const del = async () => {
    try {
      await remove.mutateAsync()
      onClosed()
      toast(`Deleted ${nameNow()}`, { duration: 6000, action: { label: "Undo", onClick: () => void restore.mutateAsync() } })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    }
  }
  // Lock it now, or after the passphrase step: set one, or unlock with it.
  const lockIt = async () => {
    try {
      await (await getCoreClient()).lockNote(id)
      // Its shared copy on the relay is emptied, so only the sealed text remains.
      void notesSync()?.blank(id)
      refresh()
      void qc.invalidateQueries({ queryKey: ["notes", "note", id] })
      toast(`Locked ${nameNow()}`, { description: "Only its title shows until you unlock it" })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    }
  }
  const lock = () => (unlocked ? void lockIt() : setAskPassphrase(true))
  const unlockForGood = async () => {
    try {
      await (await getCoreClient()).removeNoteLock(id)
      void qc.invalidateQueries({ queryKey: ["notes"] })
      toast(`Removed the lock from ${nameNow()}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    }
  }
  const lockNow = async () => {
    await (await getCoreClient()).lockNotesNow()
    void qc.invalidateQueries({ queryKey: ["notes"] })
  }
  // Shared notes (ADR-0056): yours by link, or someone else's.
  const keepCopy = async () => {
    try {
      await (await getCoreClient()).unshareNote(id)
      refresh()
      void qc.invalidateQueries({ queryKey: ["notes", "note", id] })
      toast(`${nameNow()} is your own note now`, { description: "Their changes no longer come in" })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    }
  }
  // From the note's menu, so a toast says it; a blocked clipboard shows the text to copy by hand (lib/copy.ts).
  const copy = () => note && copyText(markdownRef.current ?? openLocked?.markdown ?? note.markdown, { what: "note as Markdown", label: "Note as Markdown" })
  // The map with this note picked (ADR-0053). A phone shows the map in the list's place, so the note closes.
  const showOnMap = () => {
    setPrefs.mutate({ graph: true })
    if (phone) onClosed()
  }
  const more: MoreActions = {
    pin: () => pin(!current?.pinned),
    archive: () => void archive(),
    share: () => setSharing(true),
    keepCopy: () => void keepCopy(),
    copy: () => void copy(),
    showOnMap,
    lock,
    lockNow: () => void lockNow(),
    removeLock: () => void unlockForGood(),
    del: () => void del(),
  }
  const moreRef = useRef(more)
  useEffect(() => {
    moreRef.current = more
  })
  const canWrite = !!note && !(guest && guestMode === "view") && !(note.locked && !unlocked)
  // What the More menu shows: which of its rows apply.
  const hasNote = !!note
  const archived = !!current?.archived
  const locked = !!note?.locked
  const isGuest = !!guest

  // A phone: the top bar's More, and the drawn add button in the detail row; the format bar takes its place while you write.
  const pinned = !!current?.pinned
  const pushed = useMemo(() => {
    if (!phone || !hasNote) return null
    return {
      actions: (
        <NoteMore
          phone
          actions={moreRef}
          shows={{ archived, locked, unlocked, guest: isGuest, shared }}
          trigger={<FloatButton label="Note actions" icon="overflow-menu--horizontal" size="l" />}
          pinned={pinned}
          remindAt={remindAt}
          color={color}
          onRemind={() => setPhoneLayer("remind")}
          onColor={() => setPhoneLayer("color")}
        />
      ),
      end: canWrite && !writing ? <FloatButton kind="primary" size="l" icon="add" label="Add line" onClick={() => editorHandle.current?.addLine()} /> : undefined,
    }
    // The menu's actions are read through moreRef when picked.
  }, [phone, hasNote, pinned, remindAt, color, canWrite, writing, archived, locked, unlocked, isGuest, shared])
  usePushedChrome(pushed)

  // Esc away from the writing closes the note (brief N2): the title and the text take the first Esc themselves.
  const closeOnEsc = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== "Escape" || e.defaultPrevented || !e.currentTarget.contains(e.target as Node)) return
    const t = e.target as HTMLElement
    if (t.matches("input, textarea") || t.closest(".ProseMirror")) return
    e.preventDefault()
    onClosed()
  }
  const leaveText = () => article.current?.focus()

  if (isPending) {
    return (
      <AppFrameInset>
        <div className="flex flex-col gap-5 pt-4" aria-busy="true" aria-label="Loading the note">
          <Skeleton variant="row" />
          <Skeleton variant="row" />
        </div>
      </AppFrameInset>
    )
  }
  if (!note || (error && gone(error))) {
    return (
      <AppFrameInset>
        <EmptyState size="sm" overline="Notes" title="That note is gone." body="It was deleted, or it was never on this device." />
      </AppFrameInset>
    )
  }
  if (error) {
    return (
      <AppFrameInset>
        <EmptyState size="sm" tone="critical" overline="Notes" title="Can’t open this note." body={error instanceof Error ? error.message : String(error)} actionLabel="Try again" onAction={() => void refetch()} />
      </AppFrameInset>
    )
  }

  const readOnly = !!guest && guestMode === "view"
  const overline = [
    "Note",
    `Edited ${rowTime(note.updated)}`,
    ...(guest ? ["Shared", guestMode === "edit" ? "You can edit" : "You can read"] : shared ? ["Shared"] : note.locked ? ["Locked"] : []),
    ...(current?.archived ? ["Archived"] : []),
  ].join(" // ")

  const top = (
    <>
      {question && (
        <Banner
          tone={renameError ? "critical" : "info"}
          size="compact"
          title={`${question.count === 1 ? "1 note links" : `${question.count} notes link`} to “${question.old}”.`}
          body={renameError ?? undefined}
          action={
            <Button variant="secondary" size="sm" loading={renaming} onClick={() => void updateLinks()}>
              Update links
            </Button>
          }
          onDismiss={() => {
            linkedTitle.current = currentTitle() ?? question.next
            askRename(id, null)
          }}
        />
      )}
      {readOnly && <Banner tone="info" size="compact" title="Shared with you for reading." body={guest?.from ? `${guest.from} can change it. Their changes show up here.` : "Their changes show up here."} />}
      {/* The overline's own 16 px line: the toolbar stands across it, as tall as it needs, so the title sits 4 px under the words. */}
      <div className="flex h-4 items-center gap-4">
        <p className="min-w-0 flex-1 truncate type-overline text-muted-foreground" data-role="note-overline">
          {overline}
        </p>
        {shared && <PeopleHere shareId={note.share!.id} tiles />}
        {!phone && (
          <Toolbar aria-label="Note" size="sm">
            <ToolbarToggle icon={current?.pinned ? "pin--filled" : "pin"} label="Pin" pressed={!!current?.pinned} onPressedChange={pin} />
            <RemindMenu value={remindAt} onPick={remind} trigger={<ToolbarButton icon={remindAt ? "notification--filled" : "notification"} label={remindLabel(remindAt)} />} />
            <NoteColorMenu value={color} onChange={paint} open={colorOpen} onOpenChange={setColorOpen} trigger={<ToolbarButton icon="color-palette" label={colorLabel(color)} />} />
            <NoteMore actions={moreRef} shows={{ archived, locked, unlocked, guest: isGuest, shared }} trigger={<ToolbarButton icon="overflow-menu--horizontal" label="Note actions" />} />
          </Toolbar>
        )}
      </div>
    </>
  )
  const afterTitle = (
    <>
      <div role="group" aria-label="Reminder, links and tags" className="flex flex-wrap items-center gap-2">
        {remindAt && <ReminderChip at={remindAt} onDone={() => remind(null)} />}
        {current!.links.map((l) => (
          <LinkChip key={`${l.kind}:${l.key}`} link={l} onOpen={(target) => void open(l.kind, target)} onRemove={() => void update({ links: current!.links.filter((x) => x !== l) })} />
        ))}
        {current!.tags.map((t) => (
          <Chip key={t} variant="secondary">
            #{t}
            <ChipRemove label={`Remove tag ${t}`} onClick={() => void update({ tags: current!.tags.filter((x) => x !== t) })} />
          </Chip>
        ))}
        <TagButton tags={current!.tags} onAdd={(t) => void update({ tags: [...current!.tags, t] })} />
        <Button variant="ghost" size="sm" aria-label="Link to an event, person or conversation" onClick={() => setPicking(true)}>
          Link
        </Button>
      </div>
      <LinkedFrom id={id} />
    </>
  )

  return (
    <article ref={article} aria-label="Note" tabIndex={-1} className="flex min-h-full flex-1 flex-col outline-none" onKeyDown={closeOnEsc} data-note-color={color ?? undefined}>
      {note.locked && !unlocked ? (
        <LockedNote top={top} title={note.title} />
      ) : note.locked && !openLocked ? (
        lockedError ? (
          <LockedNote top={top} title={note.title} />
        ) : (
          <AppFrameInset>
            <div className="pt-4">
              <Skeleton variant="row" />
            </div>
          </AppFrameInset>
        )
      ) : (
        <NoteEditor
          key={note.locked ? `${id}-locked` : id}
          note={note.locked && openLocked ? openLocked : note}
          locked={note.locked}
          autoFocus={fresh}
          top={top}
          afterTitle={afterTitle}
          onLeaveText={leaveText}
          onWriting={setWriting}
          handle={editorHandle}
          onSaved={(md) => {
            markdownRef.current = md
            refresh()
            if (linkedTitle.current !== null && titleAndSnippet(md)[0] !== linkedTitle.current) {
              clearTimeout(renameCheck.current)
              renameCheck.current = setTimeout(offerRename, 1500)
            }
          }}
        />
      )}
      <LinkPicker
        open={picking}
        onOpenChange={setPicking}
        linked={current!.links}
        onLink={(link) => {
          setPicking(false)
          if (current!.links.some((l) => l.kind === link.kind && l.key === link.key)) return
          void update({ links: [...current!.links, link] }).then(() => toast(`Linked to ${link.label}`))
        }}
        onUnlink={(link) => {
          setPicking(false)
          void update({ links: current!.links.filter((l) => !(l.kind === link.kind && l.key === link.key)) }).then(() => toast(`Unlinked ${link.label}`))
        }}
      />
      {/* A phone's Remind and Color open from the More sheet; on a desktop they are the toolbar's own. */}
      {phone && (
        <>
          <RemindSheet value={remindAt} onPick={remind} open={phoneLayer === "remind"} onOpenChange={(o) => setPhoneLayer(o ? "remind" : null)} anchor={hiddenAnchor} />
          <NoteColorMenu value={color} onChange={paint} open={phoneLayer === "color"} onOpenChange={(o) => setPhoneLayer(o ? "color" : null)} trigger={hiddenAnchor()} />
        </>
      )}
      <PassphraseDialog
        open={askPassphrase}
        onOpenChange={setAskPassphrase}
        onDone={() => {
          setAskPassphrase(false)
          void lockIt()
        }}
      />
      <ShareDialog note={note} open={sharing} onOpenChange={setSharing} onSetUpSync={() => setRelayOpen(true)} />
      <RelayDialog open={relayOpen} onOpenChange={setRelayOpen} />
    </article>
  )
}

/** The core's words for a note that is not there. */
const gone = (e: unknown) => /gone|not found|no such note/i.test(e instanceof Error ? e.message : String(e))

/** A layer opened from another layer has no button; this stands in for one, hidden, so the layer has a trigger. */
const hiddenAnchor = (): ReactElement<Record<string, unknown>> => <Button type="button" variant="ghost" hidden tabIndex={-1} aria-hidden="true" />

/** A locked note's top line, then the lock's own panel (brief N5). */
function LockedNote({ top, title }: { top: ReactNode; title: string }) {
  return (
    <>
      <AppFrameInset>
        <div className="flex flex-col gap-4">{top}</div>
      </AppFrameInset>
      <LockedPanel title={title} />
    </>
  )
}

/** Which of the More menu's rows apply. */
interface MoreShows {
  archived: boolean
  locked: boolean
  unlocked: boolean
  guest: boolean
  shared: boolean
}

interface MoreActions {
  pin: () => void
  archive: () => void
  share: () => void
  keepCopy: () => void
  copy: () => void
  showOnMap: () => void
  lock: () => void
  lockNow: () => void
  removeLock: () => void
  del: () => void
}

/**
 * The note's More (brief N2): a menu on a desktop, a sheet on a phone. On a
 * phone it holds Pin, Remind and Color first, since the top bar has room for
 * More alone. Then: Archive or Unarchive · Share… · Keep as my own note (a
 * guest) · Copy as Markdown · Show on the map · Lock note, Lock now or
 * Remove lock · Delete.
 */
function NoteMore({
  actions,
  shows: a,
  trigger,
  phone = false,
  pinned,
  remindAt,
  color,
  onRemind,
  onColor,
}: {
  actions: { current: MoreActions }
  shows: MoreShows
  trigger: ReactElement<Record<string, unknown>>
  phone?: boolean
  pinned?: boolean
  remindAt?: number | null
  color?: NoteColor | null
  onRemind?: () => void
  onColor?: () => void
}) {
  const run = (f: keyof MoreActions) => () => actions.current[f]()
  return (
    <AdaptiveMenu trigger={trigger} title="Note actions" overline={phone ? "Note" : undefined} width="auto" align="end">
      {phone && (
        <>
          <AdaptiveMenuItem icon={pinned ? "pin--filled" : "pin"} onSelect={run("pin")}>
            {pinned ? "Unpin" : "Pin"}
          </AdaptiveMenuItem>
          <AdaptiveMenuItem icon={remindAt ? "notification--filled" : "notification"} onSelect={onRemind}>
            {remindAt ? `${remindLabel(remindAt)}…` : "Remind me…"}
          </AdaptiveMenuItem>
          <AdaptiveMenuItem icon="color-palette" onSelect={onColor}>
            {`${colorLabel(color ?? null)}…`}
          </AdaptiveMenuItem>
          <AdaptiveMenuSeparator />
        </>
      )}
      <AdaptiveMenuItem icon={a.archived ? "reset" : "archive"} onSelect={run("archive")}>
        {a.archived ? "Unarchive" : "Archive"}
      </AdaptiveMenuItem>
      {!a.locked && !a.guest && (
        <AdaptiveMenuItem icon="user--follow" onSelect={run("share")}>
          {a.shared ? "Sharing…" : "Share…"}
        </AdaptiveMenuItem>
      )}
      {a.guest && (
        <AdaptiveMenuItem icon="copy--file" onSelect={run("keepCopy")}>
          Keep as my own note
        </AdaptiveMenuItem>
      )}
      {(!a.locked || a.unlocked) && (
        <AdaptiveMenuItem icon="copy" onSelect={run("copy")}>
          Copy as Markdown
        </AdaptiveMenuItem>
      )}
      <AdaptiveMenuItem icon="chart--network" onSelect={run("showOnMap")}>
        Show on the map
      </AdaptiveMenuItem>
      {/* A shared note can't be locked, and a locked note can't be shared: only what applies shows. */}
      {!a.shared && !a.locked && (
        <AdaptiveMenuItem icon="locked" onSelect={run("lock")}>
          Lock note
        </AdaptiveMenuItem>
      )}
      {a.locked && a.unlocked && (
        <>
          <AdaptiveMenuItem icon="locked" onSelect={run("lockNow")}>
            Lock now
          </AdaptiveMenuItem>
          <AdaptiveMenuItem icon="unlocked" onSelect={run("removeLock")}>
            Remove lock
          </AdaptiveMenuItem>
        </>
      )}
      <AdaptiveMenuSeparator />
      <AdaptiveMenuItem icon="trash-can" variant="destructive" onSelect={run("del")}>
        Delete
      </AdaptiveMenuItem>
    </AdaptiveMenu>
  )
}

/** TAG: a small layer with one field; the tags already in use are its suggestions. */
function TagButton({ tags, onAdd }: { tags: string[]; onAdd: (tag: string) => void }) {
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState("")
  const { data: known = [] } = useNoteTags()
  const add = () => {
    const t = typed.trim().replace(/^#+/, "")
    setTyped("")
    setOpen(false)
    if (t && !tags.some((x) => x.toLowerCase() === t.toLowerCase())) onAdd(t)
  }
  return (
    <AdaptivePopover
      open={open}
      onOpenChange={setOpen}
      title="Tag"
      align="start"
      trigger={
        <Button variant="ghost" size="sm" aria-label="Tag">
          Tag
        </Button>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
      >
        <TextField label="Tag" placeholder="trip" value={typed} onChange={(e) => setTyped(e.target.value)} list="note-tags" autoComplete="off" />
        <datalist id="note-tags">
          {known
            .filter((k) => !tags.includes(k.tag))
            .map((k) => (
              <option key={k.tag} value={k.tag} />
            ))}
        </datalist>
        <div className="flex justify-end">
          <Button type="submit" disabled={!typed.trim()}>
            Add tag
          </Button>
        </div>
      </form>
    </AdaptivePopover>
  )
}

/** Notes that link here with `[[this title]]`, one tap away (ADR-0034): LINKED FROM, then each as a chip. */
function LinkedFrom({ id }: { id: string }) {
  const { data: back = [] } = useNoteBacklinks(id)
  const setOpenNote = useUi((s) => s.setOpenNote)
  if (back.length === 0) return null
  return (
    <section aria-label="Linked from" className="flex flex-col gap-2">
      <p className="type-overline text-muted-foreground">Linked from</p>
      <div className="flex flex-wrap items-center gap-2">
        {back.map((n) => (
          <span key={n.id} className="flex max-w-64">
            <Chip variant="outline">
              <ChipAction onClick={() => setOpenNote({ id: n.id, fresh: false })}>
                <Icon name="document" />
                <span>{n.title || "New note"}</span>
              </ChipAction>
            </Chip>
          </span>
        ))}
      </div>
    </section>
  )
}

function LinkChip({ link, onOpen, onRemove }: { link: NoteLink; onOpen: (target: string) => void; onRemove: () => void }) {
  const here = !!link.target
  return (
    <span className="flex max-w-64">
      <Chip variant="outline" data-role="note-link">
        <Tooltip>
          <TooltipTrigger render={<ChipAction disabled={!here} onClick={() => link.target && onOpen(link.target)} />}>
            <Icon name={LINK_ICON[link.kind]} />
            <span>{link.label || "(untitled)"}</span>
          </TooltipTrigger>
          <TooltipContent>{here ? `Open ${link.kind === "thread" ? "conversation" : link.kind}` : "Not on this device"}</TooltipContent>
        </Tooltip>
        <ChipRemove label={`Unlink ${link.label}`} onClick={onRemove} />
      </Chip>
    </span>
  )
}

/** The note's reminder (ADR-0039): when it comes back, or that it is due, and DONE to put it away. */
function ReminderChip({ at, onDone }: { at: number; onDone: () => void }) {
  const now = useNowSecs(30_000)
  const due = at <= now
  return (
    <Chip variant="outline" data-role="note-reminder" data-due={due || undefined}>
      <Icon name={due ? "notification--filled" : "time"} />
      {due ? `Due · ${reminderLabel(at)}` : reminderLabel(at)}
      <ChipAction aria-label="Done with this reminder" onClick={onDone}>
        Done
      </ChipAction>
    </Chip>
  )
}

