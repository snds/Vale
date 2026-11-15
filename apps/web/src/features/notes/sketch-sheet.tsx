import { useEffect, useRef, useState } from "react"

import { AdaptiveDialog, Button, ToggleGroup, ToggleGroupItem, Toolbar, ToolbarButton, ToolbarSeparator, ToolbarToggle, useAppFrame } from "@unicron/ui"
import { useConfirm } from "@/lib/confirm"
import { hits, MARKER_COLORS, MAX_H, PEN_COLORS, SIZES, type Sketch, SKETCH_H, SKETCH_W, type Stroke, strokePath, strokeStyle } from "@/lib/sketch"

import { type OpenSketch, useSketchSheet } from "./sketch-store"

type Mode = "pen" | "marker" | "eraser"
const ERASER = 14
const ROOM = 350
const PHONE_H = 1600
const mod = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl+"

/** A new sketch: landscape on a desktop; on a phone, upright, to fill the screen it is drawn on. */
const blank = (phone: boolean): Sketch => ({ v: 1, w: SKETCH_W, h: phone ? PHONE_H : SKETCH_H, strokes: [] })

/**
 * Drawing in a note (ADR-0046, ADR-0108; brief N3), with a mouse, a finger or a pen (its pressure
 * shapes the line). A viewer layer of 960 on a desktop, the whole screen on a phone: the tools, the
 * canvas on its paper, and one primary, ADD TO NOTE or SAVE SKETCH. Editing one replaces it.
 */
export function SketchPad({ onDone }: { onDone: (sketch: Sketch, pos: number | null) => void }) {
  const state = useSketchSheet((s) => s.open)
  const close = useSketchSheet((s) => s.close)
  if (!state) return null
  if (!state.sketch && state.image) return <SketchPicture image={state.image} onClose={close} />
  // A new layer for each sketch opened: its strokes and its history start from what was opened.
  return <SketchLayer state={state} onClose={close} onDone={(s) => (onDone(s, state.pos), close())} />
}

