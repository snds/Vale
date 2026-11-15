import { useQueryClient } from "@tanstack/react-query"
import { useRef, useState } from "react"

import { Button, NavItem, Progress } from "@unicron/ui"
import { FormLayerForm } from "@/components/editor-frame"
import { getCoreClient } from "@/core/client"
import type { ImportFile, ImportReport } from "@/core/types"
import { toBase64 } from "@/lib/base64"
import { prepareImage } from "@/lib/image"

const TEXT = /\.(md|markdown|txt|json|html)$/i
const IMAGE = /\.(jpe?g|png|webp|gif|svg)$/i
/** Bigger "notes" are almost certainly not notes; skip reading them. */
const MAX_BYTES = 2_000_000
/** What one import call carries, so a big vault goes in several (ADR-0044). */
const BATCH_BYTES = 8_000_000

/** Where notes come from (brief T5): each one is a folder to choose, with one line of how. */
const SOURCES = [
  { icon: "laptop", name: "Apple Notes", how: "Export them as Markdown on a Mac, then choose that folder." },
  { icon: "idea", name: "Google Keep", how: "Download Keep from Google Takeout, unzip it, and choose the Keep folder." },
  { icon: "folder", name: "Obsidian, Bear or any Markdown", how: "Choose a vault or export folder. Folders and #tags become tags." },
] as const

const pathOf = (f: File) => f.webkitRelativePath || f.name

/**
 * The picked files, in batches. Each note travels with the images it names
 * (by file name, as Markdown, Obsidian, and Keep write them), shrunk the way
 * the editor shrinks them. Other media is only counted, never read.
 */
async function read(list: FileList): Promise<ImportFile[][]> {
  const all = [...list]
  const texts: ImportFile[] = await Promise.all(
    all
      .filter((f) => !IMAGE.test(f.name))
      .map(async (f) => ({ path: pathOf(f), contents: TEXT.test(f.name) && f.size <= MAX_BYTES ? await f.text() : "", modified: Math.floor(f.lastModified / 1000) })),
  )
  const images = all.filter((f) => IMAGE.test(f.name))
  const named = (text: string, f: File) => {
    const t = text.toLowerCase()
    const n = f.name.toLowerCase()
    return t.includes(n) || t.includes(encodeURI(n))
  }
  const ready = new Map<File, ImportFile | null>()
  const prepared = async (f: File) => {
    if (!ready.has(f)) {
      // One that won't open (HEIC, say) is left out; the report counts it.
      // Sketches (SVG) go as they are; the core keeps only ones the app drew (ADR-0046).
      const data = /\.svg$/i.test(f.name) ? toBase64(new Uint8Array(await f.arrayBuffer())) : (await prepareImage(f).catch(() => null))?.dataBase64
      ready.set(f, data ? { path: pathOf(f), contents: "", dataBase64: data } : null)
    }
    return ready.get(f) ?? null
  }
  const batches: ImportFile[][] = []
  let batch: ImportFile[] = []
  let size = 0
  for (const t of texts) {
    const own: ImportFile[] = []
    for (const f of t.contents ? images.filter((i) => named(t.contents, i)) : []) {
      const img = await prepared(f)
      if (img) own.push(img)
    }
    const cost = t.contents.length + own.reduce((n, i) => n + (i.dataBase64?.length ?? 0), 0)
    if (batch.length && size + cost > BATCH_BYTES) {
      batches.push(batch)
      batch = []
      size = 0
    }
    batch.push(t, ...own.filter((i) => !batch.includes(i)))
    size += cost
  }
  if (batch.length) batches.push(batch)
  return batches
}

/** One report for every batch. */
const total = (rs: ImportReport[]): ImportReport =>
  rs.reduce((a, r) => ({
    imported: a.imported + r.imported,
    duplicates: a.duplicates + r.duplicates,
    trashed: a.trashed + r.trashed,
    attachmentsDropped: a.attachmentsDropped + r.attachmentsDropped,
    skipped: [...a.skipped, ...r.skipped],
  }))

