import { useState } from "react"

import { Button, FileChip, IconButton } from "@unicron/ui"
import { getCoreClient } from "@/core/client"
import { useThread } from "@/core/queries"
import { toBase64 } from "@/lib/base64"

import { displayName, formatSize } from "../mail/format"
import { MAX_SHARED_FILE, type SharedAttachment, attachmentBlob } from "../notes/shared-files"
import { teamSync, useTeamVersions } from "./team-sync"

/** What a shared conversation's files are: the attachments its owner chose to share. */
function useSharedFiles(id: string): SharedAttachment[] {
  useTeamVersions((s) => s[id] ?? 0)
  const files = teamSync()?.files(id)
  return files ? [...files.attachments.values()].sort((a, b) => a.at - b.at) : []
}

/** The conversation's own attachments, for the owner to choose from (inline images stay behind). */
function useOwnFiles(threadId: string | null) {
  const { data: thread = [] } = useThread(threadId)
  return thread.flatMap((m) => m.attachments.filter((a) => !a.inline).map((a) => ({ a, m })))
}

/**
 * The owner's FILES (ADR-0061; brief M9): each of the conversation's attachments as a FileChip, with SHARE or
 * STOP SHARING. Nothing goes until it is chosen. Over 10 MB, the chip's critical state says why it can't.
 */
export function OwnerFiles({ shareId, threadId, readOnly = false }: { shareId: string; threadId: string; readOnly?: boolean }) {
  const all = useOwnFiles(threadId)
  const shared = useSharedFiles(shareId)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  if (all.length === 0) return <p className="type-body text-muted-foreground">This conversation has no attachments.</p>
  const share = async ({ a, m }: (typeof all)[number]) => {
    const files = teamSync()?.files(shareId)
    if (!files) return setError("The relay can't be reached, so files can't be shared now.")
    setError(null)
    setBusy(a.id)
    try {
      const bytes = new Uint8Array((await getCoreClient().then((c) => c.attachmentData(a.id))) as ArrayBuffer)
      files.attachments.set(a.id, { id: a.id, name: a.filename, mime: a.mimeType, size: bytes.length, from: displayName(m.from), at: m.date, data: toBase64(bytes) })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }
  return (
    <div className="flex flex-col gap-4">
      <ul aria-label="Files" className="flex flex-wrap gap-2">
        {all.map(({ a, m }) => {
          const on = shared.some((s) => s.id === a.id)
          const big = a.size > MAX_SHARED_FILE
          return (
            <li key={a.id} data-role="team-file">
              <FileChip
                name={a.filename}
                size={`${formatSize(a.size)} // ${on ? "Shared" : "Only you"}`}
                busy={busy === a.id}
                critical={big ? "Over 10 MB, too big to share" : undefined}
                action={
                  readOnly || big ? undefined : on ? (
                    <Button variant="ghost" size="sm" onClick={() => teamSync()?.files(shareId)?.attachments.delete(a.id)}>
                      Stop sharing
                    </Button>
                  ) : (
                    <Button variant="ghost" size="sm" disabled={busy === a.id} onClick={() => void share({ a, m })} aria-label={`Share ${a.filename}`}>
                      Share
                    </Button>
                  )
                }
              />
            </li>
          )
        })}
      </ul>
      {error && (
        <p role="alert" className="type-caption text-destructive">
          {error}
        </p>
      )}
      <p className="type-caption text-muted-foreground">Attachments stay with you until you share them, up to 10 MB each.</p>
    </div>
  )
}

/** A teammate's FILES: what the owner shared, each with DOWNLOAD. */
export function TeammateFiles({ shareId }: { shareId: string }) {
  const shared = useSharedFiles(shareId)
  if (shared.length === 0) return <p className="type-body text-muted-foreground">No files shared yet.</p>
  const save = (a: SharedAttachment) => {
    const url = URL.createObjectURL(attachmentBlob(a))
    const link = document.createElement("a")
    link.href = url
    link.download = a.name
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }
  return (
    <ul aria-label="Files" className="flex flex-wrap gap-2">
      {shared.map((a) => (
        <li key={a.id} data-role="team-file">
          <FileChip name={a.name} size={formatSize(a.size)} onClick={() => save(a)} action={<IconButton icon="download" label={`Download ${a.name}`} size="icon-sm" onClick={() => save(a)} />} />
        </li>
      ))}
    </ul>
  )
}
