import { useEffect, useState } from "react"

import { AdaptiveDialog, Button, FileChip, Icon, IconButton, Spinner, toast } from "@unicron/ui"
import { getCoreClient } from "@/core/client"
import type { AttachmentInfo } from "@/core/types"

import { THUMB_LIMIT, fileType, isPdf, previewKind, useAttachmentUrl, type PreviewKind } from "./attachment-kind"
import { formatSize } from "./format"

type Loaded = { kind: "image" | "pdf"; url: string } | { kind: "text"; text: string } | { kind: "error"; message: string }

/** Mounted only while the viewer is open, so every open starts from a clean fetch. */
function PreviewBody({ file, kind }: { file: AttachmentInfo; kind: PreviewKind }) {
  const [loaded, setLoaded] = useState<Loaded>()
  useEffect(() => {
    let live = true
    let made: string | undefined
    getCoreClient()
      .then((c) => c.attachmentData(file.id))
      .then((data) => {
        if (!live) return
        const bytes = new Uint8Array(data)
        if (kind === "text") {
          setLoaded({ kind, text: new TextDecoder().decode(bytes) })
        } else if (kind === "pdf" && !isPdf(bytes)) {
          setLoaded({ kind: "error", message: "This file says it's a PDF, but it isn't one." })
        } else {
          made = URL.createObjectURL(new Blob([bytes], { type: kind === "pdf" ? "application/pdf" : file.mimeType }))
          setLoaded({ kind, url: made })
        }
      })
      .catch((e) => live && setLoaded({ kind: "error", message: e instanceof Error ? e.message : String(e) }))
    return () => {
      live = false
      if (made) URL.revokeObjectURL(made)
    }
  }, [kind, file.id, file.mimeType])

  if (!loaded)
    return (
      <div className="flex flex-1 items-center justify-center" role="status" aria-label={`Opening ${file.filename}`}>
        <Spinner />
      </div>
    )
  if (loaded.kind === "image") return <img src={loaded.url} alt={file.filename} className="max-h-full max-w-full self-center object-contain" />
  if (loaded.kind === "pdf") return <iframe src={loaded.url} title={file.filename} className="size-full flex-1 border-0" />
  if (loaded.kind === "text") return <pre className="size-full flex-1 overflow-auto type-meta break-words whitespace-pre-wrap text-foreground">{loaded.text}</pre>
  if (loaded.kind !== "error") return null
  return (
    <p role="alert" className="flex items-center gap-2 type-body text-destructive">
      <Icon name="warning" /> {loaded.message}
    </p>
  )
}

/**
 * The attachment viewer (ADR-0092; brief M4): viewer 960 on a desktop, a full sheet on a phone.
 * Overline `PDF // 84 KB`, the file's name as title, close; the image, PDF or text; one secondary
 * SAVE. A kind it cannot show says so and still offers SAVE. HTML (and anything that could run
 * script) is never shown: see `previewKind`.
 */
export function AttachmentPreview({ file, open, onOpenChange, onSave, saving }: { file: AttachmentInfo; open: boolean; onOpenChange: (open: boolean) => void; onSave: () => void; saving: boolean }) {
  const kind = previewKind(file)
  return (
    <AdaptiveDialog
      open={open}
      onOpenChange={onOpenChange}
      size="viewer"
      height="full"
      overline={`${fileType(file)} // ${formatSize(file.size)}`}
      title={file.filename}
      footer={
        <Button variant="secondary" loading={saving} onClick={onSave}>
          Save
        </Button>
      }
    >
      <div className="flex h-[70dvh] min-h-0 flex-col" data-role="preview-body">
        {!kind ? <p className="type-body text-muted-foreground">No preview for this kind of file.</p> : open && <PreviewBody file={file} kind={kind} />}
      </div>
    </AdaptiveDialog>
  )
}

/**
 * A file a message carries, as unicron's FileChip (brief M4; Desktop / 01's "PDF · Pine Hollow
 * booking.pdf · 84 KB"): pressing it opens the viewer; its trailing Save saves it, the chip busy
 * meanwhile, then the toast "Saved {name}". An image shows its thumbnail in place of the tag.
 */
export function AttachmentFile({ file }: { file: AttachmentInfo }) {
  const [saving, setSaving] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const thumb = useAttachmentUrl(file.id, previewKind(file) === "image" && file.size <= THUMB_LIMIT, file.mimeType)
  const save = async () => {
    setSaving(true)
    try {
      await (await getCoreClient()).openAttachment(file.id)
      toast(`Saved ${file.filename}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }
  return (
    <>
      <FileChip
        name={file.filename}
        type={fileType(file)}
        size={formatSize(file.size)}
        thumbnail={thumb}
        busy={saving}
        onClick={() => setPreviewing(true)}
        action={<IconButton icon="download" label={`Save ${file.filename}`} size="icon-sm" disabled={saving} onClick={() => void save()} />}
      />
      <AttachmentPreview file={file} open={previewing} onOpenChange={setPreviewing} onSave={() => void save()} saving={saving} />
    </>
  )
}
