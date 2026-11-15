import { loadDoc, seed, stateOf } from "@/features/notes/ydoc"
import { toBase64 } from "@/lib/base64"
import { type Stroke, SKETCH_H, SKETCH_W, SVG_MIME, toSvg } from "@/lib/sketch"

import { NOTE_FILE, sampleSwatches } from "../demo-note-files"

import type { NoteShare } from "../types"
import type { DemoScenarios } from "../demo-scenarios"

/** A pen stroke through these points, at an even pressure. */
const pen = (points: [number, number][], size = 8): Stroke => ({ tool: "pen", color: "#1c1b1f", size, pressure: false, points: points.map(([x, y]) => [x, y, 0.5]) })
/** Points along a line, so the stroke has samples to shape, as a hand would leave them. */
const line = (a: [number, number], b: [number, number], n = 12): [number, number][] => Array.from({ length: n + 1 }, (_, i) => [a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n])
const ring = (cx: number, cy: number, r: number, n = 40): [number, number][] => Array.from({ length: n + 1 }, (_, i) => [cx + r * Math.cos((i / n) * 2 * Math.PI), cy + r * Math.sin((i / n) * 2 * Math.PI)])

/** The icon axis note's sketch: a bookmark glyph outlined and filled, with the arrow between them. */
function axisSketch(): string {
  const strokes: Stroke[] = [
    // Outlined, on the left.
    pen([...line([180, 200], [380, 200]), ...line([380, 200], [380, 500]), ...line([380, 500], [280, 430]), ...line([280, 430], [180, 500]), ...line([180, 500], [180, 200])]),
    // The arrow: fill animates on selection.
    pen(line([450, 350], [560, 350])),
    pen([...line([530, 320], [562, 350], 4), ...line([562, 350], [530, 380], 4)]),
    // Filled, on the right: the outline, then the fill as a marker.
    pen([...line([620, 200], [820, 200]), ...line([820, 200], [820, 500]), ...line([820, 500], [720, 430]), ...line([720, 430], [620, 500]), ...line([620, 500], [620, 200])]),
    { tool: "marker", color: "#facc15", size: 44, pressure: false, points: [...line([650, 240], [790, 240], 8), ...line([790, 300], [650, 300], 8), ...line([650, 360], [790, 360], 8), ...line([790, 420], [650, 420], 8)].map(([x, y]) => [x, y, 0.5]) },
    // A circle round the filled one: this is the selected state.
    pen(ring(720, 350, 210), 4),
  ]
  return toSvg({ v: 1, w: SKETCH_W, h: SKETCH_H, strokes })
}

/** The words on the scanned page, as the reader would have found them. */
const PAGE_TEXT = ["Optical size", "Below 20 px: open the counters, drop the hairlines.", "20 to 32 px: the drawn weight.", "Above 32 px: tighten the joins, keep the stroke at 2 px."]

/** A printed page, photographed and straightened: what a scan in a note looks like. */
async function scannedPage(): Promise<string> {
  const c = document.createElement("canvas")
  c.width = 1240
  c.height = 1754
  const g = c.getContext("2d")!
  g.fillStyle = "#f7f6f2"
  g.fillRect(0, 0, c.width, c.height)
  g.fillStyle = "#26252a"
  g.font = "600 64px Georgia, serif"
  g.fillText(PAGE_TEXT[0]!, 120, 220)
  g.font = "40px Georgia, serif"
  PAGE_TEXT.slice(1).forEach((l, i) => g.fillText(l, 120, 340 + i * 72))
  const url = c.toDataURL("image/jpeg", 0.85)
  return url.slice(url.indexOf(",") + 1)
}

