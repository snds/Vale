import { type KeyboardEvent, type PointerEvent, useEffect, useMemo, useRef, useState } from "react"

import { EmptyState, FilterChip, FilterChipGroup, Icon, Toolbar, ToolbarButton, ToolbarSeparator, ToolbarToggle, toast } from "@unicron/ui"
import { useNoteGraph } from "@/core/queries"
import type { NoteGraph, NoteLinkKind, NoteQuery, NoteSummary } from "@/core/types"
import { noteSwatch, swatchId } from "@/lib/swatches"

import { bounds, layout, nearestInDirection, type Pt } from "./graph-layout"
import { NOTE_COLOR_LABEL } from "./note-color"
import { LINK_ICON, useOpenLink } from "./use-open-link"

/** The map of notes (ADR-0053, ADR-0105): notes as small squares, the
 * `[[links]]` between them as hairlines, and the events, people, and
 * conversations they link to as outlined squares with their glyph. It shows the notes the
 * list would (search, tag, and folder apply), lays them out once, and holds
 * still. Pan, zoom, and drag to rearrange; a tap opens what it lands on. */

type Kind = "note" | NoteLinkKind
interface GNode {
  id: string
  kind: Kind
  label: string
  note?: NoteSummary
  /** An item's id on this device; `null` when it isn't here. */
  target?: string | null
}

/** The map's inks, all roles (ADR-0105): squares on the raised surface, hairline links, the primary only for the selection. */
const INK = {
  body: "var(--text-body)",
  label: "var(--text-label)",
  link: "var(--text-faint)",
  ground: "var(--surface-ground)",
  raised: "var(--surface-raised)",
  soft: "var(--primary-soft)",
  primary: "var(--primary-fill)",
  ring: "var(--ring)",
}
const KIND_NAME: Record<NoteLinkKind, [string, string]> = {
  event: ["Event", "Events"],
  contact: ["Person", "People"],
  thread: ["Conversation", "Conversations"],
}
const ITEM_KINDS: NoteLinkKind[] = ["event", "contact", "thread"]
const MIN_ZOOM = 0.2
/** The map's least height, in px (`min-h-80`): below it, the column scrolls. */
const MIN_HEIGHT = 320
const MAX_ZOOM = 3

const short = (s: string) => (s.length > 28 ? `${s.slice(0, 27).trimEnd()}…` : s)

