import { HocuspocusProvider } from "@hocuspocus/provider"
import Collaboration from "@tiptap/extension-collaboration"
import { TaskItem } from "@tiptap/extension-list"
import { Placeholder } from "@tiptap/extensions"
import { Extension } from "@tiptap/core"
import type { Node as PMNode } from "@tiptap/pm/model"
import { NodeSelection, Plugin, PluginKey, Selection, TextSelection, type EditorState } from "@tiptap/pm/state"
import { Decoration, DecorationSet } from "@tiptap/pm/view"
import { ySyncPluginKey } from "@tiptap/y-tiptap"
import { type Editor, EditorContent, NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps, useEditor, useEditorState } from "@tiptap/react"
import { useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type Ref } from "react"
import type * as Y from "yjs"

import { AppFrameInset, Checkbox, ToolbarButton, toast, useAppFrame } from "@unicron/ui"
import { FormatBar } from "@/components/format-bar"
import { getCoreClient } from "@/core/client"
import { queryClient, useMyName, useNotes, useNotesPrefs } from "@/core/queries"
import type { NoteDetail, NotesPrefs } from "@/core/types"

import { toBase64 } from "@/lib/base64"
import { prepareImage } from "@/lib/image"
import { type Sketch, SVG_MIME, toSvg } from "@/lib/sketch"

import { SortChecked } from "./checklists"
import { noteExtensions } from "./extensions"
import { NOTE_FILE } from "./note-src"
import { ScanDocument } from "./scan-sheet"
import { SealedProvider } from "./sealed"
import { SketchPad } from "./sketch-sheet"
import { useSketchSheet } from "./sketch-store"
import { guestShares, useLiveShareModes } from "./shared-docs"
import { notesSync, useSyncStatus } from "./sync"
import { type Choice, openWikiLink, pickChoice, useWikiChoices, wikiQueryAt } from "./wiki-links"
import { WikiSuggest } from "./wiki-suggest"
import { linkPlainWikiText, linkTitle } from "./wikilink"
import { isEmpty, loadDoc, markdownOf, seed, stateOf } from "./ydoc"

const SAVE_DELAY = 400

const sortsChecked = () => queryClient.getQueryData<NotesPrefs>(["notes", "prefs"])?.sortChecked ?? true

/** Origins that aren't this person typing: loading, seeding, and other devices. */
const notMine = (origin: unknown) => origin === "load" || origin === "seed" || origin instanceof HocuspocusProvider || origin instanceof SealedProvider

// ── The title (brief N2) ──────────────────────────────────────────────────
//
// A note's title is its first line, as it always was (Apple Notes, ADR-0034's
// links, every list and search). The stored document is unchanged: the title
// is still the first block of the one Yjs document. The screen shows it as a
// field of its own, above the chips, and hides that block in the text below.
// The field edits the block through the editor, so a title typed here syncs
// and merges like any other typing.

/** Marks a change the title field (or the editor's own set-up) makes to the title block. */
const TITLE = new PluginKey("noteTitle")

/** The block that is the title: the first, when it is a line of text (not a list, a quote or an image). */
function titleBlock(doc: PMNode): PMNode | null {
  const first = doc.firstChild
  if (!first || (first.type.name !== "paragraph" && first.type.name !== "heading")) return null
  let image = false
  first.descendants((n) => void (n.type.name === "noteImage" && (image = true)))
  return image ? null : first
}

/** The title as text; a `[[link]]` in it keeps its brackets, so it comes back as a link. */
function titleText(doc: PMNode) {
  const b = titleBlock(doc)
  return b ? b.textBetween(0, b.content.size, "", (leaf) => (leaf.type.name === "wikiLink" ? `[[${leaf.attrs.target as string}]]` : leaf.type.name === "hardBreak" ? " " : "")) : ""
}

/** Where the text after the title starts: a cursor position in the first block after it, or null when there is none. */
function bodyStart(doc: PMNode): number | null {
  const b = titleBlock(doc)
  if (!b) return Selection.atStart(doc).from
  if (doc.childCount < 2) return null
  return Selection.near(doc.resolve(b.nodeSize), 1).from
}

