import { useEffect, useState } from "react"

import { FloatButton, Sheet, SheetContent, SheetDescription, SheetHeader, SheetHeaderActions, SheetOverline, SheetTitle, Spinner, toast, useAppFrame } from "@unicron/ui"
import { getCoreClient, isTauri } from "@/core/client"
import { useNoteFile } from "@/core/queries"
import { SVG_MIME } from "@/lib/sketch"

import { type ViewerImage, useImageViewer } from "./image-viewer-store"

const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif", [SVG_MIME]: "svg" }
const two = (n: number) => String(n).padStart(2, "0")

/**
 * A note's images full screen, at every width (ADR-0067, ADR-0108; brief N4): IMAGE 02 // 05 over
 * the description, then Actual size, Save and Close. Previous and next are neutral float buttons
 * at the sides on a desktop and at the start of the bottom row on a phone; a swipe and ← → do the same.
 */
export function ImageViewer() {
  const { images, at, close } = useImageViewer()
  const open = images.length > 0
  return (
    <Sheet open={open} onOpenChange={(o) => !o && close()}>
      <SheetContent side="bottom" height="full" closeLabel="Close">
        {open && <Viewer images={images} at={Math.min(at, images.length - 1)} />}
      </SheetContent>
    </Sheet>
  )
}

function Viewer({ images, at }: { images: ViewerImage[]; at: number }) {
  const phone = useAppFrame().phone
  const go = (to: number) => useImageViewer.setState({ at: (to + images.length) % images.length })
  const image = images[at]!
  const file = useNoteFile(image.id)
  const several = images.length > 1
  // Fit to the screen, or the image at its own size to look closely. Each image opens fitted.
  const [actualFor, setActualFor] = useState<string | null>(null)
  const actual = actualFor === image.id
  useEffect(() => {
    if (!several) return
    const key = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(at + 1)
      else if (e.key === "ArrowLeft") go(at - 1)
      else return
      e.preventDefault()
    }
    // Capture: the sheet's own key handling would otherwise see the arrows first.
    window.addEventListener("keydown", key, true)
    return () => window.removeEventListener("keydown", key, true)
  })
  // A swipe across moves to the next or previous image.
  const [touch, setTouch] = useState<number | null>(null)
  const save = async () => {
    if (!file.data) return
    const name = (image.alt || "Image").replace(/[\\/:*?"<>|]+/g, " ").trim().slice(0, 60) || "Image"
    // The desktop and phone apps save from the core, into Downloads (ADR-0070).
    if (isTauri()) {
      try {
        const path = await (await getCoreClient()).saveNoteFile(image.id, name)
        toast.success("Saved to Downloads", { description: path })
      } catch (e) {
        toast.error(e instanceof Error ? e.message : String(e))
      }
      return
    }
    const a = document.createElement("a")
    a.href = file.data.url
    a.download = `${name}.${EXT[file.data.mime] ?? "png"}`
    a.click()
  }
  const previous = <FloatButton label="Previous image" icon="chevron--left" size="l" onClick={() => go(at - 1)} />
  const following = <FloatButton label="Next image" icon="chevron--right" size="l" onClick={() => go(at + 1)} />

  return (
    <div className="image-viewer" data-phone={phone ? "" : undefined}>
      {/* Clear of the three buttons beside it, so a long description wraps before them. */}
      <div className="image-viewer-head">
        <SheetHeader>
          <SheetOverline>
            Image {two(at + 1)} // {two(images.length)}
          </SheetOverline>
          <SheetTitle>{image.alt || "No description yet"}</SheetTitle>
          <span className="sr-only">
            <SheetDescription>{several ? `${at + 1} of ${images.length}. The arrow keys move between them.` : "Image in this note"}</SheetDescription>
          </span>
        </SheetHeader>
      </div>
      <SheetHeaderActions>
        <FloatButton label="Actual size" icon={actual ? "fit-to-screen" : "zoom--in"} size="l" aria-pressed={actual} disabled={!file.data} onClick={() => setActualFor(actual ? null : image.id)} />
        <FloatButton label="Save image" icon="download" size="l" disabled={!file.data} onClick={() => void save()} />
      </SheetHeaderActions>
      <div
        className="image-viewer-stage"
        data-actual={actual ? "" : undefined}
        onTouchStart={(e) => setTouch(e.touches[0]?.clientX ?? null)}
        onTouchEnd={(e) => {
          const end = e.changedTouches[0]?.clientX
          if (touch !== null && end !== undefined && Math.abs(end - touch) > 60 && several && !actual) go(at + (end < touch ? 1 : -1))
          setTouch(null)
        }}
      >
        {file.isPending ? (
          <Spinner />
        ) : file.data ? (
          <img src={file.data.url} alt={image.alt} draggable={false} data-role="viewer-image" data-sketch={file.data.mime === SVG_MIME ? "" : undefined} />
        ) : (
          <p className="type-body text-muted-foreground">{file.error instanceof Error ? file.error.message : "This image isn't on this device yet."}</p>
        )}
        {several && !phone && (
          <>
            <span className="image-viewer-side" data-side="start">
              {previous}
            </span>
            <span className="image-viewer-side" data-side="end">
              {following}
            </span>
          </>
        )}
      </div>
      {/* A phone's previous and next: the start of the detail bottom row, as a pushed screen draws it. */}
      {several && phone && (
        <div className="image-viewer-row">
          {previous}
          {following}
        </div>
      )}
    </div>
  )
}
