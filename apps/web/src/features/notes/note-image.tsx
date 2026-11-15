import { NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react"
import { useRef, useState } from "react"

import { AdaptivePopover, Button, Icon, Skeleton, TextField, Toolbar, ToolbarButton } from "@unicron/ui"
import { useNoteFile } from "@/core/queries"
import { useCopy } from "@/lib/copy"
import { fromSvg, SVG_MIME } from "@/lib/sketch"
import { cn } from "@/lib/utils"

import { useImageViewer } from "./image-viewer-store"
import { noteFileId } from "./note-src"
import { useSketchSheet } from "./sketch-store"

/**
 * An image in a note (ADR-0044, ADR-0108; brief N4). On hover or focus, a small toolbar: View, Edit
 * sketch (a sketch), Text in image (what was read on this device, to copy or add to the note), and
 * Describe (how the image reads aloud, and what search sees). A locked note's image, one not on
 * this device yet, and a web image not loaded yet each show a labelled placeholder.
 */
export function NoteImageView({ node, selected, updateAttributes, editor, getPos }: ReactNodeViewProps) {
  const { src, alt } = node.attrs as { src: string; alt: string }
  const id = noteFileId(src)
  const file = useNoteFile(id)
  const local = file.data?.url ?? null
  // Web images load only when asked: loading one tells its server you read this note.
  const [allowWeb, setAllowWeb] = useState(false)
  const web = !id && /^https:\/\//i.test(src)
  const shown = id ? local : web && allowWeb ? src : null
  const [broken, setBroken] = useState(false)
  const editable = editor.isEditable
  // The text read from the image (ADR-0045), shown on request.
  const found = file.data?.text ?? ""
  // A sketch (ADR-0046) shows on its paper, and opens again to edit.
  const sketch = file.data?.mime === SVG_MIME
  const editSketch = async () => {
    const at = getPos()
    if (!file.data || typeof at !== "number") return
    const parsed = fromSvg(await (await fetch(file.data.url)).text())
    // One this device can't read opens as its picture, with the reason (brief N3).
    useSketchSheet.getState().show(parsed, at, parsed ? undefined : file.data.url)
  }
  const insertText = () => {
    const at = getPos()
    if (typeof at !== "number") return
    // Each line its own paragraph, right after the image's.
    const paragraphs = found
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => ({ type: "paragraph", content: [{ type: "text", text: l }] }))
    const after = editor.state.doc.resolve(at).after()
    editor.chain().focus().insertContentAt(after, paragraphs).run()
  }
  // Full screen (ADR-0067), with the note's other images to page through.
  const view = () => {
    if (!id) return
    const images: { id: string; alt: string }[] = []
    editor.state.doc.descendants((n) => {
      const other = n.type.name === node.type.name ? noteFileId(String(n.attrs.src ?? "")) : null
      if (other && !images.some((i) => i.id === other)) images.push({ id: other, alt: String(n.attrs.alt ?? "") })
    })
    useImageViewer.getState().show(images, Math.max(0, images.findIndex((i) => i.id === id)))
  }
  const backToText = () => {
    const at = getPos()
    const chain = editor.chain().focus()
    ;(typeof at === "number" ? chain.setTextSelection(at + node.nodeSize) : chain).run()
  }

  let body: React.ReactNode
  if (id && file.isPending) {
    body = (
      <span className="note-image-wait" role="img" aria-label={alt || "Image"} aria-busy="true">
        <Skeleton />
      </span>
    )
  } else if (id && (file.isError || broken)) {
    const locked = file.error instanceof Error && /passphrase/i.test(file.error.message)
    body = (
      <span className="note-image-stand-in type-label text-muted-foreground" role="img" aria-label={alt || "Image"}>
        <Icon name={locked ? "locked" : "no-image"} />
        {locked ? "Unlock notes to see this image." : "This image isn't on this device yet."}
      </span>
    )
  } else if (web && !allowWeb) {
    let host = ""
    try {
      host = new URL(src).host
    } catch {
      // Not a real address: nothing to show, nothing to load.
    }
    body = (
      <span className="note-image-stand-in type-label text-muted-foreground" role="group" aria-label={`Web image${alt ? `: ${alt}` : ""}, not loaded`}>
        <Icon name="image" />
        <span className="note-image-name">{alt || "Web image"}</span>
        <Button type="button" size="xs" variant="outline" onClick={() => setAllowWeb(true)}>
          Show from {host || "the web"}
        </Button>
      </span>
    )
  } else if (shown) {
    body = <img src={shown} alt={alt} draggable={false} onError={() => setBroken(true)} onDoubleClick={id ? view : undefined} data-sketch={sketch ? "" : undefined} />
  } else {
    body = (
      <span className="note-image-stand-in type-label text-muted-foreground" role="img" aria-label={alt || "Image"}>
        <Icon name="no-image" />
        {alt || "Image"}
      </span>
    )
  }

  // What the toolbar holds: only what this image can do here.
  const canView = !!(id && local)
  const canEditSketch = sketch && editable && canView
  const canRead = !!found && canView
  const tools = canView || canEditSketch || canRead || (editable && !!(id || shown))

  return (
    <NodeViewWrapper as="span" className={cn("note-image", selected && "is-selected")} data-drag-handle>
      {body}
      {tools && (
        // A press on the toolbar never moves the note's selection, which would scroll the note under the finger.
        <span className="note-image-tools" contentEditable={false} onMouseDown={(e) => e.preventDefault()}>
          <Toolbar aria-label="Image">
            {canView && <ToolbarButton icon="maximize" label="View" onClick={view} />}
            {canEditSketch && <ToolbarButton icon="pen" label="Edit sketch" onClick={() => void editSketch()} />}
            {canRead && <ImageText text={found} editable={editable} onAdd={insertText} />}
            {editable && <Describe alt={alt} onSave={(v) => v !== alt && updateAttributes({ alt: v })} onDone={backToText} />}
          </Toolbar>
        </span>
      )}
    </NodeViewWrapper>
  )
}

