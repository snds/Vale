import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"

import { useUi } from "@/app/ui-store"
import {
  AdaptiveDialog,
  AdaptiveMenu,
  AdaptiveMenuRadioGroup,
  AdaptiveMenuRadioItem,
  Banner,
  Button,
  FieldRow,
  FieldRowAction,
  FieldRowValue,
  Icon,
  RadioGroup,
  RadioRow,
  TextField,
  toast,
  useAppFrame,
} from "@unicron/ui"
import { FormLayer, FormLayerForm } from "@/components/editor-frame"
import { useAccounts, useNoteAction, useNotesRelay } from "@/core/queries"
import type { NoteSummary, ShareMode } from "@/core/types"
import { useConfirm } from "@/lib/confirm"
import { useCopy } from "@/lib/copy"

import { openSyncSetup } from "./open-sync-setup"
import { type ShareLink, parseShareUrl, shareToken, shareUrl } from "./share-link"
import { useAddShared } from "./use-add-shared"
import { useOpenTeamLink } from "../team/use-open-team-link"

const MODE_WORD: Record<ShareMode, string> = { edit: "Can edit", view: "Can view" }
/** A note's name in the layer and its toasts: its title, or "note" while it has none. */
const named = (title: string) => title.trim() || "New note"
const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

/**
 * Share a note by link (ADR-0056; brief N6), in the form layer: `Share
 * "{title}"`. Three states:
 *
 * - **No notes relay:** sharing goes through it; OPEN SYNC sets one up.
 * - **Not shared:** CAN EDIT or CAN VIEW, each with its sentence; CREATE LINK.
 * - **Shared:** LINK with COPY LINK; PEOPLE WITH THE LINK with CHANGE; EMAIL
 *   IT; STOP SHARING, which asks first.
 *
 * Under both of the last two, what stays private: images stay with you, and
 * without a key the relay can read the note.
 */
export function ShareNote({ note, open, onOpenChange }: { note: NoteSummary; open: boolean; onOpenChange: (open: boolean) => void; onSetUpSync?: () => void }) {
  const { data: relay, isPending } = useNotesRelay()
  const { data: accounts = [] } = useAccounts()
  const qc = useQueryClient()
  const phone = useAppFrame().phone
  // The open note shows its share too, so it refreshes with the lists.
  const refreshNote = () => void qc.invalidateQueries({ queryKey: ["notes", "note", note.id] })
  const share = useNoteAction((c, mode: ShareMode) => c.shareNote(note.id, mode).finally(refreshNote))
  const stop = useNoteAction<void>((c) => c.unshareNote(note.id).finally(refreshNote))
  const openComposer = useUi((s) => s.openComposer)
  const confirm = useConfirm()
  const live = note.share && note.share.role === "owner" && !note.share.revoked ? note.share : null
  // Not shared yet: the choice before CREATE LINK. Shared: the link's mode, or the one being saved.
  const [choice, setChoice] = useState<ShareMode>("edit")
  const mode: ShareMode = live ? (share.isPending && share.variables ? share.variables : live.mode) : choice
  const [error, setError] = useState<string | null>(null)
  const from = accounts[0] ? accounts[0].displayName || accounts[0].address : null
  const { data: link } = useQuery({
    queryKey: ["notes", "share-link", live?.id, live?.mode, relay?.url, note.title, from],
    enabled: !!live && !!relay,
    queryFn: async () => shareUrl({ relay: relay!.url, id: live!.id, mode: live!.mode, token: await shareToken(relay!.token, live!.id), title: note.title, from, ...(live!.key ? { k: live!.key } : {}) }),
  })
  const { copied, copy } = useCopy({ what: "link", label: "Share link" })
  const title = named(note.title)
  // Each opening starts afresh.
  const openChange = (next: boolean) => {
    if (!next) {
      setChoice("edit")
      setError(null)
    }
    onOpenChange(next)
  }
  const close = () => openChange(false)

  const change = (m: ShareMode) => {
    setError(null)
    if (!live) return setChoice(m)
    // A setting is silent when it saves; on failure it goes back, with the server's words beside it (decisions §5).
    if (m !== live.mode) share.mutate(m, { onError: (e) => setError(message(e)) })
  }
  const create = () => {
    setError(null)
    share.mutate(mode, { onError: (e) => setError(message(e)) })
  }
  const email = () => {
    if (!link) return
    close()
    openComposer({
      subject: note.title || "A shared note",
      body: `I shared a note with you${live?.mode === "view" ? " to read" : ""}: “${title}”.\n\nOpen it in Vale: ${link}\n`,
    })
  }
  const stopSharing = async () => {
    const yes = await confirm.ask({ title: "Stop sharing?", description: "The link stops working.", confirmLabel: "Stop sharing", run: () => stop.mutateAsync() })
    if (!yes) return
    close()
    toast(`Stopped sharing ${title}`)
  }

  // A share made with the relay's key is end to end; without one the relay can read it, as it reads the rest.
  const sealed = live ? !!live.key : !!relay?.key
  const captions = (
    <div className="flex flex-col gap-1" data-role="share-privacy">
      <p className="type-caption text-muted-foreground">Images in the note stay with you.</p>
      {!sealed && <p className="type-caption text-muted-foreground">Your relay can read shared notes, as it can read the rest.</p>}
    </div>
  )
  const failed = error ? <Banner tone="critical" size="compact" body={error} /> : null
  const rowSize = phone ? "stacked" : "default"

  let body = null
  let footer = null
  if (isPending) {
    body = null
  } else if (!relay) {
    // Shared notes live on your relay: without one, there's nowhere for the other person to reach.
    body = <p className="type-body text-muted-foreground">Sharing works through your notes relay, the same one that syncs your devices.</p>
    footer = (
      <Button
        variant="secondary"
        onClick={() => {
          close()
          openSyncSetup()
        }}
      >
        Open sync
      </Button>
    )
  } else if (!live) {
    body = (
      <>
        <RadioGroup aria-label="People with the link" value={mode} onValueChange={(v) => change(v as ShareMode)}>
          <RadioRow value="edit" label="Can edit" description="Anyone with the link can change this note." />
          <RadioRow value="view" label="Can view" description="Anyone with the link can read it." />
        </RadioGroup>
        {captions}
        {failed}
      </>
    )
    footer = (
      <>
        <Button variant="secondary" onClick={close}>
          Cancel
        </Button>
        <Button onClick={create} loading={share.isPending}>
          Create link
        </Button>
      </>
    )
  } else {
    body = (
      <>
        <div className="flex flex-col">
          <FieldRow
            size={rowSize}
            label="Link"
            action={
              <FieldRowAction onClick={() => link && void copy(link)} disabled={!link}>
                {copied ? "Copied" : "Copy link"}
              </FieldRowAction>
            }
          >
            <FieldRowValue truncate="middle" data-role="share-link">
              {link ?? "…"}
            </FieldRowValue>
          </FieldRow>
          <FieldRow
            size={rowSize}
            label="People with the link"
            rule="both"
            action={
              <AdaptiveMenu trigger={<FieldRowAction>Change</FieldRowAction>} title="People with the link" align="end">
                <AdaptiveMenuRadioGroup value={mode} onValueChange={(v) => change(v as ShareMode)}>
                  <AdaptiveMenuRadioItem value="edit">Can edit</AdaptiveMenuRadioItem>
                  <AdaptiveMenuRadioItem value="view">Can view</AdaptiveMenuRadioItem>
                </AdaptiveMenuRadioGroup>
              </AdaptiveMenu>
            }
          >
            {MODE_WORD[mode]}
          </FieldRow>
        </div>
        {captions}
        {failed}
      </>
    )
    footer = (
      <>
        <span className="mr-auto">
          <Button variant="ghost" onClick={() => void stopSharing()}>
            Stop sharing
          </Button>
        </span>
        <Button variant="secondary" onClick={email} disabled={!link}>
          <Icon name="email" data-icon="inline-start" /> Email it
        </Button>
      </>
    )
  }

  return (
    <>
      <AdaptiveDialog open={open} onOpenChange={openChange} size="form" overline={live ? "Note // shared" : "Note"} title={`Share “${title}”`} footer={footer}>
        {open && body}
      </AdaptiveDialog>
      {confirm.question()}
    </>
  )
}