/** Writes the title into its block: only what changed, so another device's typing merges with it. */
function setTitle(editor: Editor, typed: string) {
  const { state } = editor
  const text = typed.replace(/\s*\n\s*/g, " ")
  const tr = state.tr
  const b = titleBlock(state.doc)
  if (b) {
    const from = 1
    const to = 1 + b.content.size
    let plain = true
    b.forEach((n) => void (n.isText || (plain = false)))
    if (plain) {
      const old = b.textContent
      let p = 0
      while (p < old.length && p < text.length && old[p] === text[p]) p++
      let s = 0
      while (s < old.length - p && s < text.length - p && old[old.length - 1 - s] === text[text.length - 1 - s]) s++
      tr.insertText(text.slice(p, text.length - s), from + p, to - s)
    } else if (text) tr.replaceWith(from, to, state.schema.text(text))
    else tr.delete(from, to)
  } else {
    if (!text) return
    tr.insert(0, state.schema.nodes.paragraph!.create(null, state.schema.text(text)))
  }
  if (tr.docChanged) editor.view.dispatch(tr.setMeta(TITLE, true))
}

/** Puts the cursor at the start of the text, making a line for it when the note has only a title. */
function focusBody(editor: Editor) {
  const { state } = editor
  let at = bodyStart(state.doc)
  if (at === null) {
    const tr = state.tr.insert(state.doc.content.size, state.schema.nodes.paragraph!.create()).setMeta(TITLE, true)
    editor.view.dispatch(tr)
    at = bodyStart(editor.state.doc)
  }
  if (at !== null) editor.chain().focus().setTextSelection(at).scrollIntoView().run()
}

/**
 * Keeps the text below the title: no edit made in the text reaches the title
 * block (its own field does that), the cursor never rests in it, and the keys
 * that would cross into it (↑ on the first line, Backspace at the start,
 * Select all) stay below it or go up to the field.
 */
const TitleGuard = Extension.create({
  name: "noteTitleGuard",
  addKeyboardShortcuts() {
    // The title's field stands above the text, in the same note.
    const toTitle = () => {
      const t = this.editor.view.dom.closest("[data-note-writing]")?.querySelector<HTMLTextAreaElement>("textarea[data-note-title]")
      if (!t) return
      t.focus()
      t.setSelectionRange(t.value.length, t.value.length)
    }
    const atBodyStart = (state: EditorState) => {
      const at = titleBlock(state.doc) ? bodyStart(state.doc) : null
      const { empty, $from } = state.selection
      if (at === null || !empty) return null
      return { first: $from.parent === state.doc.resolve(at).parent, start: $from.pos === at }
    }
    return {
      ArrowUp: ({ editor }) => {
        const where = atBodyStart(editor.state)
        if (!where?.first || !editor.view.endOfTextblock("up")) return false
        toTitle()
        return true
      },
      Backspace: ({ editor }) => {
        if (!atBodyStart(editor.state)?.start) return false
        toTitle()
        return true
      },
      "Mod-a": ({ editor }) => {
        const { doc } = editor.state
        const at = titleBlock(doc) ? bodyStart(doc) : null
        if (at === null) return !!titleBlock(doc)
        editor.view.dispatch(editor.state.tr.setSelection(TextSelection.between(doc.resolve(at), Selection.atEnd(doc).$to)))
        return true
      },
    }
  },
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("noteTitleGuard"),
        // The title's own field, the editor's set-up and other devices may change it; the text may not.
        filterTransaction(tr, state) {
          if (!tr.docChanged || tr.getMeta(TITLE) || tr.getMeta(ySyncPluginKey)) return true
          const b = titleBlock(state.doc)
          if (!b) return true
          let end = b.nodeSize
          let touched = false
          for (const step of tr.steps) {
            const map = step.getMap()
            map.forEach((from) => void (from < end && (touched = true)))
            end = map.map(end, -1)
          }
          return !touched
        },
        // The cursor never rests in the hidden block; a selection that starts in it starts at the text instead.
        appendTransaction(_trs, _old, state) {
          const b = titleBlock(state.doc)
          if (!b || state.selection.from >= b.nodeSize || state.doc.childCount < 2) return null
          const { $from } = Selection.near(state.doc.resolve(b.nodeSize), 1)
          return state.tr.setSelection(TextSelection.between($from, state.doc.resolve(Math.max(state.selection.to, $from.pos))))
        },
        props: {
          // The title block is hidden while it is the title; the stylesheet reads this.
          attributes: (state): Record<string, string> => (titleBlock(state.doc) ? { "data-title": "" } : {}),
        },
      }),
    ]
  },
})

