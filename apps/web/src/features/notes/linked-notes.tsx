import { useUi } from "@/app/ui-store"
import { Button, IconButton, ListRow, SectionHeader } from "@unicron/ui"
import { getCoreClient } from "@/core/client"
import { useLinkedNotes } from "@/core/queries"
import type { NoteTarget } from "@/core/types"

import { rowTime } from "./note-meta"
import { useNewNote } from "./use-new-note"

/**
 * Notes attached to an event, a person, or a conversation, with a way to
 * start one. Shown in their detail panes: meeting notes sit with the meeting.
 * A section of its own, as the panes' other sections are (ADR-0115): NOTES
 * with its count and actions ("NOTES // 00" when there are none), and
 * compact rows with the edit time in the notes list's words.
 */
export function LinkedNotes({ target, title }: { target: NoteTarget; title: string }) {
  const { data: notes = [] } = useLinkedNotes(target)
  const jumpTo = useUi((s) => s.jumpTo)
  const openQuickNote = useUi((s) => s.openQuickNote)
  const newNote = useNewNote()

  const start = async () => {
    const link = await (await getCoreClient()).noteLinkFor(target)
    await newNote({ markdown: `# ${title}\n\n`, links: link ? [link] : [] })
  }

  return (
    <section className="flex w-full flex-col gap-2 text-left" aria-label="Notes">
      <SectionHeader
        title="Notes"
        count={notes.length}
        level={3}
        action={
          <span className="flex items-center gap-1">
            {/* Stays here: a sheet, saved on close (ADR-0037). New note opens the full editor in Notes. */}
            <IconButton label="Quick note" icon="edit" size="icon-sm" onClick={() => openQuickNote({ ...target, label: title })} />
            <Button variant="ghost" size="sm" onClick={() => void start()}>
              New note
            </Button>
          </span>
        }
      />
      {notes.length === 0 ? (
        // The heading says NOTES // 00; one quiet line under it, not a second empty state.
        <p className="type-caption text-text-secondary">No notes yet.</p>
      ) : (
        <ul className="flex flex-col">
          {notes.map((n) => (
            <li key={n.id}>
              <ListRow size="compact" title={n.title || "New note"} meta={rowTime(n.updated)} onClick={() => jumpTo({ kind: "note", id: n.id })} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
