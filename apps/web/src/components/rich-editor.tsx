import { EditorContent, type Editor } from "@tiptap/react"
import type { ReactNode } from "react"

import { Label, fieldBoxVariants } from "@unicron/ui"
import { cn } from "@/lib/utils"

/**
 * The rich-text field (ADR-0089; briefs M6, T3 and 1.4): the mail schema, the
 * editor hook, and the field itself in the Text Field box with its format bar
 * on the bottom edge. One part for the message being written, a signature, a
 * template and the reply a team writes together. Notes have their own editor
 * and schema and share only the format bar (`format-bar.tsx`). The schema
 * and the hook are in `use-rich-editor.ts`.
 */

/**
 * The field: an overline label, then the Text Field box holding the text and,
 * on its bottom edge, the format bar. `fill` lets it take the room a form
 * leaves (the message). The editor carries the accessible name; the label
 * here is the same words for the eye, and a press on it goes to the text.
 */
export function RichEditor({ editor, label, bar, fill = false }: { editor: Editor; label?: string; bar?: ReactNode; fill?: boolean }) {
  return (
    <div data-slot="rich-editor" className={cn("flex min-w-0 flex-col gap-1", fill && "min-h-0 flex-1")}>
      {label && (
        <Label aria-hidden onClick={() => editor.commands.focus()}>
          {label}
        </Label>
      )}
      <div className={cn(fieldBoxVariants({ focus: "within" }), "flex min-h-0 min-w-0 flex-col", fill && "flex-1")}>
        <EditorContent editor={editor} className="flex min-h-0 flex-1 flex-col overflow-y-auto [&>div]:flex-1" />
        {bar}
      </div>
    </div>
  )
}