interface Missing {
  /** The titles there are, in lower case; null while they are read. */
  titles: Set<string> | null
  decorations: DecorationSet
}
const MISSING = new PluginKey<Missing>("noteMissingLinks")

/**
 * A `[[link]]` to a note that does not exist yet is drawn in the label ink
 * (brief N2): following it starts that note (ADR-0034). The editor is told
 * the titles there are with a transaction that carries them.
 */
const MissingLinks = Extension.create({
  name: "noteMissingLinks",
  addProseMirrorPlugins() {
    const build = (doc: PMNode, titles: Set<string> | null): Missing => {
      if (!titles) return { titles, decorations: DecorationSet.empty }
      const found: Decoration[] = []
      doc.descendants((n, pos) => {
        if (n.type.name === "wikiLink" && !titles.has(linkTitle(n.attrs.target as string).toLowerCase())) found.push(Decoration.node(pos, pos + n.nodeSize, { "data-missing": "" }))
      })
      return { titles, decorations: DecorationSet.create(doc, found) }
    }
    return [
      new Plugin<Missing>({
        key: MISSING,
        state: {
          init: (_config, state) => build(state.doc, null),
          apply: (tr, old, _was, state) => {
            const told = tr.getMeta(MISSING) as Set<string> | undefined
            return told || tr.docChanged ? build(state.doc, told ?? old.titles) : old
          },
        },
        props: { decorations: (state) => MISSING.getState(state)?.decorations },
      }),
    ]
  },
})

/**
 * A checklist row as Mobile / 15 draws it (brief N2): unicron's Checkbox,
 * square, then the item's text, struck through in the label ink once done,
 * with a hairline under the row (notes.css). The box is named by the item's
 * words. In a note shared for reading it cannot be changed.
 */
function CheckRow({ node, updateAttributes, editor }: ReactNodeViewProps) {
  const checked = node.attrs.checked === true
  const editable = useEditorState({ editor, selector: ({ editor: e }) => e.isEditable })
  return (
    <NodeViewWrapper className="note-check">
      <span contentEditable={false} suppressContentEditableWarning className="note-check-box">
        <Checkbox checked={checked} disabled={!editable} aria-label={node.textContent.trim() || "Checklist item"} onCheckedChange={(on) => updateAttributes({ checked: on === true })} />
      </span>
      <NodeViewContent className="note-check-text" />
    </NodeViewWrapper>
  )
}

const ChecklistItem = TaskItem.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CheckRow, { as: "li", attrs: ({ node }) => ({ "data-type": "taskItem", "data-checked": String(node.attrs.checked === true) }) })
  },
}).configure({ nested: true })

/** The editor's extensions: the note's own, with the checklist row drawn in unicron's Checkbox. */
const editorExtensions = noteExtensions.map((e) => (e.name === "taskItem" ? ChecklistItem : e))

/**
 * The phone's add button (Mobile / 15): continues the note with a line of the
 * kind it ends with (a checklist item, a list item, or a paragraph) and puts
 * the cursor there. An empty line already at the end is used as it is.
 */
