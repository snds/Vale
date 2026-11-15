import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"

import { useUi } from "@/app/ui-store"
import { Button, FieldRow, FieldRowAction, FieldRowValue, Skeleton, toast } from "@unicron/ui"
import { FormLayer, FormLayerForm } from "@/components/editor-frame"
import { getCoreClient } from "@/core/client"
import { useNotesRelay, useThreadShare } from "@/core/queries"
import { useConfirm } from "@/lib/confirm"
import { useCopy } from "@/lib/copy"

import { useRowSize } from "../mail/invite-words"
import { openSyncSetup } from "../notes/open-sync-setup"
import { shareToken, shareUrl } from "../notes/share-link"

/**
 * Share with teammates (ADR-0060, ADR-0097; brief M9 A), in the form layer: a link through your notes relay.
 * People with it see a copy of the conversation in their Vale, comment beside it, and write the reply with
 * you. Only you send it. Three states: no relay (OPEN SYNC), not shared (CREATE LINK), shared (the link,
 * COPY LINK, EMAIL IT, STOP SHARING).
 */
export function ShareThreadLayer({ threadId, subject, open, onOpenChange }: { threadId: string; subject: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <FormLayer open={open} onClose={() => onOpenChange(false)}>
      {open && <ShareThreadForm threadId={threadId} subject={subject} onDone={() => onOpenChange(false)} />}
    </FormLayer>
  )
}

function ShareThreadForm({ threadId, subject, onDone }: { threadId: string; subject: string; onDone: () => void }) {
  const { data: relay, isPending } = useNotesRelay()
  const { data: share, isPending: loading } = useThreadShare(threadId)
  const qc = useQueryClient()
  const openComposer = useUi((s) => s.openComposer)
  const confirm = useConfirm()
  const size = useRowSize()
  const { copied, copy } = useCopy({ what: "link", label: "Link" })
  const [error, setError] = useState<string | null>(null)
  const refresh = () => qc.invalidateQueries({ queryKey: ["team"] })
  const create = useMutation({ mutationFn: () => getCoreClient().then((c) => c.shareThread(threadId)), onSettled: refresh, onError: (e) => setError(e.message) })
  const { data: link } = useQuery({
    queryKey: ["team", "link", share?.id, relay?.url],
    enabled: !!share && !!relay,
    queryFn: async () => shareUrl({ relay: relay!.url, id: share!.id, mode: "edit", token: await shareToken(relay!.token, share!.id), title: subject, from: share!.from, kind: "thread", ...(share!.key ? { k: share!.key } : {}) }),
  })

  const head = { overline: subject, title: "Share with teammates" }
  if (isPending || loading) {
    return (
      <FormLayerForm {...head} primary={{ label: "Create link", disabled: true }} onSubmit={() => {}}>
        <div role="status" aria-busy="true" aria-label="Looking for your relay" className="h-5 w-2/3 [&>*]:size-full">
          <Skeleton />
        </div>
      </FormLayerForm>
    )
  }

  // No notes relay: sharing needs one. OPEN SYNC sets it up (brief T5); a secondary, as M9 draws it.
  if (!relay) {
    const openSync = () => {
      onDone()
      openSyncSetup()
    }
    return (
      <FormLayerForm
        {...head}
        primary={{ label: "Open sync", icon: "settings" }}
        primaryControl={
          <Button type="submit" variant="secondary">
            Open sync
          </Button>
        }
        onSubmit={openSync}
      >
        <p className="type-body text-foreground">Sharing goes through your notes relay, the same one that syncs your notes.</p>
      </FormLayerForm>
    )
  }

  // Without a key, the relay holds the conversation as it holds your notes: said in full, as privacy lines are.
  const sealed = share ? !!share.key : !!relay.key
  const captions = (
    <div className="flex flex-col gap-1">
      <p className="type-caption text-muted-foreground">Teammates get the text, not attachments or images.</p>
      {!sealed && <p className="type-caption text-muted-foreground">Your relay can read it, as it can read your notes.</p>}
    </div>
  )

  if (!share) {
    return (
      <FormLayerForm {...head} primary={{ label: "Create link", icon: "link", loading: create.isPending }} error={error} onSubmit={() => create.mutate()}>
        <p className="type-body text-foreground">People with the link read it, comment, and help write the reply. Only you send it.</p>
        {captions}
      </FormLayerForm>
    )
  }

  // EMAIL IT: a new message to a teammate (M6), not a reply on the conversation itself.
  const emailIt = () => {
    if (!link) return
    onDone()
    openComposer({ subject: `Can you help with “${subject}”?`, body: `I shared a conversation with you, so we can write the reply together: “${subject}”.\n\nOpen it in Vale: ${link}\n` })
  }
  const stopSharing = async () => {
    const yes = await confirm.ask({
      title: "Stop sharing?",
      description: "The link stops working.",
      confirmLabel: "Stop sharing",
      run: async () => {
        await (await getCoreClient()).stopTeamThread(share.id)
        await refresh()
      },
    })
    if (!yes) return
    toast(`Stopped sharing ${subject}`)
    onDone()
  }
  return (
    <FormLayerForm
      {...head}
      cancel={false}
      primary={{ label: "Email it", icon: "email", disabled: !link }}
      primaryControl={
        <Button type="submit" variant="secondary" disabled={!link}>
          Email it
        </Button>
      }
      footerStart={
        <Button type="button" variant="ghost-destructive" onClick={() => void stopSharing()}>
          Stop sharing
        </Button>
      }
      onSubmit={emailIt}
    >
      <FieldRow
        size={size}
        label="Link"
        rule="none"
        action={
          <FieldRowAction type="button" disabled={!link} onClick={() => link && void copy(link)}>
            {copied ? "Copied" : "Copy link"}
          </FieldRowAction>
        }
      >
        <FieldRowValue truncate="middle">{link ?? "…"}</FieldRowValue>
      </FieldRow>
      {captions}
      {confirm.question()}
    </FormLayerForm>
  )
}
