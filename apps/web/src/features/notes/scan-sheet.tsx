import { useEffect, useRef, useState } from "react"

import { AdaptiveDialog, Banner, Button, FileChip, FilterChip, FilterChipGroup, IconButton, useAppFrame } from "@unicron/ui"
import { useConfirm } from "@/lib/confirm"
import { IMAGE_SIDE } from "@/lib/image"
import { findPage, FULL, loadPhoto, type Pt, type Quad, type ScanLook, straighten, toJpeg } from "@/lib/scan"

const CORNERS = ["Top left", "Top right", "Bottom right", "Bottom left"] as const
const PREVIEW_SIDE = 800
const clamp = (v: number) => Math.min(1, Math.max(0, v))
const two = (n: number) => String(n).padStart(2, "0")
const kb = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`)

/**
 * Scan pages into a note (ADR-0045, ADR-0068, ADR-0108; brief N4): a viewer layer of 960 on a
 * desktop, the whole screen on a phone, in two steps. Capture: take a photo, or choose one. Adjust:
 * square the page with its four corners, choose how it looks, then add it, or scan the next page
 * first. The text in them is read on this device afterwards, like any image's.
 */
export function ScanDocument({ open, onOpenChange, onScanned }: { open: boolean; onOpenChange: (o: boolean) => void; onScanned: (pages: File[]) => void }) {
  // A new scanner each time it opens: no pages left over from the last one.
  return open ? <Scanner onClose={() => onOpenChange(false)} onDone={(f) => (onScanned(f), onOpenChange(false))} /> : null
}

/** A page scanned and waiting to be added, with a thumbnail to show it. */
interface Page {
  file: File
  /** An object URL of the page, for its chip; let go when the page is. */
  thumb: string
}

function Scanner({ onClose, onDone }: { onClose: () => void; onDone: (pages: File[]) => void }) {
  const phone = useAppFrame().phone
  const confirm = useConfirm()
  // Pages already scanned, in order; the one being worked on isn't here yet.
  const [pages, setPages] = useState<Page[]>([])
  const [photo, setPhoto] = useState<HTMLCanvasElement | null>(null)
  const [quad, setQuad] = useState<Quad>(FULL)
  const [look, setLook] = useState<ScanLook>("document")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const camera = useRef<HTMLInputElement>(null)
  const chooser = useRef<HTMLInputElement>(null)
  // The thumbnails' URLs go when the scanner does.
  const held = useRef(pages)
  useEffect(() => {
    held.current = pages
  })
  useEffect(() => () => held.current.forEach((p) => URL.revokeObjectURL(p.thumb)), [])

  const pick = async (f: File | undefined) => {
    if (!f) return
    setError(null)
    try {
      const c = await loadPhoto(f)
      setPhoto(c)
      setQuad(findPage(c))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }
  const picked = (e: React.ChangeEvent<HTMLInputElement>) => {
    void pick(e.target.files?.[0])
    // Picking the same file again still counts.
    e.target.value = ""
  }
  /** The page being worked on, finished. */
  const finish = async (): Promise<Page | null> => {
    if (!photo) return null
    const blob = await toJpeg(straighten(photo, quad, IMAGE_SIDE, look))
    return { file: new File([blob], `Scan ${pages.length + 1}.jpg`, { type: "image/jpeg" }), thumb: URL.createObjectURL(blob) }
  }
  const add = async () => {
    setBusy(true)
    try {
      const last = await finish()
      onDone([...pages, ...(last ? [last] : [])].map((p) => p.file))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }
  /** Keep this page and scan the next one, with the same look. */
  const next = async () => {
    setBusy(true)
    try {
      const last = await finish()
      if (last) setPages((ps) => [...ps, last])
      setPhoto(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setBusy(false)
  }
  const remove = (i: number) =>
    setPages((ps) => {
      URL.revokeObjectURL(ps[i]!.thumb)
      return ps.filter((_, k) => k !== i)
    })
  // Closing asks only when a page would be lost (cross-app decisions §10).
  const requestClose = async () => {
    if (!pages.length && !photo) return onClose()
    if (await confirm.ask({ title: "Discard changes?", confirmLabel: "Discard", cancelLabel: "Keep editing" })) onClose()
  }

  const adjusting = !!photo
  const total = pages.length + (adjusting ? 1 : 0)
  const addWords = total > 1 ? `Add ${total} pages to note` : "Add to note"

  const footer = adjusting ? (
    <>
      <Button type="button" variant="ghost" disabled={busy} onClick={() => setPhoto(null)}>
        Retake
      </Button>
      <Button type="button" variant="outline" disabled={busy} onClick={() => void next()}>
        Next page
      </Button>
      <Button type="button" loading={busy} onClick={() => void add()}>
        {addWords}
      </Button>
    </>
  ) : (
    <>
      {pages.length > 0 && (
        <Button type="button" variant="ghost" disabled={busy} loading={busy} onClick={() => void add()}>
          {addWords}
        </Button>
      )}
      <Button type="button" variant="outline" onClick={() => chooser.current?.click()}>
        Choose a file
      </Button>
      {/* On phones, `capture` opens the back camera; elsewhere it's an ordinary file picker. */}
      <Button type="button" onClick={() => camera.current?.click()}>
        Take a photo
      </Button>
    </>
  )

  return (
    <>
      <AdaptiveDialog
        open
        onOpenChange={(o) => !o && void requestClose()}
        size="viewer"
        height="full"
        overline={`Scan // page ${two(pages.length + 1)}`}
        title="Scan a document"
        closeOnOutsideClick={false}
        footer={footer}
      >
        <div className="scan-body" data-step={adjusting ? "adjust" : "capture"} data-phone={phone ? "" : undefined}>
          {!adjusting && <p className="type-body text-muted-foreground">The text in it becomes searchable. It is read on this device.</p>}
          {error && <Banner size="compact" tone="critical" body={error} />}
          {adjusting && photo && (
            <>
              <div className="scan-adjust">
                <Corners photo={photo} quad={quad} onChange={setQuad} />
                <Result photo={photo} quad={quad} look={look} />
              </div>
              <div className="scan-look">
                <span className="type-overline text-muted-foreground" aria-hidden>
                  Look
                </span>
                <FilterChipGroup label="Look" value={look} onValueChange={(v) => setLook(v as ScanLook)}>
                  <FilterChip value="document">Document</FilterChip>
                  <FilterChip value="gray">Grayscale</FilterChip>
                  <FilterChip value="color">Color</FilterChip>
                </FilterChipGroup>
                <Button type="button" variant="ghost" size="sm" disabled={quad === FULL} onClick={() => setQuad(FULL)}>
                  Whole photo
                </Button>
              </div>
            </>
          )}
          {pages.length > 0 && (
            <section className="scan-pages" aria-label="Scanned pages">
              <span className="type-overline text-muted-foreground">Pages // {two(pages.length)}</span>
              <ol>
                {pages.map((p, i) => (
                  <li key={p.thumb}>
                    <FileChip name={`Page ${i + 1}`} type="JPG" size={kb(p.file.size)} thumbnail={p.thumb} action={<IconButton icon="close" label={`Remove page ${i + 1}`} variant="ghost" size="icon-sm" onClick={() => remove(i)} />} />
                  </li>
                ))}
              </ol>
            </section>
          )}
          {/* The pickers the two buttons open, inside the layer so they stay live. */}
          <input ref={camera} type="file" accept="image/*" capture="environment" hidden data-pick="camera" onChange={picked} />
          <input ref={chooser} type="file" accept="image/*" hidden data-pick="file" onChange={picked} />
        </div>
      </AdaptiveDialog>
      {confirm.question()}
    </>
  )
}