/** Notes (ADR-0081, ADR-0105, ADR-0106, ADR-0108): notes, folders, locks, sharing and sync in states the sample data doesn't reach. */
export const notes: DemoScenarios = {
  /** A reminder on the gift list passed earlier this morning, so the note stands under DUE until it's marked done. */
  "notes-due": ({ client, wrap }) => {
    const seeded = (async () => {
      const gifts = (await client.listNotes({ search: null, tag: null, archived: false, folder: null })).find((n) => n.title.startsWith("Gift ideas"))
      if (gifts) await client.setNoteMeta(gifts.id, { remindAt: Math.floor(Date.now() / 1000) - 75 * 60 })
    })()
    // Every read of the notes waits for the reminder, so the first list already shows it.
    wrap("listNotes", (list) => async (query) => {
      await seeded
      return list(query)
    })
  },
  /** Nobody has written a note yet: every list of notes comes back empty. */
  "notes-empty": ({ wrap }) => {
    wrap("listNotes", () => async () => [])
    wrap("noteTags", () => async () => [])
    wrap("noteGraph", () => async () => ({ notes: [], links: [], items: [] }))
  },
  /** The notes can't be read: the core answers every list with an error. */
  "notes-read-fails": ({ wrap }) => {
    wrap("listNotes", () => async () => {
      throw new Error("The notes store is locked by another Vale window.")
    })
  },
  /**
   * The design review agenda is a note Priya shared with you for reading (ADR-0056): its text is her
   * document's, the share has no live relay here, and it can't be changed.
   */
  "notes-shared-read": ({ wrap }) => {
    const share: NoteShare = { id: "share-agenda", role: "guest", mode: "view", from: "Priya Raman", relay: null, token: null }
    const isAgenda = (title: string) => title.startsWith("Design review agenda")
    wrap("listNotes", (list) => async (query) => (await list(query)).map((n) => (isAgenda(n.title) ? { ...n, share } : n)))
    wrap("getNote", (get) => async (id) => {
      const n = await get(id)
      if (!isAgenda(n.title)) return n
      // A guest's text arrives as the owner's document, never as a seed of its own.
      const doc = loadDoc(null)
      seed(doc, n.markdown, n.id)
      return { ...n, share, ydoc: stateOf(doc) }
    })
  },
  /**
   * The design review agenda is a note Priya shared with you to edit (ADR-0056; brief N6): a guest's
   * note, so its overline ends `// SHARED // YOU CAN EDIT` and its menu offers Keep as my own note.
   */
  "notes-guest": ({ wrap }) => {
    const share: NoteShare = { id: "share-agenda-edit", role: "guest", mode: "edit", from: "Priya Raman", relay: null, token: null }
    const isAgenda = (title: string) => title.startsWith("Design review agenda")
    wrap("listNotes", (list) => async (query) => (await list(query)).map((n) => (isAgenda(n.title) ? { ...n, share } : n)))
    wrap("getNote", (get) => async (id) => {
      const n = await get(id)
      if (!isAgenda(n.title)) return n
      const doc = loadDoc(null)
      seed(doc, n.markdown, n.id)
      return { ...n, share, ydoc: stateOf(doc) }
    })
  },
  /**
   * Locked notes (ADR-0043; brief N5): a passphrase is set, with a hint, and the cabin packing list
   * is locked. Notes are locked now, as after the 10-minute idle lock, so the note asks for the
   * passphrase. The scenes type it: "lake house in october".
   */
  "notes-locked": ({ client, wrap }) => {
    const { listNotes } = client
    const seeded = (async () => {
      const cabin = (await listNotes({ search: null, tag: null, archived: false, folder: null })).find((n) => n.title.startsWith("Cabin packing list"))
      await client.setNotesPassphrase("lake house in october", "Where we go every fall, and when")
      if (cabin) await client.lockNote(cabin.id)
      await client.lockNotesNow()
    })()
    wrap("listNotes", (list) => async (query) => {
      await seeded
      return list(query)
    })
    wrap("notesLock", (info) => async () => {
      await seeded
      return info()
    })
  },
  /**
   * A notes relay on this device (brief N6), so a note can be shared by link. It has no key, so the
   * relay can read what syncs, and the share form says so. Nothing listens there in the demo: the
   * sync's socket is refused on this machine and never leaves it.
   */
  "notes-relay": ({ wrap }) => {
    wrap("getNotesRelay", () => async () => ({ url: "ws://localhost:1", token: "demo-relay-token-0123456789", key: null }))
  },
  /**
   * The icon axis note holds three images (ADR-0108): a sketch, a picture of hue ramps and a scanned
   * page whose text was read on this device, for the image toolbar and the viewer.
   */
  "notes-images": ({ client, wrap }) => {
    // The reads as they are before the wraps below, which wait for this seed.
    const { listNotes, getNote } = client
    const seeded = (async () => {
      const axis = (await listNotes({ search: null, tag: null, archived: false, folder: null })).find((n) => n.title.startsWith("Icon axis ideas"))
      if (!axis) return
      const note = await getNote(axis.id)
      const sketch = await client.addNoteFile(axis.id, SVG_MIME, toBase64(new TextEncoder().encode(axisSketch())), SKETCH_W, SKETCH_H)
      const ramps = await client.addNoteFile(axis.id, "image/png", await sampleSwatches(), 960, 540)
      const page = await client.addNoteFile(axis.id, "image/jpeg", await scannedPage(), 1240, 1754)
      // Read already: the sketch and the ramps have no words, the page has its four lines.
      await client.setNoteFileText(sketch.id, "")
      await client.setNoteFileText(ramps.id, "")
      await client.setNoteFileText(page.id, PAGE_TEXT.join("\n"))
      const images = [`![Fill on selection, sketched](${NOTE_FILE}${sketch.id})`, `![Six hue ramps, light to dark](${NOTE_FILE}${ramps.id})`, `![Scanned document](${NOTE_FILE}${page.id})`]
      await client.saveNoteBody(axis.id, `${note.markdown}\n\n${images.join("\n\n")}`, null, false)
    })()
    // Every read of the notes waits for the images, so the note opens with them.
    wrap("listNotes", (list) => async (query) => {
      await seeded
      return list(query)
    })
    wrap("getNote", (get) => async (id) => {
      await seeded
      return get(id)
    })
  },
}
