import { useEditorState, type Editor } from "@tiptap/react"
import { useRef, useState, type ReactNode, type RefObject } from "react"

import { AdaptivePopover, Button, TextField, Toolbar, ToolbarSeparator, ToolbarToggle } from "@unicron/ui"

import { SAFE_LINK } from "./use-rich-editor"

/**
 * The format bar (ADR-0089; briefs M6, N2, T3 and 1.4): unicron's Toolbar of
 * toggles over a Tiptap editor. Bold, Italic, Link, Bulleted list, Numbered
 * list, Quote, Code; notes opt into Heading and Checklist and add their own
 * actions at the end. One Tab stop: the arrow keys move along it.
 *
 * `mode` says where it stands:
 * - `field` (default): on the bottom edge of the field's box.
 * - `docked`: at the foot of a column that scrolls (the note).
 * - `keyboard`: a phone's bar, held just above the on-screen keyboard
 *   (`--keyboard-inset`), with 40 px buttons, scrolling sideways.
 *
 * A press on the bar never takes focus (or the phone's keyboard) from the text.
 */

const mod = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl+"

export type FormatBarMode = "field" | "docked" | "keyboard"

export function FormatBar({
  editor,
  heading = false,
  checklist = false,
  actions,
  mode = "field",
}: {
  editor: Editor
  /** Notes: a Heading toggle, first. */
  heading?: boolean
  /** Notes: a Checklist toggle, after the lists. */
  checklist?: boolean
  /** More actions at the end, after a hairline: `ToolbarButton`s (link to a note, add image, scan, sketch). */
  actions?: ReactNode
  mode?: FormatBarMode
}) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      link: e.isActive("link"),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      quote: e.isActive("blockquote"),
      heading: e.isActive("heading"),
      task: e.isActive("taskList"),
      code: e.isActive("code") || e.isActive("codeBlock"),
    }),
  })
  const bar = useRef<HTMLDivElement>(null)
  const chain = () => editor.chain().focus()
  // A schema with code blocks (notes) sets the block; mail marks the words.
  const blockCode = !!editor.schema.nodes.codeBlock

  return (
    <div ref={bar} data-slot="format-bar" data-mode={mode} className="format-bar" onMouseDown={(e) => e.preventDefault()}>
      <Toolbar aria-label="Formatting" size={mode === "keyboard" ? "default" : "sm"}>
        {heading && <ToolbarToggle icon="heading" label="Heading" pressed={state.heading} onPressedChange={() => chain().toggleHeading({ level: 2 }).run()} />}
        <ToolbarToggle icon="text--bold" label="Bold" shortcut={`${mod}B`} pressed={state.bold} onPressedChange={() => chain().toggleBold().run()} />
        <ToolbarToggle icon="text--italic" label="Italic" shortcut={`${mod}I`} pressed={state.italic} onPressedChange={() => chain().toggleItalic().run()} />
        <LinkControl editor={editor} active={state.link} within={bar} />
        <ToolbarSeparator />
        <ToolbarToggle icon="list--bulleted" label="Bulleted list" pressed={state.bullet} onPressedChange={() => chain().toggleBulletList().run()} />
        <ToolbarToggle icon="list--numbered" label="Numbered list" pressed={state.ordered} onPressedChange={() => chain().toggleOrderedList().run()} />
        {checklist && <ToolbarToggle icon="list--checked" label="Checklist" pressed={state.task} onPressedChange={() => chain().toggleTaskList().run()} />}
        <ToolbarToggle icon="quotes" label="Quote" pressed={state.quote} onPressedChange={() => chain().toggleBlockquote().run()} />
        <ToolbarToggle icon="code" label="Code" pressed={state.code} onPressedChange={() => (blockCode ? chain().toggleCodeBlock() : chain().toggleCode()).run()} />
        {actions && (
          <>
            <ToolbarSeparator />
            {actions}
          </>
        )}
      </Toolbar>
    </div>
  )
}

/** Link: a toggle that opens the link's address in a popover (a sheet on a phone), with APPLY and REMOVE. */
function LinkControl({ editor, active, within }: { editor: Editor; active: boolean; within: RefObject<HTMLDivElement | null> }) {
  const [open, setOpen] = useState(false)
  // Stops passing focus on: the layer opened again, or the hand-back never came.
  const waiting = useRef<(() => void) | null>(null)
  const change = (next: boolean) => {
    waiting.current?.()
    setOpen(next)
  }
  const done = () => {
    change(false)
    // The layer hands focus back to its button once it has closed; the writer was in the text, so pass it on.
    const button = within.current?.querySelector<HTMLElement>("[data-format-link]")
    if (!button) return
    const pass = () => (stop(), editor.commands.focus())
    const timer = setTimeout(() => stop(), 1000)
    const stop = () => {
      clearTimeout(timer)
      button.removeEventListener("focus", pass)
      waiting.current = null
    }
    button.addEventListener("focus", pass)
    waiting.current = stop
  }
  return (
    <AdaptivePopover open={open} onOpenChange={change} title="Link" align="start" trigger={<ToolbarToggle icon="link" label="Link" pressed={active || open} data-format-link="" />}>
      {open && <LinkForm editor={editor} active={active} onDone={done} />}
    </AdaptivePopover>
  )
}

// Mounted while the popover is open, so each opening starts on the link under the cursor.
function LinkForm({ editor, active, onDone }: { editor: Editor; active: boolean; onDone: () => void }) {
  const [url, setUrl] = useState(() => (editor.getAttributes("link").href as string | undefined) ?? "")
  const [refused, setRefused] = useState(false)
  // The words chosen when the layer opened. Focus comes back to the text from the layer's field, and the
  // browser may move the caret on the way, so the change goes to these words, not to wherever it lands.
  const [range] = useState(() => ({ from: editor.state.selection.from, to: editor.state.selection.to }))
  const chain = () => editor.chain().focus().setTextSelection(range)

  const remove = () => {
    chain().extendMarkRange("link").unsetLink().run()
    onDone()
  }
  const apply = () => {
    const typed = url.trim()
    if (!typed) return active ? remove() : onDone()
    const href = /^[a-z][a-z0-9+.-]*:/i.test(typed) ? typed : typed.includes("@") && !typed.includes("/") ? `mailto:${typed}` : `https://${typed}`
    // Keep the field open on a refused scheme, so the writer sees why nothing happened.
    if (!SAFE_LINK.test(href)) return setRefused(true)
    if (range.from === range.to && !active) {
      // Nothing selected: the address itself becomes the link's text.
      chain().insertContent({ type: "text", text: typed, marks: [{ type: "link", attrs: { href } }] }).run()
    } else {
      chain().extendMarkRange("link").setLink({ href }).run()
    }
    onDone()
  }

  return (
    <div
      className="flex flex-col gap-4"
      // Not a form: this can stand inside the composer's form. Enter applies; no key here is the form's.
      onKeyDown={(e) => {
        if (e.key === "Enter" && e.target instanceof HTMLInputElement) {
          e.preventDefault()
          apply()
        }
        if (e.key !== "Escape") e.stopPropagation()
      }}
    >
      <TextField
        label="Link address"
        value={url}
        onChange={(e) => (setUrl(e.target.value), setRefused(false))}
        placeholder="https://… or name@example.com"
        inputMode="url"
        autoComplete="off"
        error={refused ? "Only web and email links." : undefined}
      />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" disabled={!active} onClick={remove}>
          Remove
        </Button>
        <Button type="button" onClick={apply}>
          Apply
        </Button>
      </div>
    </div>
  )
}