export function NoteGraphView({ query, selectedId, onOpenNote }: { query: NoteQuery; selectedId: string | null; onOpenNote: (id: string) => void }) {
  const { data, isPending } = useNoteGraph(query, true)
  const openLink = useOpenLink()
  const [hidden, setHidden] = useState<Set<NoteLinkKind>>(new Set())
  const [unlinked, setUnlinked] = useState(true)
  const { nodes, edges, counts } = useMemo(() => build(data, hidden, unlinked), [data, hidden, unlinked])

  // Positions survive refetches and filter changes, so the map only nudges.
  const placed = useRef(new Map<string, Pt>())
  // Nodes you've dragged stay where you left them; the next layout starts from there too.
  const [moved, setMoved] = useState(new Map<string, Pt>())
  const base = useMemo(() => {
    const index = new Map(nodes.map((n, i) => [n.id, i]))
    return layout(
      nodes.map((n) => n.id),
      edges.map(([a, b]) => [index.get(a)!, index.get(b)!] as [number, number]),
      new Map([...placed.current, ...moved]),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a drag moves one node; it doesn't lay the map out again
  }, [nodes, edges])
  const pos = useMemo(() => {
    if (!moved.size) return base
    const out = new Map(base)
    for (const [id, p] of moved) if (out.has(id)) out.set(id, p)
    return out
  }, [base, moved])
  useEffect(() => {
    for (const [id, p] of pos) placed.current.set(id, p)
  }, [pos])

  const neighbors = useMemo(() => {
    const m = new Map<string, Set<string>>(nodes.map((n) => [n.id, new Set()]))
    for (const [a, b] of edges) {
      m.get(a)!.add(b)
      m.get(b)!.add(a)
    }
    return m
  }, [nodes, edges])

  // The view: screen = map × k + (x, y). Fits itself until you pan or zoom.
  const box = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [view, setView] = useState({ x: 0, y: 0, k: 1 })
  const steered = useRef(false)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setSize({ w: e!.contentRect.width, h: e!.contentRect.height }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  // The map fills what is left of its column under the head, down to the column's own clearance (the phone's
  // floating bottom row), so its toolbar stands at the column's foot. The column scrolls, so no height reaches it.
  const [room, setRoom] = useState<number | null>(null)
  useEffect(() => {
    const el = box.current
    const column = el?.closest<HTMLElement>("[data-scroll-root]")
    if (!el || !column) return
    const measure = () => {
      const top = el.getBoundingClientRect().top - column.getBoundingClientRect().top + column.scrollTop
      const clear = parseFloat(getComputedStyle(column).paddingBottom) || 0
      setRoom(Math.max(MIN_HEIGHT, Math.floor(column.clientHeight - clear - top)))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(column)
    return () => ro.disconnect()
  }, [])
  const fit = () => {
    if (!size.w || !size.h) return
    const b = bounds(pos.values(), 60)
    const k = Math.min(Math.max(Math.min(size.w / (b.x1 - b.x0), size.h / (b.y1 - b.y0)), MIN_ZOOM), 1.4)
    setView({
      k,
      x: size.w / 2 - ((b.x0 + b.x1) / 2) * k,
      y: size.h / 2 - ((b.y0 + b.y1) / 2) * k,
    })
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- refit on new data or size, unless steered
  useEffect(() => void (!steered.current && fit()), [base, size.w, size.h])
  const zoomBy = (f: number, cx = size.w / 2, cy = size.h / 2) => {
    steered.current = true
    setView((v) => {
      const k = Math.min(Math.max(v.k * f, MIN_ZOOM), MAX_ZOOM)
      return {
        k,
        x: cx - ((cx - v.x) * k) / v.k,
        y: cy - ((cy - v.y) * k) / v.k,
      }
    })
  }
  const refit = () => {
    steered.current = false
    fit()
  }

  // Wheel and trackpad pinch zoom around the pointer; React's wheel events are passive, so this one isn't.
  useEffect(() => {
    const el = box.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      zoomBy(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX - r.left, e.clientY - r.top)
    }
    el.addEventListener("wheel", onWheel, { passive: false })
    return () => el.removeEventListener("wheel", onWheel)
  })

  // Pointers: drag the background to pan, two fingers to zoom, a node to move it. A tap opens.
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const grab = useRef<{
    id: string | null
    x: number
    y: number
    travel: number
    pinch?: number
  } | null>(null)
  const down = (e: PointerEvent<SVGSVGElement>) => {
    const id = (e.target as Element).closest("[data-node]")?.getAttribute("data-node") ?? null
    e.currentTarget.setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      grab.current = {
        id: null,
        x: 0,
        y: 0,
        travel: 99,
        pinch: Math.hypot(a!.x - b!.x, a!.y - b!.y),
      }
    } else grab.current = { id, x: e.clientX, y: e.clientY, travel: 0 }
  }
  const move = (e: PointerEvent<SVGSVGElement>) => {
    const g = grab.current
    if (!g || !pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (g.pinch && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      const d = Math.hypot(a!.x - b!.x, a!.y - b!.y)
      const r = box.current!.getBoundingClientRect()
      zoomBy(d / g.pinch, (a!.x + b!.x) / 2 - r.left, (a!.y + b!.y) / 2 - r.top)
      g.pinch = d
      return
    }
    const dx = e.clientX - g.x
    const dy = e.clientY - g.y
    g.travel += Math.abs(dx) + Math.abs(dy)
    g.x = e.clientX
    g.y = e.clientY
    if (g.travel < 5) return
    if (g.id) {
      const p = pos.get(g.id)
      if (p) setMoved((m) => new Map(m).set(g.id!, { x: p.x + dx / view.k, y: p.y + dy / view.k }))
    } else {
      steered.current = true
      setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }))
    }
  }
  const up = (e: PointerEvent<SVGSVGElement>) => {
    const g = grab.current
    pointers.current.delete(e.pointerId)
    if (pointers.current.size === 0) grab.current = null
    if (g && !g.pinch && g.id && g.travel < 5) activate(g.id)
  }

  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes])
  const activate = (id: string) => {
    const n = byId.get(id)
    if (!n) return
    setActive(id)
    if (n.kind === "note") onOpenNote(id)
    else if (n.target) void openLink(n.kind, n.target)
    else toast(`${n.label} isn't on this device`)
  }

  // Keyboard: one node takes Tab; arrows walk to the nearest node that way (linked ones first).
  const [active, setActive] = useState<string | null>(null)
  const [focusVisible, setFocusVisible] = useState(false)
  const [hover, setHover] = useState<string | null>(null)
  const nodeEls = useRef(new Map<string, SVGGElement>())
  const tabStop = active && byId.has(active) ? active : selectedId && byId.has(selectedId) ? selectedId : nodes[0]?.id
  const keyDown = (e: KeyboardEvent<SVGGElement>, id: string) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      activate(id)
    } else if (e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault()
      const from = pos.get(id)!
      const near = (ids: Iterable<string>) =>
        nearestInDirection(
          from,
          e.key as "ArrowUp",
          [...ids].filter((o) => o !== id).map((o) => [o, pos.get(o)!] as [string, Pt]),
        )
      const next = near(neighbors.get(id) ?? []) ?? near(pos.keys())
      if (next) {
        setActive(next)
        nodeEls.current.get(next)?.focus()
        keepInView(next)
      }
    } else if (e.key === "+" || e.key === "=") zoomBy(1.25)
    else if (e.key === "-") zoomBy(0.8)
    else if (e.key === "0") refit()
  }
  const keepInView = (id: string) => {
    const p = pos.get(id)
    if (!p) return
    const sx = p.x * view.k + view.x
    const sy = p.y * view.k + view.y
    if (sx < 40 || sy < 40 || sx > size.w - 40 || sy > size.h - 40) {
      steered.current = true
      setView((v) => ({
        ...v,
        x: size.w / 2 - p.x * v.k,
        y: size.h / 2 - p.y * v.k,
      }))
    }
  }

  // What's lit: the hovered or focused node and its neighbors; the rest fades.
  const lit = hover ?? (focusVisible ? active : null)
  const litSet = lit ? new Set([lit, ...(neighbors.get(lit) ?? [])]) : null
  const scale = Math.min(Math.max(view.k, 0.6), 1.4)
  const showAllLabels = view.k >= 0.75 || nodes.length <= 40
  const at = (id: string) => {
    const p = pos.get(id) ?? { x: 0, y: 0 }
    return { x: p.x * view.k + view.x, y: p.y * view.k + view.y }
  }
  // Half a square's side: notes grow a little with their links; linked items are one size, to hold their glyph.
  const half = (n: GNode) => (n.kind === "note" ? 6 + 1.5 * Math.sqrt(neighbors.get(n.id)?.size ?? 0) : 11) * scale

  const noteCount = nodes.filter((n) => n.kind === "note").length
  const summary = `${noteCount} ${noteCount === 1 ? "note" : "notes"} and ${nodes.length - noteCount} linked ${nodes.length - noteCount === 1 ? "item" : "items"}, with ${edges.length} ${edges.length === 1 ? "connection" : "connections"}.`
  const kinds = ITEM_KINDS.filter((k) => counts[k] > 0)

  return (
    <div ref={box} data-slot="note-graph" className="relative min-h-80 touch-none overflow-hidden select-none" style={room ? { height: room } : undefined}>
      {kinds.length > 0 && (
        // The map's legend, and what it shows: each kind of linked item, on or off.
        <div className="absolute top-0 left-0 z-10 max-w-full px-4 pb-2">
          <FilterChipGroup
            type="multiple"
            scroll
            label="Show on the map"
            value={kinds.filter((k) => !hidden.has(k))}
            onValueChange={(on) => setHidden(new Set(kinds.filter((k) => !on.includes(k))))}
          >
            {kinds.map((k) => (
              <FilterChip key={k} value={k} count={counts[k]}>
                {KIND_NAME[k][1]}
              </FilterChip>
            ))}
          </FilterChipGroup>
        </div>
      )}

      {!isPending && nodes.length === 0 ? (
        <div className="absolute inset-x-0 top-1/4">
          {data?.notes.length ? (
            <EmptyState size="sm" title="Nothing to show." body="Turn on unlinked notes." />
          ) : (
            <EmptyState size="sm" overline="Map // 00" title="No notes to map." />
          )}
        </div>
      ) : (
        <svg
          className="block size-full cursor-grab active:cursor-grabbing"
          role="group"
          aria-label="Map of notes"
          aria-describedby="note-graph-summary"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
        >
          {/* Links are hairlines. */}
          <g aria-hidden>
            {edges.map(([a, b]) => {
              const pa = at(a)
              const pb = at(b)
              const on = !litSet || (litSet.has(a) && litSet.has(b) && (a === lit || b === lit))
              return <line key={`${a} ${b}`} x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y} stroke={litSet && on ? INK.body : INK.link} strokeWidth={1} strokeOpacity={litSet && !on ? 0.2 : 1} />
            })}
          </g>
          {nodes.map((n) => {
            const p = at(n.id)
            const h = half(n)
            const dim = litSet && !litSet.has(n.id)
            const selected = n.id === selectedId
            const label = n.kind === "note" ? n.label || "New note" : n.label
            const showLabel = showAllLabels || selected || (litSet?.has(n.id) ?? false) || (neighbors.get(n.id)?.size ?? 0) >= 4
            const links = neighbors.get(n.id)?.size ?? 0
            const name =
              n.kind === "note"
                ? `${label}${n.note?.color ? `, ${NOTE_COLOR_LABEL[n.note.color]}` : ""}${n.note?.locked ? ", locked" : ""}, ${links} ${links === 1 ? "link" : "links"}`
                : `${KIND_NAME[n.kind][0]}: ${label}, ${links} ${links === 1 ? "note" : "notes"}${n.target ? "" : ", not on this device"}`
            const swatch = n.kind === "note" ? noteSwatch(n.note?.color) : null
            return (
              <g
                key={n.id}
                ref={(el) => void (el ? nodeEls.current.set(n.id, el) : nodeEls.current.delete(n.id))}
                data-node={n.id}
                data-kind={n.kind}
                data-selected={selected || undefined}
                role="button"
                tabIndex={n.id === tabStop ? 0 : -1}
                aria-label={name}
                aria-current={selected || undefined}
                className="cursor-pointer outline-none"
                opacity={dim ? 0.25 : 1}
                onPointerEnter={(e) => e.pointerType === "mouse" && setHover(n.id)}
                onPointerLeave={() => setHover((h) => (h === n.id ? null : h))}
                onFocus={(e) => (setActive(n.id), setFocusVisible(e.currentTarget.matches(":focus-visible")))}
                onBlur={() => setFocusVisible(false)}
                onKeyDown={(e) => keyDown(e, n.id)}
              >
                {/* Selected: a 2 px outline in the primary fill around the square, which turns primary-soft. Never solid. */}
                {selected && <rect data-role="selection" x={p.x - h - 3} y={p.y - h - 3} width={2 * h + 6} height={2 * h + 6} fill="none" stroke={INK.primary} strokeWidth={2} />}
                {focusVisible && active === n.id && <rect x={p.x - h - 6} y={p.y - h - 6} width={2 * h + 12} height={2 * h + 12} fill="none" stroke={INK.ring} strokeWidth={2} />}
                {n.kind === "note" ? (
                  // A note: a small square; its color is the square's edge.
                  <rect
                    data-role="square"
                    x={p.x - h}
                    y={p.y - h}
                    width={2 * h}
                    height={2 * h}
                    fill={selected ? INK.soft : INK.raised}
                    stroke={swatch ? `var(--swatch-${swatchId(swatch)})` : INK.label}
                    strokeWidth={swatch ? 2 : 1}
                  />
                ) : (
                  <>
                    {/* A linked item: an outlined square with its glyph; dashed when it is not on this device. */}
                    <rect
                      data-role="square"
                      x={p.x - h}
                      y={p.y - h}
                      width={2 * h}
                      height={2 * h}
                      fill={selected ? INK.soft : INK.ground}
                      stroke={INK.label}
                      strokeWidth={1}
                      strokeDasharray={n.target ? undefined : "2 2"}
                    />
                    <g color={INK.label}>
                      <Icon name={LINK_ICON[n.kind]} x={p.x - h * 0.65} y={p.y - h * 0.65} width={h * 1.3} height={h * 1.3} />
                    </g>
                  </>
                )}
                {/* A bigger, unseen hit area, so small squares are easy to tap. */}
                <rect x={p.x - Math.max(h, 16)} y={p.y - Math.max(h, 16)} width={2 * Math.max(h, 16)} height={2 * Math.max(h, 16)} fill="transparent" />
                {showLabel && (
                  <text
                    x={p.x}
                    y={p.y + h + 14}
                    textAnchor="middle"
                    className={selected || lit === n.id ? "type-meta font-semibold" : "type-meta"}
                    fill={INK.body}
                    stroke={INK.ground}
                    strokeWidth={3}
                    strokeLinejoin="round"
                    paintOrder="stroke"
                    aria-hidden
                  >
                    {short(label)}
                  </text>
                )}
              </g>
            )
          })}
        </svg>
      )}

      <p id="note-graph-summary" className="sr-only">
        {summary} Use the arrow keys to move between them, Enter to open one, and plus or minus to zoom.
      </p>
      {/* The map's tools, bottom right, on the raised surface so they hold over the squares. */}
      <div className="absolute right-4 bottom-4 z-10 bg-surface-raised rule-box">
        <Toolbar aria-label="Map">
          <ToolbarButton label="Zoom in" icon="zoom--in" shortcut="+" onClick={() => zoomBy(1.25)} />
          <ToolbarButton label="Zoom out" icon="zoom--out" shortcut="−" onClick={() => zoomBy(0.8)} />
          <ToolbarButton label="Fit" icon="fit-to-screen" shortcut="0" onClick={refit} />
          <ToolbarSeparator />
          <ToolbarToggle label="Unlinked notes" pressed={unlinked} onPressedChange={setUnlinked} />
        </Toolbar>
      </div>
    </div>
  )
}

/** Nodes and edges to draw: notes first (in list order), then what they link to. */
function build(g: NoteGraph | undefined, hidden: Set<NoteLinkKind>, unlinked: boolean) {
  const counts = { event: 0, contact: 0, thread: 0, unlinked: 0 }
  if (!g) return { nodes: [] as GNode[], edges: [] as [string, string][], counts }
  const edges: [string, string][] = g.links.map((l) => [l.from, l.to])
  const items: GNode[] = []
  for (const i of g.items) {
    counts[i.kind]++
    if (hidden.has(i.kind)) continue
    const id = `${i.kind}:${i.key}`
    items.push({ id, kind: i.kind, label: i.label, target: i.target ?? null })
    for (const n of i.notes) edges.push([n, id])
  }
  const linked = new Set(edges.flat())
  const notes: GNode[] = []
  for (const n of g.notes) {
    if (!linked.has(n.id)) {
      counts.unlinked++
      if (!unlinked) continue
    }
    notes.push({ id: n.id, kind: "note", label: n.title, note: n })
  }
  return { nodes: [...notes, ...items], edges, counts }
}