/**
 * Open a shared note (brief N6), from Notes' folders at every width and the
 * command menu, in the form layer: LINK, then what the link is, and ADD TO
 * MY NOTES, or OPEN IN TEAM for a conversation's link (ADR-0060).
 */
export function OpenSharedLink({ open, onOpenChange, initial }: { open: boolean; onOpenChange: (open: boolean) => void; initial?: string }) {
  return (
    <FormLayer open={open} onClose={() => onOpenChange(false)}>
      {open && <OpenSharedForm initial={initial ?? ""} onDone={() => onOpenChange(false)} />}
    </FormLayer>
  )
}

function OpenSharedForm({ initial, onDone }: { initial: string; onDone: () => void }) {
  const [text, setText] = useState(initial)
  const link = parseShareUrl(text)
  const add = useAddShared()
  // A conversation's link (ADR-0060) pasted here opens in Mail → Team instead.
  const openTeam = useOpenTeamLink()
  const [busy, setBusy] = useState(false)
  const phone = useAppFrame().phone
  const wrong = !!text.trim() && !link
  const submit = () => {
    if (!link) return
    setBusy(true)
    void (link.kind === "thread" ? openTeam(link) : add(link)).then((ok) => (ok ? onDone() : setBusy(false)))
  }
  return (
    <FormLayerForm
      overline="Shared notes"
      title="Open a shared note"
      primary={{ label: link?.kind === "thread" ? "Open in Team" : "Add to my notes", icon: link?.kind === "thread" ? "launch" : "add", disabled: !link, loading: busy }}
      onSubmit={submit}
    >
      <TextField
        label="Link"
        data-form-focus
        autoComplete="off"
        placeholder="https://…/share#…"
        helper={link ? undefined : "Paste the link someone sent you."}
        error={wrong ? "That isn't a shared-note link." : undefined}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      {link && <LinkFacts link={link} size={phone ? "stacked" : "default"} />}
    </FormLayerForm>
  )
}

/** What a pasted link opens, before it is added: the note or conversation, who shared it, and what you can do. */
function LinkFacts({ link, size }: { link: ShareLink; size: "default" | "stacked" }) {
  const thread = link.kind === "thread"
  return (
    <div className="flex flex-col" data-role="shared-link-facts">
      <FieldRow size={size} label={thread ? "Conversation" : "Note"}>
        {link.title || (thread ? "A shared conversation" : "A shared note")}
      </FieldRow>
      {link.from && (
        <FieldRow size={size} label="From">
          {link.from}
        </FieldRow>
      )}
      <FieldRow size={size} label="You can" rule="both">
        {link.mode === "edit" ? "Edit" : "Read"}
      </FieldRow>
    </div>
  )
}