/** Text in image: the words read on this device, to copy, or to add to the note after the image. */
function ImageText({ text, editable, onAdd }: { text: string; editable: boolean; onAdd: () => void }) {
  const [open, setOpen] = useState(false)
  const { copied, copy } = useCopy({ what: "text" })
  return (
    <AdaptivePopover open={open} onOpenChange={setOpen} overline="Read on this device" title="Text in image" align="end" trigger={<ToolbarButton icon="scan--alt" label="Text in image" />}>
      <div className="note-image-text">
        <p className="type-body">{text}</p>
        <div className="note-image-actions">
          <Button type="button" variant="outline" size="sm" onClick={() => void copy(text)}>
            {copied ? "Copied" : "Copy"}
          </Button>
          {editable && (
            <Button type="button" size="sm" onClick={() => (onAdd(), setOpen(false))}>
              Add to note
            </Button>
          )}
        </div>
      </div>
    </AdaptivePopover>
  )
}

/** Describe: one field, kept on Enter or when the popover closes, so one edit is one change in the note's history. */
function Describe({ alt, onSave, onDone }: { alt: string; onSave: (alt: string) => void; onDone: () => void }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(alt)
  // Escape drops what was typed; every other way of closing keeps it.
  const dropped = useRef(false)
  const change = (next: boolean) => {
    if (next) setDraft(alt)
    else if (!dropped.current) onSave(draft.trim())
    dropped.current = false
    setOpen(next)
  }
  return (
    <AdaptivePopover open={open} onOpenChange={change} title="Describe" align="end" trigger={<ToolbarButton icon="text--creation" label="Describe" />}>
      <TextField
        label="Description"
        placeholder="Describe this image for people who can't see it"
        value={draft}
        autoFocus
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") dropped.current = true
          // Enter keeps it and goes back to writing, after the image.
          if (e.key !== "Enter") return
          e.preventDefault()
          change(false)
          onDone()
        }}
      />
    </AdaptivePopover>
  )
}

/**
 * A card's thumbnail: the note's first image, edge to edge on top, the way
 * Keep shows photos. Decorative: the card's title already names the note.
 */
export function NoteCover({ id, className }: { id: string; className?: string }) {
  const file = useNoteFile(id)
  const url = file.data?.url
  if (file.isError) return null
  return url ? (
    <img src={url} alt="" draggable={false} className={cn("block max-h-48 w-full object-cover", file.data?.mime === SVG_MIME && "bg-(--c-sketch-paper) object-contain", className)} />
  ) : (
    <span aria-hidden className={cn("block h-24 w-full animate-pulse bg-foreground/5", className)} />
  )
}
