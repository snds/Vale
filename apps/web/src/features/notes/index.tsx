import { type ReactNode, useMemo, useState } from "react"

import { factTime, useRefresh, useScreenFact, useScreenPlace } from "@/app/screen"
import { useSectionBanner } from "@/app/section-banner"
import { useSectionSwitcher } from "@/app/places"
import { SectionSwitcher } from "@/app/section-switcher"
import { useUi } from "@/app/ui-store"
import { vertical } from "@/app/verticals"
import {
  AppFrameInset,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  FilterChip,
  FilterChipGroup,
  Icon,
  IconButton,
  SectionHeader,
  Skeleton,
  Tile,
  formatNavCount,
  toast,
  useAppFrame,
} from "@unicron/ui"
import { LoadState } from "@/components/load-state"
import { MasterDetail } from "@/components/master-detail"
import { ScreenHead } from "@/components/page"
import { getCoreClient } from "@/core/client"
import { useNoteAction, useNotes, useNotesPrefs } from "@/core/queries"
import type { NoteSummary, NotesPrefs } from "@/core/types"
import { useNowSecs } from "@/hooks/use-now"
import { noteSwatch, swatchId } from "@/lib/swatches"

import { ImportDialog } from "./import-dialog"
import { NOTE_COLOR_LABEL } from "./note-color"
import { NoteDetailPane } from "./note-detail"
import { NoteFolderEditor } from "./note-folders"
import { NoteGraphView } from "./note-graph"
import { NoteCover } from "./note-image"
import { editedLabel, noteTag, useNoteItemCounts } from "./note-meta"
import { NoteRow } from "./note-row"
import { NotesNav } from "./notes-nav"
import { closeSharedNote, useOpenSharedNote } from "./open-shared-note"
import { closeSyncSetup, openSyncSetup, useSyncSetup } from "./open-sync-setup"
import { RelayDialog } from "./relay-dialog"
import { OpenSharedDialog } from "./share-dialog"
import { type SyncStatus, useSyncStatus } from "./sync"
import { useNotesPlace } from "./use-notes-place"

/** The relay's state as the status line says it (brief N1). The line sets the capitals. */
const RELAY_FACT: Record<SyncStatus, string> = { off: "Sync off", connecting: "Connecting", synced: "Synced", error: "Not synced" }

type View = "list" | "cards" | "map"