function SketchLayer({ state, onClose, onDone }: { state: OpenSketch; onClose: () => void; onDone: (s: Sketch) => void }) {
  const phone = useAppFrame().phone
  const confirm = useConfirm()
  const editing = !!state.sketch
  const [start] = useState(() => state.sketch ?? blank(phone))
  const [sketch, setSketch] = useState(start)
  // Undo and redo: whole sketches, so erasing several strokes undoes as one, and so does Clear.
  const [past, setPast] = useState<Sketch[]>([])
  const [future, setFuture] = useState<Sketch[]>([])
  const [mode, setMode] = useState<Mode>("pen")
  const [penColor, setPenColor] = useState<string>(PEN_COLORS[0].value)
  const [markerColor, setMarkerColor] = useState<string>(MARKER_COLORS[0].value)
  const [size, setSize] = useState(1)
  const [full, setFull] = useState(false)
  // The stroke being drawn: a ref, so every sample lands even when several
  // arrive before React draws again; the state copy is what's on screen.
  const liveRef = useRef<Stroke | null>(null)
  const [live, setLiveState] = useState<Stroke | null>(null)
  const setLive = (s: Stroke | null) => ((liveRef.current = s), setLiveState(s))
  const svg = useRef<SVGSVGElement>(null)
  const erasing = useRef<Sketch | null>(null)

  const commit = (next: Sketch, from = sketch) => {
    setPast((p) => [...p, from].slice(-100))
    setFuture([])
    setSketch(next)
  }
  const undo = () => {
    const prev = past.at(-1)
    if (!prev) return
    setPast((p) => p.slice(0, -1))
    setFuture((f) => [sketch, ...f])
    setSketch(prev)
  }
  const redo = () => {
    const next = future[0]
    if (!next) return
    setFuture((f) => f.slice(1))
    setPast((p) => [...p, sketch])
    setSketch(next)
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z") return
      e.preventDefault()
      if (e.shiftKey) redo()
      else undo()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  // Closing asks only when there is drawing to lose (cross-app decisions §10).
  const changed = sketch !== start
  const requestClose = async () => {
    if (!changed) return onClose()
    if (await confirm.ask({ title: "Discard changes?", confirmLabel: "Discard", cancelLabel: "Keep editing" })) onClose()
  }

  const at = (e: { clientX: number; clientY: number; pointerType: string; pressure: number }): [number, number, number] => {
    const r = svg.current!.getBoundingClientRect()
    const x = ((e.clientX - r.left) / r.width) * sketch.w
    const y = ((e.clientY - r.top) / r.height) * sketch.h
    return [x, y, e.pointerType === "pen" ? e.pressure || 0.5 : 0.5]
  }
  const erase = (e: React.PointerEvent) => {
    const [x, y] = at(e)
    setSketch((s) => ({ ...s, strokes: s.strokes.filter((st) => !hits(st, x, y, ERASER)) }))
  }
  const down = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // Not a live pointer (some synthetic input): drawing still works, just without capture.
    }
    if (mode === "eraser") {
      erasing.current = sketch
      erase(e)
      return
    }
    const marker = mode === "marker"
    setLive({ tool: mode, color: marker ? markerColor : penColor, size: marker ? SIZES[size]!.marker : SIZES[size]!.pen, points: [at(e)], pressure: e.pointerType === "pen" })
  }
  const move = (e: React.PointerEvent) => {
    if (erasing.current) return erase(e)
    const live = liveRef.current
    if (!live) return
    // Coalesced events: every sample the pen made, not just one per frame.
    const samples = e.nativeEvent.getCoalescedEvents?.() ?? []
    const pts = (samples.length ? samples : [e.nativeEvent]).map((ev) => at({ clientX: ev.clientX, clientY: ev.clientY, pointerType: e.pointerType, pressure: ev.pressure }))
    setLive({ ...live, points: [...live.points, ...pts] })
  }
  const up = () => {
    if (erasing.current) {
      const before = erasing.current
      erasing.current = null
      if (before.strokes.length !== sketch.strokes.length) commit(sketch, before)
      return
    }
    const done = liveRef.current
    if (!done) return
    setLive(null)
    commit({ ...sketch, strokes: [...sketch.strokes, done] })
  }

  const inks = mode === "marker" ? MARKER_COLORS : PEN_COLORS
  const ink = mode === "marker" ? markerColor : penColor
  const empty = sketch.strokes.length === 0
  const drawing = mode !== "eraser"
  const pick = (m: Mode) => (pressed: boolean) => pressed && setMode(m)

  const tools = (
    // One Tab stop; the arrow keys move along it. On a phone it scrolls sideways (notes.css).
    <div className="sketch-tools" data-place={phone ? "below" : "above"}>
      <Toolbar aria-label="Drawing tools">
        <ToolbarToggle icon="pen" label="Pen" pressed={mode === "pen"} onPressedChange={pick("pen")} />
        <ToolbarToggle icon="text--highlight" label="Marker" pressed={mode === "marker"} onPressedChange={pick("marker")} />
        <ToolbarToggle icon="erase" label="Eraser" pressed={mode === "eraser"} onPressedChange={pick("eraser")} />
        <ToolbarSeparator />
        {/* The inks are the sketch's own stored values, drawn on its paper: content, not tokens (brief 1.3). */}
        <ToggleGroup aria-label="Ink" size="sm" value={[ink]} disabled={!drawing} onValueChange={(v) => v[0] && (mode === "marker" ? setMarkerColor(v[0]) : setPenColor(v[0]))}>
          {inks.map((c) => (
            <ToggleGroupItem key={c.value} value={c.value} size="sm" aria-label={c.name}>
              <span className="sketch-ink" aria-hidden>
                <span style={{ background: c.value }} />
              </span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <ToolbarSeparator />
        <ToggleGroup aria-label="Thickness" size="sm" value={[String(size)]} disabled={!drawing} onValueChange={(v) => v[0] && setSize(Number(v[0]))}>
          {SIZES.map((s, i) => (
            <ToggleGroupItem key={s.name} value={String(i)} size="sm" aria-label={s.name}>
              <span className="sketch-weight" aria-hidden style={{ height: 2 + i * 3 }} />
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <ToolbarSeparator />
        <ToolbarButton icon="undo" label="Undo" shortcut={`${mod}Z`} disabled={!past.length} onClick={undo} />
        <ToolbarButton icon="redo" label="Redo" shortcut={`${mod}⇧Z`} disabled={!future.length} onClick={redo} />
        {/* No question: Undo brings the strokes back. */}
        <ToolbarButton icon="clean" label="Clear" disabled={empty} onClick={() => commit({ ...sketch, strokes: [] })} />
        <ToolbarSeparator />
        <ToolbarButton icon="unfold--open" label="More room" disabled={sketch.h >= MAX_H} onClick={() => setSketch((s) => ({ ...s, h: Math.min(MAX_H, s.h + ROOM) }))} />
        {/* A phone's layer is the whole screen already. */}
        {!phone && <ToolbarToggle icon={full ? "minimize" : "maximize"} label="Full screen" pressed={full} onPressedChange={setFull} />}
      </Toolbar>
    </div>
  )

  const canvas = (
    // The paper is light in every theme, so the inks look the same everywhere; inside it, the stone ground's words.
    <div className="light sketch-paper" data-full={full ? "" : undefined}>
      <svg
        ref={svg}
        role="img"
        aria-label={empty ? "Empty sketch" : `Sketch with ${sketch.strokes.length} ${sketch.strokes.length === 1 ? "stroke" : "strokes"}`}
        viewBox={`0 0 ${sketch.w} ${sketch.h}`}
        data-tool={mode}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
      >
        {[...sketch.strokes, ...(live ? [live] : [])].map((s, i) => (
          <path key={i} d={strokePath(s)} {...strokeStyle(s)} />
        ))}
      </svg>
      {empty && !live && <p className="sketch-caption type-caption text-muted-foreground">Draw with a mouse, a finger or a pen.</p>}
    </div>
  )

  const footer = (
    <>
      <Button type="button" variant="ghost" onClick={() => void requestClose()}>
        Cancel
      </Button>
      <Button type="button" disabled={empty} onClick={() => onDone(sketch)}>
        {editing ? "Save sketch" : "Add to note"}
      </Button>
    </>
  )

  return (
    <>
      <AdaptiveDialog
        open
        onOpenChange={(o) => !o && void requestClose()}
        size={full ? "full" : "viewer"}
        height="full"
        overline="Sketch"
        title={editing ? "Edit sketch" : "Sketch"}
        closeOnOutsideClick={false}
        footer={footer}
      >
        <div className="sketch-body" data-phone={phone ? "" : undefined}>
          {!phone && tools}
          {canvas}
          {phone && tools}
        </div>
      </AdaptiveDialog>
      {confirm.question()}
    </>
  )
}

/**
 * A sketch whose strokes this device can't read (made elsewhere, or by an older or newer Vale): its
 * picture, and the reason it can't be edited (brief N3).
 */
function SketchPicture({ image, onClose }: { image: string; onClose: () => void }) {
  return (
    <AdaptiveDialog
      open
      onOpenChange={(o) => !o && onClose()}
      size="viewer"
      height="full"
      overline="Sketch"
      title="Edit sketch"
      footer={
        <Button type="button" variant="outline" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="sketch-body">
        <div className="light sketch-paper" data-still="">
          <img src={image} alt="The sketch" draggable={false} />
        </div>
        <p className="type-body text-muted-foreground">This sketch can&apos;t be edited here.</p>
      </div>
    </AdaptiveDialog>
  )
}
