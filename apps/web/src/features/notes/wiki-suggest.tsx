import type { Editor } from "@tiptap/react"

import { Icon } from "@unicron/ui"
import { cn } from "@/lib/utils"

import type { Choice, WikiQuery } from "./wiki-links"

/**
 * The list under `[[`, beside the cursor (brief N2): the matching notes, then a new note by
 * that title. Drawn as unicron draws a menu: solid, square, a hairline round it, no shadow.
 * Clicks keep focus in the editor.
 */
export function WikiSuggest({ editor, q, choices, active, onPick }: { editor: Editor; q: WikiQuery; choices: Choice[]; active: number; onPick: (c: Choice) => void }) {
  if (choices.length === 0) return null
  const c = editor.view.coordsAtPos(q.from)
  // Keep it on screen on a phone.
  const pos = { top: c.bottom + 4, left: Math.max(8, Math.min(c.left, window.innerWidth - 288)) }
  return (
    <div
      role="listbox"
      id="wiki-suggest"
      aria-label="Link to a note"
      className="fixed z-50 flex w-72 flex-col overflow-hidden rounded bg-popover p-1 text-popover-foreground rule-box"
      style={{ top: pos.top, left: pos.left }}
      onMouseDown={(e) => e.preventDefault()}
    >
      {choices.map((choice, i) => (
        <div
          key={`${choice.isNew}:${choice.title}`}
          id={`wiki-choice-${i}`}
          role="option"
          aria-selected={i === active}
          className={cn("flex min-h-9 cursor-pointer items-center gap-2 rounded px-2 type-ui", i === active && "bg-accent text-accent-foreground")}
          onClick={() => onPick(choice)}
        >
          <Icon name={choice.isNew ? "notebook" : "document"} tone="muted" size="sm" />
          <span className="truncate">{choice.isNew ? `New note “${choice.title}”` : choice.title}</span>
        </div>
      ))}
    </div>
  )
}