function addLine(editor: Editor) {
  const { state } = editor
  const { doc, schema } = state
  const b = titleBlock(doc)
  // The editor keeps an empty line at the very end to type into; the note "ends with" what stands before it.
  const trailing = doc.lastChild?.type.name === "paragraph" && doc.lastChild.content.size === 0 && doc.lastChild !== b ? doc.lastChild : null
  const lastIndex = doc.childCount - (trailing ? 2 : 1)
  const last = lastIndex >= 0 ? doc.child(lastIndex) : null
  let lastEnd = 0
  for (let i = 0; i <= lastIndex; i++) lastEnd += doc.child(i).nodeSize
  const tr = state.tr.setMeta(TITLE, true)
  let at: number
  if (last && last !== b && (last.type.name === "taskList" || last.type.name === "bulletList" || last.type.name === "orderedList")) {
    const item = last.lastChild
    // An empty item already at the end is used as it is.
    if (item && !item.textContent.trim() && item.childCount === 1) at = lastEnd - 1 - item.nodeSize + 2
    else {
      const task = last.type.name === "taskList"
      tr.insert(lastEnd - 1, (task ? schema.nodes.taskItem! : schema.nodes.listItem!).create(task ? { checked: false } : null, schema.nodes.paragraph!.create()))
      at = lastEnd - 1 + 2
    }
  } else if (trailing) {
    at = doc.content.size - 1
  } else {
    tr.insert(doc.content.size, schema.nodes.paragraph!.create())
    at = doc.content.size + 1
  }
  tr.setSelection(TextSelection.create(tr.doc, at)).scrollIntoView()
  editor.view.dispatch(tr)
  editor.view.focus()
}

export interface NoteEditorHandle {
  /** The phone's add button. */
  addLine: () => void
}

/**
 * The note's title and text (brief N2), edited as a Yjs document so other
 * devices' edits merge in live. Every change saves Markdown plus Yjs state
 * to the core (after a short pause, and when the note closes).
 *
 * `top` stands above the title (the note's banners and its top line) and
 * `afterTitle` under it (the chips and LINKED FROM). The format bar is docked
 * at the foot of the column; on a phone it shows only while you write, in the
 * bottom row's place, above the keyboard.
 */