export function NotesView() {
  // In the shared store, so a jump (a new note, or a link from mail,
  // calendar, or contacts) can open a note from anywhere.
  const selected = useUi((s) => s.openNote)
  const setSelected = useUi((s) => s.setOpenNote)
  const frame = useAppFrame()
  // Notes' place (ADR-0084): a folder, narrowed by one tag. A folder or a tag that is gone just stops filtering.
  const { place, folder: activeFolder, name: placeName } = useNotesPlace()
  const tag = place.tag
  const archived = place.folder.kind === "archive"
  const pinnedOnly = place.folder.kind === "pinned"
  const [importing, setImporting] = useState(false)
  // Opened by their intents, so the folders list and the command menu reach them too.
  const relayOpen = useSyncSetup((s) => s.open)
  const openingShared = useOpenSharedNote((s) => s.open)
  // Finding a note by its words is Search's (ADR-0085); the list is the folder, narrowed by the tag.
  const noteQuery = { search: null, tag, archived, folder: archived ? null : (activeFolder?.id ?? null) }
  const { data: found = [], isPending, error, refetch, isRefetching } = useNotes(noteQuery)
  // Pinned is a place the core has no query for: the same read, narrowed here.
  const notes = pinnedOnly ? found.filter((n) => n.pinned) : found
  const items = useNoteItemCounts()
  const sync = useSyncStatus()
  const { data: prefs } = useNotesPrefs()
  const setPrefs = useNoteAction((c, change: Partial<NotesPrefs>) => c.setNotesPrefs({ sortChecked: true, ...prefs, ...change }))
  // The map (ADR-0053) wins over cards (ADR-0038), which keep their choice underneath it.
  const view: View = prefs?.graph ? "map" : prefs?.grid ? "cards" : "list"
  const setView = (v: View) => setPrefs.mutate(v === "map" ? { graph: true } : { graph: false, grid: v === "cards" })

  // Every note as a Markdown file with front matter, as Obsidian reads them (ADR-0034).
  const exportAll = async () => {
    try {
      toast.success(`Notes saved to ${await (await getCoreClient()).exportNotes()}`, { duration: 4000 })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    }
  }

  // A reminder that has come due lifts its note above everything, pinned
  // included, until it's marked done (ADR-0039).
  const now = useNowSecs(30_000)
  const isDue = (n: NoteSummary) => !!n.remindAt && n.remindAt <= now
  const due = archived ? [] : notes.filter(isDue).sort((a, b) => a.remindAt! - b.remindAt!)
  const pinned = notes.filter((n) => n.pinned && !due.includes(n))
  const rest = notes.filter((n) => !n.pinned && !due.includes(n))
  const sections = [
    { label: "Due", notes: due },
    { label: "Pinned", notes: pinned },
    { label: "Recent", notes: rest },
  ].filter((s) => s.notes.length > 0)

  const open = (n: NoteSummary) => setSelected({ id: n.id, fresh: false })

  // What the shell says about this screen (ADR-0083): the folder as the place; the relay's state, and when a note here was last edited.
  useScreenPlace(placeName)
  const edited = notes.reduce((latest, n) => Math.max(latest, n.updated), 0)
  useScreenFact([RELAY_FACT[sync.status], edited ? `edited ${factTime(edited)}` : null].filter(Boolean).join(" // "))
  useRefresh(refetch)
  // A relay that refused or failed (brief N1; channel 4): one critical banner over Notes, with the way to fix it.
  const banner = useMemo(
    () => (sync.status === "error" ? { title: "Notes didn't sync", body: sync.error ?? undefined, action: { label: "Open sync", onClick: openSyncSetup } } : null),
    [sync.status, sync.error],
  )
  useSectionBanner("notes", banner)
  // The page head opens the folders and tags wherever the sidebar does not list them (brief X1).
  const switching = useSectionSwitcher("Change folder or tag.")
  const headName = place.folder.kind === "all" ? "Notes" : placeName
  const overline = [headName, tag ? `#${tag}` : null, isPending || error ? null : formatNavCount(notes.length)].filter(Boolean).join(" // ")

  const empty = <NotesEmpty place={place.folder.kind} name={placeName} tag={tag} onImport={() => setImporting(true)} />
  const body =
    isPending ? (
      <AppFrameInset>
        <div className="flex flex-col gap-5 pt-2" aria-busy="true" aria-label="Loading notes">
          <Skeleton variant="row" />
          <Skeleton variant="row" />
          <Skeleton variant="row" />
        </div>
      </AppFrameInset>
    ) : view === "map" ? (
      <NoteGraphView query={noteQuery} selectedId={selected?.id ?? null} onOpenNote={(id) => setSelected({ id, fresh: false })} />
    ) : (
      <LoadState place="your notes" overline={headName} error={error} hasData={found.length > 0} onRetry={() => void refetch()} retrying={isRefetching}>
        {notes.length === 0 ? (
          empty
        ) : (
          <div data-role="notes-list" className="flex flex-col gap-4 pb-6">
            {sections.map((s) => (
              <section key={s.label} aria-label={s.label} className="flex flex-col">
                <AppFrameInset>
                  <SectionHeader title={s.label} count={s.notes.length} level={3} />
                </AppFrameInset>
                {view === "cards" ? (
                  <AppFrameInset>
                    <Cards columns={frame.phone || !!selected ? 2 : frame.layout === "medium" ? 3 : 4}>
                      {s.notes.map((n) => (
                        <NoteTile key={n.id} note={n} due={isDue(n)} selected={n.id === selected?.id} onOpen={() => open(n)} />
                      ))}
                    </Cards>
                  </AppFrameInset>
                ) : (
                  <div role="list" aria-label={`${s.label} notes`} className="flex flex-col">
                    {s.notes.map((n) => (
                      <div role="listitem" key={n.id}>
                        <NoteRow note={n} selected={n.id === selected?.id} onOpen={() => open(n)} list={{ due: isDue(n), items: items.get(n.id) }} />
                      </div>
                    ))}
                  </div>
                )}
              </section>
            ))}
          </div>
        )}
      </LoadState>
    )

  return (
    <>
      <MasterDetail
        section="Notes"
        pick={vertical("notes").pick}
        listFills={view !== "list"}
        onBack={() => setSelected(null)}
        header={
          <ScreenHead
            overline={overline}
            title={headName}
            switcher={switching.switcher}
            actions={
              <>
                {/* LIST · CARDS · MAP: the head's own choice from medium width up; a phone has it in the Folders sheet (brief X1). */}
                {!frame.phone && (
                  <FilterChipGroup label="View" value={view} onValueChange={(v) => setView(v as View)}>
                    <FilterChip value="list">List</FilterChip>
                    <FilterChip value="cards">Cards</FilterChip>
                    <FilterChip value="map">Map</FilterChip>
                  </FilterChipGroup>
                )}
                {/* Set-up, until it moves to Settings › Notes (brief T5, c8). */}
                <DropdownMenu>
                  <DropdownMenuTrigger render={<IconButton label="More" icon="overflow-menu--horizontal" />} />
                  <DropdownMenuContent align="end" width="auto">
                    <DropdownMenuItem onClick={() => setImporting(true)}>
                      <Icon name="document--import" /> Import notes…
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => void exportAll()}>
                      <Icon name="download" /> Export all as Markdown
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={openSyncSetup}>
                      <Icon name="renew" /> Sync between devices…
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuCheckboxItem checked={prefs?.sortChecked ?? true} onCheckedChange={(on) => setPrefs.mutate({ sortChecked: on })}>
                      <Icon name="list--checked" /> Move checked items down
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuCheckboxItem checked={prefs?.readImageText ?? true} onCheckedChange={(on) => setPrefs.mutate({ readImageText: on })}>
                      <Icon name="scan--alt" /> Find text in images
                    </DropdownMenuCheckboxItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            }
            below={
              <SectionSwitcher state={switching} overline={["Notes", place.folder.kind === "all" ? null : placeName, tag ? `#${tag}` : null].filter(Boolean).join(" // ")} title="Folders">
                <NotesNav layer more={switching.sheet} />
              </SectionSwitcher>
            }
          />
        }
        list={body}
        // The note's color no longer tints the pane (DC3, ADR-0105): it is the row's square and the card's edge.
        detail={selected && <NoteDetailPane key={selected.id} id={selected.id} fresh={selected.fresh} onClosed={() => setSelected(null)} />}
      />
      <ImportDialog open={importing} onOpenChange={setImporting} />
      <RelayDialog open={relayOpen} onOpenChange={(o) => !o && closeSyncSetup()} />
      <OpenSharedDialog open={openingShared} onOpenChange={(o) => !o && closeSharedNote()} />
      <NoteFolderEditor />
    </>
  )
}