/**
 * The photo with the page's outline and four corner handles: drag them, or focus one and use the
 * arrow keys (Shift for bigger steps). Each says where it is.
 */
function Corners({ photo, quad, onChange }: { photo: HTMLCanvasElement; quad: Quad; onChange: (q: Quad) => void }) {
  const box = useRef<HTMLDivElement>(null)
  const [url] = useState(() => photo.toDataURL("image/jpeg", 0.85))
  const drag = useRef<number | null>(null)
  const move = (i: number, p: Pt) => onChange(quad.map((q, k) => (k === i ? { x: clamp(p.x), y: clamp(p.y) } : q)) as Quad)
  const at = (e: React.PointerEvent) => {
    const r = box.current!.getBoundingClientRect()
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }
  }
  const points = quad.map((p) => `${p.x * 100},${p.y * 100}`).join(" ")
  return (
    <div className="scan-photo-frame">
      {/* As wide as fits, never taller than the room the layer leaves, keeping the photo's shape. */}
      <div ref={box} className="scan-photo" style={{ aspectRatio: `${photo.width} / ${photo.height}`, ["--scan-ratio" as string]: photo.width / photo.height }}>
        <img src={url} alt="The photo to scan" draggable={false} />
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          <polygon points={points} strokeWidth={2} vectorEffect="non-scaling-stroke" />
        </svg>
        {quad.map((p, i) => (
          <button
            key={CORNERS[i]}
            type="button"
            data-corner=""
            aria-label={`${CORNERS[i]}: ${Math.round(p.x * 100)}% across, ${Math.round(p.y * 100)}% down`}
            style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
            onPointerDown={(e) => ((drag.current = i), e.currentTarget.setPointerCapture(e.pointerId))}
            onPointerMove={(e) => drag.current === i && move(i, at(e))}
            onPointerUp={() => (drag.current = null)}
            onKeyDown={(e) => {
              const step = e.shiftKey ? 0.05 : 0.01
              const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key]
              if (!d) return
              e.preventDefault()
              move(i, { x: p.x + d[0]!, y: p.y + d[1]! })
            }}
          >
            <span aria-hidden />
          </button>
        ))}
      </div>
    </div>
  )
}

/** The page as it will be added: squared by the corners, in the look chosen. Redrawn a beat after they settle. */
function Result({ photo, quad, look }: { photo: HTMLCanvasElement; quad: Quad; look: ScanLook }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    const t = setTimeout(() => setUrl(straighten(photo, quad, PREVIEW_SIDE, look).toDataURL("image/jpeg", 0.85)), 120)
    return () => clearTimeout(t)
  }, [photo, quad, look])
  return url ? <img className="scan-result" src={url} alt="The page as it will be added" draggable={false} /> : <span className="scan-result" aria-hidden />
}