export function NoteEditor({
  note,
  autoFocus,
  onSaved,
  locked = false,
  top,
  afterTitle,
  onLeaveText,
  onWriting,
  handle,
}: {
  note: NoteDetail
  autoFocus: boolean
  onSaved: (markdown: string) => void
  locked?: boolean
  top?: ReactNode
  afterTitle?: ReactNode
  /** Esc in the title or the text: focus leaves the writing, so a second Esc can close the note. */
  onLeaveText?: () => void
  /** Whether the title, the text or the format bar has focus: on a phone the bar then takes the bottom row's place. */
  onWriting?: (writing: boolean) => void
  handle?: Ref<NoteEditorHandle>
}) {
  // One document per open note; the parent keys this component by note id.
  const [doc] = useState(() => {
    const d = loadDoc(note.ydoc)
    if (isEmpty(d) && note.share?.role !== "guest") seed(d, note.markdown, note.id)
    return d
  })
  // A note opened for the first time has new Yjs state to save right away.
  // A locked one has none to keep: only its sealed text is saved (ADR-0043).
  // A note shared with you takes its text from the owner's document, never a seed (ADR-0056).
  const guest = note.share?.role === "guest" ? note.share : null
  const liveMode = useLiveShareModes((m) => m[note.id])
  const readOnly = !!guest && (liveMode ?? guest.mode) === "view"
  const [seeded] = useState(() => !locked && !guest && note.ydoc === null && note.markdown.trim() !== "")

  const savedRef = useRef(onSaved)
  useEffect(() => {
    savedRef.current = onSaved
  }, [onSaved])
  useEffect(() => {
    const saver = new NoteSaver(note.id, doc, seeded, (md) => savedRef.current(md), locked)
    return () => saver.close()
  }, [note.id, doc, seeded, locked])

  // Loaded here; the editor reads the cached value on each check, so
  // turning it off applies to the open note too.
  useNotesPrefs()

  // The [[ suggestions: read by the editor's key handler through a ref.
  const suggest = useRef<{ open: boolean; move: (d: number) => void; pick: () => boolean; close: () => void }>({ open: false, move: () => {}, pick: () => false, close: () => {} })
  const leave = useRef(onLeaveText)
  useEffect(() => {
    leave.current = onLeaveText
  })
  // The titles there are, archived ones too, for the links to notes that do not exist yet.
  const { data: open } = useNotes({ search: null, tag: null, archived: false })
  const { data: archived } = useNotes({ search: null, tag: null, archived: true })
  const known = useMemo(() => (open && archived ? new Set([...open, ...archived].map((n) => n.title.trim().toLowerCase())) : null), [open, archived])

  const editor = useEditor(
    {
      extensions: [
        ...editorExtensions,
        Collaboration.configure({ document: doc }),
        SortChecked.configure({ enabled: sortsChecked }),
        TitleGuard,
        MissingLinks,
        Placeholder.configure({ placeholder: "Write something…" }),
      ],
      immediatelyRender: true,
      editable: !readOnly,
      autofocus: false,
      onCreate: ({ editor: e }) => {
        // `[[Title]]` still in plain text (older notes, other devices) becomes a link.
        const tr = linkPlainWikiText(e.state)
        if (tr) e.view.dispatch(tr.setMeta(TITLE, true))
        // The cursor starts in the text, not in the hidden title.
        const at = titleBlock(e.state.doc) ? bodyStart(e.state.doc) : null
        if (at !== null) e.view.dispatch(e.state.tr.setSelection(TextSelection.create(e.state.doc, at)))
      },
      editorProps: {
        handleClickOn: (_view, _pos, node) => {
          if (node.type.name !== "wikiLink") return false
          void openWikiLink(node.attrs.target as string)
          return true
        },
        // Pasted or dropped images become the note's own (ADR-0044).
        handlePaste: (_view, event) => {
          const files = imagesIn(event.clipboardData)
          if (!files.length) return false
          void addImages(editorRef.current, note.id, files)
          return true
        },
        handleDrop: (view, event) => {
          const files = imagesIn((event as DragEvent).dataTransfer)
          if (!files.length) return false
          event.preventDefault()
          const at = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos
          void addImages(editorRef.current, note.id, files, at)
          return true
        },
        handleKeyDown: (view, event) => {
          const s = suggest.current
          if (s.open) {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") return s.move(event.key === "ArrowDown" ? 1 : -1), true
            if (event.key === "Enter" || event.key === "Tab") return s.pick()
            if (event.key === "Escape") return s.close(), true
          }
          // Esc leaves the text; a second Esc closes the note (brief N2).
          if (event.key === "Escape") {
            leave.current?.()
            return true
          }
          // Enter on a selected link opens it, so keyboards can follow links too.
          const sel = view.state.selection
          if (event.key === "Enter" && sel instanceof NodeSelection && sel.node.type.name === "wikiLink") {
            void openWikiLink(sel.node.attrs.target as string)
            return true
          }
          return false
        },
        attributes: {
          role: "textbox",
          "aria-label": "Text",
          "aria-multiline": "true",
          class: "note-body type-body outline-none",
        },
      },
    },
    [doc],
  )
  // A link turned view-only (or back) while the note is open.
  useEffect(() => {
    if (editor.isEditable === readOnly) editor.setEditable(!readOnly)
  }, [editor, readOnly])
  const editorRef = useRef(editor)
  useEffect(() => {
    editorRef.current = editor
  }, [editor])
  useEffect(() => {
    if (known && !editor.isDestroyed) editor.view.dispatch(editor.state.tr.setMeta(MISSING, known))
  }, [known, editor])
  useImperativeHandle(handle, () => ({ addLine: () => addLine(editor) }), [editor])
  const picker = useRef<HTMLInputElement>(null)
  const [scanning, setScanning] = useState(false)
  const phone = useAppFrame().phone

  // Writing: the title, the text or the format bar has focus.
  const area = useRef<HTMLDivElement>(null)
  const [writing, setWriting] = useState(false)
  const writingRef = useRef(onWriting)
  useEffect(() => {
    writingRef.current = onWriting
  })
  useEffect(() => {
    const check = () => {
      const el = document.activeElement
      const now = !!el && !!area.current?.contains(el) && !!el.closest("textarea[data-note-title], .ProseMirror, [data-slot=format-bar]")
      setWriting(now)
      writingRef.current?.(now)
    }
    // After the move: focusout fires before the next element has focus.
    const later = () => setTimeout(check, 0)
    document.addEventListener("focusin", check)
    document.addEventListener("focusout", later)
    return () => {
      document.removeEventListener("focusin", check)
      document.removeEventListener("focusout", later)
    }
  }, [])

  // Live edits from other devices while this note is open.
  // Which sync is running: a new one (say, encryption turned on) needs the note again.
  const syncing = useSyncStatus((s) => (s.status !== "off" ? s.run : 0))
  // Who the others see here (ADR-0061), read when the connection opens.
  const me = useMyName()
  const meRef = useRef(me)
  useEffect(() => {
    meRef.current = me
  })
  // A note shared with you is live on the owner's relay, yours or not.
  const guestRef = useRef(guest)
  useEffect(() => {
    guestRef.current = guest
  })
  const guestId = guest && !guest.revoked ? guest.id : null
  useEffect(() => {
    if (!guestId || !guestRef.current) return
    return guestShares()?.attach(note.id, guestRef.current, doc, meRef.current)
  }, [guestId, note.id, doc])
  const shareId = note.share?.revoked ? null : (note.share?.id ?? null)
  const shareRef = useRef(note.share)
  useEffect(() => {
    shareRef.current = note.share
  })
  useEffect(() => {
    // A locked note never joins its shared document.
    if (!syncing || locked || guestId) return
    try {
      return notesSync()?.attach(note.id, doc, shareRef.current, meRef.current)
    } catch {
      // Live sync for this note failed to start; it still saves locally and syncs when closed.
      return undefined
    }
    // Sharing (or stopping) moves the note to another document.
  }, [syncing, note.id, doc, locked, guestId, shareId])

  // What's typed after [[, and the choices for it.
  const q = useEditorState({ editor, selector: ({ editor: e }) => wikiQueryAt(e), equalityFn: (a, b) => a?.from === b?.from && a?.query === b?.query })
  const [dismissed, setDismissed] = useState<number | null>(null)
  // The highlighted choice, reset whenever the query changes.
  const [picked, setActive] = useState({ query: "", i: 0 })
  const live = q && q.from !== dismissed ? q : null
  const active = picked.query === live?.query ? picked.i : 0
  const choices = useWikiChoices(live, note.id)
  const choose = (c: Choice) => live && pickChoice(editor, live, c.title)
  useEffect(() => {
    suggest.current = {
      open: !!live && choices.length > 0,
      move: (d) => setActive({ query: live?.query ?? "", i: (active + d + choices.length) % choices.length }),
      pick: () => {
        const c = choices[Math.min(active, choices.length - 1)]
        if (!c) return false
        choose(c)
        return true
      },
      close: () => setDismissed(live?.from ?? null),
    }
  })

  const bar = readOnly ? null : (
    // The shared format bar (ADR-0089): docked at the column's foot; on a phone, just above the keyboard.
    <FormatBar
      editor={editor}
      heading
      checklist
      mode={phone ? "keyboard" : "docked"}
      actions={
        <>
          {/* Starts [[ so the note picker opens: easier than finding brackets on a phone keyboard. */}
          <ToolbarButton icon="notebook" label="Link to a note" onClick={() => editor.chain().focus().insertContent("[[").run()} />
          <ToolbarButton icon="image" label="Add image" onClick={() => picker.current?.click()} />
          <ToolbarButton icon="scan--alt" label="Scan a document" onClick={() => setScanning(true)} />
          <ToolbarButton icon="pen" label="Sketch" onClick={() => useSketchSheet.getState().show(null, null)} />
        </>
      }
    />
  )

  return (
    <div ref={area} data-note-writing="" className="flex min-h-full flex-1 flex-col">
      <AppFrameInset>
        {/* The banners and the top line, then the title 4 px under the overline, as drawn; then the chips. */}
        <div className="flex flex-col pb-6">
          <div className="flex flex-col gap-4">{top}</div>
          <div className="pt-1">
            <NoteTitle editor={editor} readOnly={readOnly} autoFocus={autoFocus && !readOnly} onLeave={() => leave.current?.()} large={!phone} />
          </div>
          {afterTitle && <div className="flex flex-col gap-4 pt-4">{afterTitle}</div>}
        </div>
      </AppFrameInset>
      {/* A press in the empty space under the text goes to its end. */}
      <div
        className="flex-1 cursor-text pb-6"
        onMouseDown={(e) => {
          if (e.target !== e.currentTarget || readOnly) return
          e.preventDefault()
          if (bodyStart(editor.state.doc) === null) focusBody(editor)
          else editor.commands.focus("end")
        }}
      >
        <AppFrameInset>
          <EditorContent editor={editor} />
        </AppFrameInset>
      </div>
      {live && <WikiSuggest editor={editor} q={live} choices={choices} active={active} onPick={choose} />}
      {/* A phone shows the bar only while you write; it stays mounted, so a layer it opened stays open. */}
      {bar && (phone ? <div className={writing ? "contents" : "hidden"}>{bar}</div> : bar)}
      <SketchPad onDone={(s, pos) => void saveSketch(editor, note.id, s, pos)} />
      <ScanDocument open={scanning} onOpenChange={setScanning} onScanned={(pages) => void addScans(editor, note.id, pages)} />
      <input
        ref={picker}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const files = [...(e.target.files ?? [])]
          e.target.value = ""
          void addImages(editor, note.id, files)
        }}
      />
    </div>
  )
}