/** "Imported 24 notes." and what was left as it was, from the core's report. */
function Report({ report }: { report: ImportReport }) {
  const lines = [
    report.duplicates > 0 && `${report.duplicates === 1 ? "1 note was" : `${report.duplicates} notes were`} imported before, and left as they are.`,
    report.trashed > 0 && `${report.trashed} in the trash, skipped.`,
    report.attachmentsDropped > 0 && `${report.attachmentsDropped === 1 ? "1 image or recording" : `${report.attachmentsDropped} images or recordings`} not brought over: missing, or a kind notes can't show yet.`,
    report.skipped.length > 0 && `${report.skipped.length === 1 ? "1 file wasn't a note" : `${report.skipped.length} files weren't notes`}.`,
  ].filter((l): l is string => !!l)
  return (
    <div role="status" className="flex flex-col gap-2">
      <p className="type-subtitle">{report.imported === 1 ? "Imported 1 note." : `Imported ${report.imported} notes.`}</p>
      {lines.map((l) => (
        <p key={l} className="type-caption text-text-secondary">
          {l}
        </p>
      ))}
    </div>
  )
}

/**
 * Import notes (brief T5; ADR-0044, ADR-0111), in the form layer: three
 * sources, each a folder to choose with one line of how; the primary CHOOSE
 * A FOLDER… and a secondary CHOOSE FILES…. While it runs, a segmented bar
 * (one step per batch) and "Importing…"; then "Imported N notes." and DONE.
 */
export function ImportForm({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState<{ done: number; of: number } | null>(null)
  const [report, setReport] = useState<ImportReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const filesRef = useRef<HTMLInputElement>(null)
  const folderRef = useRef<HTMLInputElement>(null)
  const qc = useQueryClient()

  const run = async (list: FileList | null) => {
    if (!list?.length) return
    setError(null)
    setBusy({ done: 0, of: 1 })
    try {
      const core = await getCoreClient()
      const batches = await read(list)
      const reports: ImportReport[] = []
      setBusy({ done: 0, of: batches.length })
      for (const batch of batches) {
        reports.push(await core.importNotes(batch))
        setBusy({ done: reports.length, of: batches.length })
      }
      setReport(reports.length ? total(reports) : { imported: 0, duplicates: 0, trashed: 0, attachmentsDropped: 0, skipped: [] })
      void qc.invalidateQueries({ queryKey: ["notes"] })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
      if (filesRef.current) filesRef.current.value = ""
      if (folderRef.current) folderRef.current.value = ""
    }
  }
  const chooseFolder = () => folderRef.current?.click()

  return (
    <FormLayerForm
      overline="Notes"
      title="Import notes"
      // Done, the form's one primary closes it; before, it chooses the folder.
      primary={report ? { label: "Done", icon: "checkmark" } : { label: "Choose a folder…", icon: "folder--open", loading: !!busy }}
      error={error}
      footerStart={
        !report && (
          <Button type="button" variant="secondary" disabled={!!busy} onClick={() => filesRef.current?.click()}>
            Choose files…
          </Button>
        )
      }
      onSubmit={report ? onDone : chooseFolder}
    >
      {report ? (
        <Report report={report} />
      ) : busy ? (
        <div className="flex flex-col gap-2">
          <Progress variant="segmented" segments={10} min={0} max={Math.max(busy.of, 1)} value={busy.done} aria-label="Importing notes" />
          <p role="status" className="type-caption text-text-secondary">
            Importing…
          </p>
        </div>
      ) : (
        <ul aria-label="Where notes come from" className="flex flex-col gap-1">
          {SOURCES.map((s) => (
            <li key={s.name}>
              <NavItem label={s.name} icon={s.icon} description={s.how} onClick={chooseFolder} />
            </li>
          ))}
        </ul>
      )}
      <p className="type-caption text-text-secondary">Notes are copied in. Nothing changes where they came from.</p>

      <input ref={filesRef} type="file" multiple hidden accept=".md,.markdown,.txt,.json,.html,.jpg,.jpeg,.png,.webp,.gif" onChange={(e) => void run(e.target.files)} />
      {/* webkitdirectory: every engine we ship in supports picking a folder. */}
      <input ref={folderRef} type="file" hidden {...{ webkitdirectory: "" }} onChange={(e) => void run(e.target.files)} />
    </FormLayerForm>
  )
}