/** The empty list, by where it is (brief 5.2). */
function NotesEmpty({ place, name, tag, onImport }: { place: "all" | "pinned" | "folder" | "archive"; name: string; tag: string | null; onImport: () => void }) {
  if (tag) return <EmptyState overline={`#${tag} // 00`} title="No notes match." />
  if (place === "archive") return <EmptyState overline="Archive // 00" title="No archived notes." />
  if (place === "pinned") return <EmptyState overline="Pinned // 00" title="Nothing pinned." body="Pin a note from its menu to keep it here." />
  if (place === "folder") return <EmptyState overline={`${name} // 00`} title={`No notes in ${name} yet.`} body="They join when they match." />
  return <EmptyState overline="Notes // 00" title="No notes yet." body="Start one, or bring them in from another app." actionLabel="Import" onAction={onImport} />
}

/** Tiles in even columns (brief N1): 2 on a phone or beside an open note, 3 at medium width, 4 on a desktop. */
function Cards({ columns, children }: { columns: 2 | 3 | 4; children: ReactNode }) {
  const grid = columns === 2 ? "grid-cols-2" : columns === 3 ? "grid-cols-3" : "grid-cols-4"
  return (
    <div role="list" aria-label="Note cards" className={`grid items-start gap-4 pt-2 ${grid}`}>
      {children}
    </div>
  )
}

/**
 * A note as a card (brief N1): a 4 px top edge in the note's swatch, the
 * cover image, the title, up to six lines of the snippet, when it was edited
 * and the one tag. A locked note shows its title only.
 */
function NoteTile({ note: n, due, selected, onOpen }: { note: NoteSummary; due: boolean; selected: boolean; onOpen: () => void }) {
  const swatch = noteSwatch(n.color)
  const tag = noteTag(n, due)
  return (
    <div role="listitem" className="min-w-0">
      <Tile swatch={swatch ? swatchId(swatch) : undefined} edge={swatch ? undefined : "none"} size="compact" selected={selected} onClick={onOpen}>
        <span className="flex min-w-0 flex-col gap-2">
          {n.cover && !n.locked && <NoteCover id={n.cover} />}
          <span className="type-subtitle break-words">
            {n.title || "New note"}
            {n.color && <span className="sr-only">, {NOTE_COLOR_LABEL[n.color]}</span>}
          </span>
          {!n.locked && n.snippet && <span className="line-clamp-6 type-caption break-words text-support-foreground">{n.snippet}</span>}
          <span className="flex items-baseline justify-between gap-2 type-meta text-muted-foreground">
            <span className="truncate">{editedLabel(n)}</span>
            {tag && <span className="shrink-0 type-overline">{tag}</span>}
          </span>
        </span>
      </Tile>
    </div>
  )
}