/**
 * The title as a field of its own (brief N2): the drawn large size (48 on a
 * desktop, 32 on a phone), placeholder "Title". Enter or ↓ at its end goes to
 * the text; Esc leaves it. It grows to fit a long title.
 */
function NoteTitle({ editor, readOnly, autoFocus, onLeave, large }: { editor: Editor; readOnly: boolean; autoFocus: boolean; onLeave: () => void; large: boolean }) {
  const field = useRef<HTMLTextAreaElement>(null)
  const value = useEditorState({ editor, selector: ({ editor: e }) => titleText(e.state.doc) })
  const [text, setText] = useState(value)
  // Another device's change shows at once, unless this field is being typed in.
  useEffect(() => {
    if (document.activeElement !== field.current) setText(value)
  }, [value])
  useLayoutEffect(() => {
    const el = field.current
    if (!el) return
    // Whole lines of the title's role: the glyphs' overhang makes the scroll height a little more than the lines.
    const fit = () => {
      el.style.height = "auto"
      const line = parseFloat(getComputedStyle(el).lineHeight) || el.scrollHeight
      el.style.height = `${Math.max(1, Math.round(el.scrollHeight / line)) * line}px`
    }
    fit()
    window.addEventListener("resize", fit)
    return () => window.removeEventListener("resize", fit)
  }, [text, large])
  useEffect(() => {
    if (autoFocus) field.current?.focus()
  }, [autoFocus])
  return (
    <textarea
      ref={field}
      data-note-title=""
      aria-label="Title"
      placeholder="Title"
      rows={1}
      readOnly={readOnly}
      value={text}
      spellCheck
      className={`block w-full resize-none overflow-hidden bg-transparent text-foreground outline-none placeholder:text-muted-foreground ${large ? "type-display-compact" : "type-title"}`}
      onChange={(e) => {
        const next = e.target.value.replace(/\n/g, "")
        setText(next)
        setTitle(editor, next)
      }}
      onBlur={() => setText(titleText(editor.state.doc))}
      onKeyDown={(e) => {
        const el = e.currentTarget
        const atEnd = el.selectionStart === el.value.length && el.selectionEnd === el.value.length
        if (e.key === "Enter" || (e.key === "ArrowDown" && atEnd)) {
          e.preventDefault()
          if (!readOnly) focusBody(editor)
        } else if (e.key === "Escape") {
          e.preventDefault()
          onLeave()
        }
      }}
    />
  )
}

