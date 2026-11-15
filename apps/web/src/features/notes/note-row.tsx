import { Highlight, Icon, ListRow } from "@unicron/ui"
import type { NoteSummary } from "@/core/types"
import { noteSwatch, swatchSquare } from "@/lib/swatches"

import { NOTE_COLOR_LABEL } from "./note-color"
import { editedLabel, noteDetail, noteTag, rowTime } from "./note-meta"

export interface NoteRowProps {
  note: NoteSummary
  onOpen: () => void
  /** The note open beside the list. */
  selected?: boolean
  /** The words a search matched: marked in the title and the snippet. */
  query?: string
  /**
   * The notes list's own row (brief N1, Mobile / 14): the color's square, the
   * mono detail, one tag at the end, and no snippet. `due`: its reminder has
   * passed. `items`: its checklist items, done ones too.
   */
  list?: { due?: boolean; items?: number }
}

const shared = (n: NoteSummary) => !!n.share && !n.share.revoked

/**
 * A note as a row (ADR-0085, ADR-0105): the core's `NoteSummary` on unicron's
 * inline row. Search lists it compact, with its snippet; the notes list passes
 * `list`. A locked note shows its title only, as everywhere.
 */
export function NoteRow({ note: n, onOpen, selected, query, list }: NoteRowProps) {
  const title = n.title || "New note"
  if (list) return <ListedNote note={n} title={title} onOpen={onOpen} selected={selected} due={!!list.due} items={list.items} />
  const snippet = n.locked ? "Locked" : n.snippet
  return (
    <ListRow
      size="compact"
      selected={selected}
      onClick={onOpen}
      title={query ? <Highlight text={title} query={query} /> : title}
      marks={
        n.pinned || n.locked || shared(n) ? (
          <>
            {n.pinned && <Icon name="pin--filled" size="sm" label="Pinned" />}
            {n.locked && <Icon name="locked" tone="muted" size="sm" label="Locked" />}
            {shared(n) && <Icon name="user--multiple" tone="muted" size="sm" label={n.share?.role === "guest" ? `Shared by ${n.share.from ?? "someone"}` : "Shared"} />}
          </>
        ) : undefined
      }
      // The clock time or the weekday, as the Notes list and Mail's rows write it (decisions §13), in the mono meta.
      meta={rowTime(n.updated)}
      status={n.archived ? "Archived" : undefined}
      detail={snippet ? query && !n.locked ? <Highlight text={snippet} query={query} /> : snippet : undefined}
    />
  )
}

function ListedNote({ note: n, title, onOpen, selected, due, items }: { note: NoteSummary; title: string; onOpen: () => void; selected?: boolean; due: boolean; items?: number }) {
  const square = swatchSquare(noteSwatch(n.color))
  const detail = noteDetail(n, items)
  const tag = noteTag(n, due)
  return (
    <ListRow
      selected={selected}
      onClick={onOpen}
      // The color's square stands after the title, not in the leading column: that column is the 40 px index's,
      // and would set colored titles 48 px in from the rest (a unicron gap, ADR-0105).
      marks={square ? <span aria-hidden data-role="note-swatch" className={square} /> : undefined}
      // The color is said after the name, so a row is still found by its title first.
      title={
        <>
          {title}
          {n.color && <span className="sr-only">, {NOTE_COLOR_LABEL[n.color]}</span>}
        </>
      }
      metaStyle="plain"
      meta={
        <>
          {editedLabel(n)}
          {detail && " // "}
          {detail && "text" in detail && detail.text}
          {detail && "reminder" in detail && (
            <>
              <Icon name="time" size="sm" label="Reminder" /> {rowTime(detail.reminder)}
            </>
          )}
        </>
      }
      status={tag ?? undefined}
    />
  )
}
