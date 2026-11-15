import { useId, useState } from "react"

import { Button, IconButton, InitialTile, TextField } from "@unicron/ui"

import { initials } from "../mail/format"
import { rowTime } from "../mail/row-time"

/** One comment or team note, as the list below draws it. */
export interface CommentItem {
  id: string
  author: string
  /** Unix seconds. */
  at: number
  text: string
  /** The person reading may delete it: their own, or anyone's for a shared inbox's owner. */
  deletable: boolean
}

/**
 * A comment (contract 5.1b #58, app-level in Vale until Unicron has one; brief M9): the writer's
 * Initial Tile S, their name, the time, the text, and DELETE where the reader may take it back.
 * Built from core parts and type roles only, so it moves to Unicron's part without a change of look.
 */
export function CommentRow({ comment, label, onDelete }: { comment: CommentItem; label: string; onDelete?: () => void }) {
  return (
    <li className="flex gap-3 rule-t py-4" data-role="team-comment" aria-label={`${label} from ${comment.author}`}>
      <InitialTile size="s" initials={initials({ name: comment.author, email: comment.author })} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="flex min-w-0 items-baseline gap-2">
          <span className="truncate type-ui-emphasis text-foreground">{comment.author}</span>
          <span className="shrink-0 type-meta text-muted-foreground">{rowTime(comment.at)}</span>
        </p>
        <p className="type-body break-words whitespace-pre-wrap text-foreground">{comment.text}</p>
      </div>
      {onDelete && comment.deletable && <IconButton icon="trash-can" label={`Delete ${label.toLowerCase()}`} tooltip={`Delete ${label.toLowerCase()}`} size="icon-sm" variant="ghost-muted" onClick={onDelete} />}
    </li>
  )
}

/**
 * The team's comments or notes, then a plain multi-line field and a secondary button to add one, then the one
 * line that says where they go (brief M9). A plain text field with its own button, never the reply field, so a
 * note can never go out as mail. Read-only (a stopped share) shows the list alone.
 */
export function CommentThread({
  comments,
  label,
  placeholder,
  addLabel,
  caption,
  empty,
  readOnly = false,
  onAdd,
  onDelete,
}: {
  comments: CommentItem[]
  /** What one is: "Comment" or "Note". Names the list, the field and each row. */
  label: string
  placeholder: string
  /** The button's word: "Add comment", "Add note". */
  addLabel: string
  /** Where they go: "Comments stay with the team." */
  caption: string
  /** With none yet. */
  empty: string
  readOnly?: boolean
  onAdd: (text: string) => void | Promise<unknown>
  onDelete: (id: string) => void
}) {
  const [text, setText] = useState("")
  const [busy, setBusy] = useState(false)
  const captionId = useId()
  const post = async () => {
    const said = text.trim()
    if (!said || busy) return
    setBusy(true)
    try {
      await onAdd(said)
      setText("")
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex flex-col gap-4">
      {comments.length === 0 ? (
        <p className="type-body text-muted-foreground">{empty}</p>
      ) : (
        <ol aria-label={`${label}s`} className="flex flex-col">
          {comments.map((c) => (
            <CommentRow key={c.id} comment={c} label={label} onDelete={readOnly ? undefined : () => onDelete(c.id)} />
          ))}
        </ol>
      )}
      {!readOnly && (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            void post()
          }}
        >
          <TextField
            multiline
            minRows={3}
            aria-label={label}
            aria-describedby={captionId}
            placeholder={placeholder}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              // ⌘ or Ctrl + Return adds it, as a form's yes (brief 4.0); Return makes a new line.
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                void post()
              }
            }}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p id={captionId} className="type-caption text-muted-foreground">
              {caption}
            </p>
            <Button type="submit" variant="secondary" size="sm" disabled={!text.trim()} loading={busy} aria-keyshortcuts="Control+Enter Meta+Enter">
              {addLabel}
            </Button>
          </div>
        </form>
      )}
      {readOnly && <p className="type-caption text-muted-foreground">{caption}</p>}
    </div>
  )
}