const imagesIn = (data: DataTransfer | null) => [...(data?.files ?? [])].filter((f) => f.type.startsWith("image/"))

/** Scanned pages go in order, each described with its place in the document (ADR-0068). */
async function addScans(editor: Editor, noteId: string, pages: File[]) {
  for (const [i, page] of pages.entries()) await addImages(editor, noteId, [page], undefined, pages.length > 1 ? `Scanned document, page ${i + 1} of ${pages.length}` : "Scanned document")
}

/**
 * Shrinks each image, stores it with the note, and puts it in the text at
 * `at` (or the cursor). A failed one says why; the rest still go in.
 */
async function addImages(editor: Editor, noteId: string, files: File[], at?: number, alt = "") {
  const core = await getCoreClient()
  for (const f of files) {
    try {
      const img = await prepareImage(f)
      const stored = await core.addNoteFile(noteId, img.mime, img.dataBase64, img.width, img.height)
      const node = { type: "noteImage", attrs: { src: `${NOTE_FILE}${stored.id}`, alt } }
      const chain = editor.chain().focus()
      ;(at === undefined ? chain : chain.setTextSelection(at)).insertContent(node).run()
      at = undefined
    } catch (e) {
      toast.error(`${f.name || "Image"}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
}

/**
 * Stores a sketch (ADR-0046) and puts it in the note; an edited one takes
 * the old one's place. Each save is a new image: images never change once
 * stored, so other devices and caches never show a stale one.
 */
async function saveSketch(editor: Editor, noteId: string, sketch: Sketch, pos: number | null) {
  try {
    const svg = toSvg(sketch)
    const stored = await (await getCoreClient()).addNoteFile(noteId, SVG_MIME, toBase64(new TextEncoder().encode(svg)), sketch.w, sketch.h)
    const src = `${NOTE_FILE}${stored.id}`
    const node = pos === null ? null : editor.state.doc.nodeAt(pos)
    if (pos !== null && node?.type.name === "noteImage") {
      editor.chain().focus().command(({ tr }) => (tr.setNodeMarkup(pos, undefined, { ...node.attrs, src }), true)).run()
    } else {
      editor.chain().focus().insertContent({ type: "noteImage", attrs: { src, alt: "Sketch" } }).run()
    }
  } catch (e) {
    toast.error(e instanceof Error ? e.message : String(e))
  }
}

/** Debounced save of Markdown + Yjs state; marks the note edited only for this person's changes. */
class NoteSaver {
  private timer: ReturnType<typeof setTimeout> | undefined
  private dirty: boolean
  private touch = false
  private id: string
  private doc: Y.Doc
  private onSaved: (markdown: string) => void
  private locked: boolean
  /** The text as the editor writes it when the note opened. Opening alone
   *  can re-shape it (a trailing paragraph, list markers), which isn't an edit. */
  private last: string

  constructor(id: string, doc: Y.Doc, seeded: boolean, onSaved: (markdown: string) => void, locked: boolean) {
    this.id = id
    this.doc = doc
    this.locked = locked
    this.last = markdownOf(doc)
    this.onSaved = onSaved
    this.dirty = seeded
    doc.on("update", this.onUpdate)
    if (seeded) this.timer = setTimeout(this.run, 0)
  }

  private onUpdate = (_u: Uint8Array, origin: unknown) => {
    this.dirty = true
    if (!notMine(origin)) this.touch = true
    clearTimeout(this.timer)
    this.timer = setTimeout(this.run, SAVE_DELAY)
  }

  private run = () => {
    clearTimeout(this.timer)
    if (!this.dirty) return
    const md = markdownOf(this.doc)
    const touch = this.touch && md !== this.last
    this.last = md
    this.dirty = this.touch = false
    void getCoreClient()
      .then((c) => (this.locked ? c.saveLockedNote(this.id, md, touch) : c.saveNoteBody(this.id, md, stateOf(this.doc), touch)))
      .then(() => this.onSaved(md))
      // Locked again (by the timer or another window) mid-edit: it reopens behind the passphrase.
      .catch(() => queryClient.invalidateQueries({ queryKey: ["notes"] }))
  }

  close() {
    this.doc.off("update", this.onUpdate)
    this.run()
  }
}
