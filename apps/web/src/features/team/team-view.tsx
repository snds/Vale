import { useMemo, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"

import { usePushedChrome } from "@/app/screen"
import { useUi } from "@/app/ui-store"
import {
  AdaptiveMenu,
  AdaptiveMenuItem,
  AppFrameInset,
  Badge,
  Banner,
  Button,
  EmptyState,
  FloatButton,
  InitialTile,
  ListRow,
  MetaItem,
  MetaList,
  Skeleton,
  TextField,
  Toolbar,
  ToolbarButton,
  toast,
  useAppFrame,
} from "@unicron/ui"
import { FormLayer, FormLayerForm } from "@/components/editor-frame"
import { LoadState } from "@/components/load-state"
import { getCoreClient } from "@/core/client"
import { useMailPrefs, useTeamThreads, useThread } from "@/core/queries"
import type { TeamThread } from "@/core/types"
import { useConfirm } from "@/lib/confirm"
import { longTime } from "@/lib/time"

import { initials, replyDraft, replyTarget } from "../mail/format"
import { LoadingRows } from "../mail/lane-list"
import { rowTime } from "../mail/row-time"
import { RowTimeTip } from "../mail/row-time-tip"
import { parseShareUrl } from "../notes/share-link"
import { useShareHere } from "./here"
import { HereTiles } from "./here-tiles"
import { openTeamLinkForm, useLinkForm } from "./link-form"
import { ShareThreadLayer } from "./share-thread-dialog"
import type { TeamMessage } from "./team-doc"
import { OwnerFiles, TeammateFiles } from "./team-files"
import { TeamTabs } from "./team-panel"
import { useTeamLive } from "./team-sync"
import { useOpenTeamLink } from "./use-open-team-link"
import { useHereIn, useTeamDoc } from "./use-team-doc"

const who = (t: TeamThread) => (t.role === "owner" ? "You shared" : `From ${t.from ?? "a teammate"}`)

/** The Team lane's head action (brief M9): a text button that opens the link form. */
export function TeamHeadAction() {
  return (
    <Button variant="ghost" onClick={openTeamLinkForm}>
      Open a link…
    </Button>
  )
}

/**
 * Mail → Team (ADR-0060, ADR-0097; brief M9): conversations you shared, and ones shared with you, as inline
 * List Rows: the title, "You shared" or "From {name}", STOPPED when the owner stopped, and when it last changed.
 */
export function TeamList() {
  const { data: list = [], isPending, error, refetch, isRefetching } = useTeamThreads()
  const open = useUi((s) => s.teamOpen)
  const setOpen = useUi((s) => s.setTeamOpen)
  const linkForm = useLinkForm((s) => s.open)
  return (
    <>
      {isPending ? (
        <LoadingRows count={3} label="Loading Team" />
      ) : (
        <LoadState place="Team" overline="Team" error={error} hasData={list.length > 0} onRetry={() => void refetch()} retrying={isRefetching}>
          {list.length === 0 ? (
            <EmptyState overline="Team // 00" title="Nothing shared." body="Share a conversation from its menu." actionLabel="Open a link…" onAction={openTeamLinkForm} />
          ) : (
            <ul aria-label="Team" className="flex flex-col">
              {list.map((t) => (
                <ListRow
                  key={t.id}
                  render={<li />}
                  layout="inline"
                  selected={open === t.id}
                  onClick={() => setOpen(t.id)}
                  title={t.title || "(no subject)"}
                  meta={who(t)}
                  metaStyle="plain"
                  badge={t.revoked ? <Badge>Stopped</Badge> : undefined}
                  // The newest message's time (Vale 43), as shared inboxes show it; when it changed before any message is saved.
                  status={<RowTimeTip at={t.latest ?? t.updated}>{rowTime(t.latest ?? t.updated)}</RowTimeTip>}
                />
              ))}
            </ul>
          )}
        </LoadState>
      )}
      <OpenTeamLinkLayer open={linkForm} onOpenChange={(o) => useLinkForm.setState({ open: o })} />
    </>
  )
}

/** Loading (brief 4.0): a title bar and three lines. */
function Loading() {
  return (
    <AppFrameInset>
      <div role="status" aria-busy="true" aria-label="Opening the shared conversation" className="flex flex-col gap-5 [&_[data-slot=skeleton]]:size-full">
        <div className="h-9 w-2/3">
          <Skeleton />
        </div>
        {["w-full", "w-11/12", "w-3/4"].map((w) => (
          <div key={w} className={`h-4 ${w}`}>
            <Skeleton />
          </div>
        ))}
      </div>
    </AppFrameInset>
  )
}

/**
 * A shared conversation, open (brief M9): the MetaList (SHARED BY · STATE · HERE), the title, a Toolbar
 * (Sharing… for the owner; Leave, or Remove once stopped), then line tabs MESSAGES · COMMENTS · REPLY · FILES.
 * MESSAGES is read-only and there is no Composer here. On a phone it is a pushed screen whose More holds
 * the toolbar's actions.
 */
export function TeamThreadView({ id }: { id: string }) {
  const { data: list, isPending } = useTeamThreads()
  const t = list?.find((x) => x.id === id)
  const { doc, data } = useTeamDoc(id)
  const live = useTeamLive((s) => !!s[id])
  useHereIn(id, live && !t?.revoked)
  const here = useShareHere(t?.revoked ? null : id)
  const { data: mailPrefs } = useMailPrefs()
  const openComposer = useUi((s) => s.openComposer)
  const setOpen = useUi((s) => s.setTeamOpen)
  const phone = useAppFrame().phone
  const confirm = useConfirm()
  const qc = useQueryClient()
  const [sharing, setSharing] = useState(false)
  const owner = t?.role === "owner"
  // The owner's conversation in their own mail: gone if it was deleted or moved away (brief M9, States).
  const own = useThread(owner && t?.threadId ? t.threadId : null)
  const removedFromMail = owner && !!t?.threadId && (own.isError || (own.isSuccess && own.data.length === 0))
  const subject = data?.subject || t?.title || "(no subject)"

  const remove = async () => {
    if (!t) return
    const c = await getCoreClient()
    if (!t.revoked) await c.stopTeamThread(t.id)
    await c.removeTeamThread(t.id)
    await qc.invalidateQueries({ queryKey: ["team"] })
    setOpen(null)
  }
  const act = (work: () => Promise<void>, done: string) =>
    void work().then(
      () => toast(done),
      (e: Error) => toast.error(e.message),
    )
  // Leaving cannot be undone without a new invitation, so it asks first, focus on Cancel (Vale 43).
  const leave = async () => {
    if (await confirm.ask({ title: `Leave ${subject}?`, description: "You'll need a new link to see it again.", confirmLabel: "Leave", run: remove })) toast(`Left ${subject}`)
  }
  const removeIt = async () => {
    // Removing a share that still works stops the link too: asked first, since it cannot be undone (brief X6).
    if (t && !t.revoked) {
      if (await confirm.ask({ title: `Remove ${subject}?`, description: "The link stops working, and the comments and the reply go with it.", confirmLabel: "Remove", run: remove })) toast(`Removed ${subject}`)
      return
    }
    act(remove, `Removed ${subject}`)
  }

  // A phone (brief M9): Back · More (Sharing…, Leave or Remove) in the top bar; no Composer in the bottom row.
  const canShare = !!t && owner && !t.revoked && !!t.threadId && !removedFromMail
  const leaves = !!t && !owner && !t.revoked
  const chrome = useMemo(
    () =>
      phone && t
        ? {
            actions: (
              <AdaptiveMenu title="More" trigger={<FloatButton label="More" icon="overflow-menu--horizontal" size="l" />}>
                {canShare && (
                  <AdaptiveMenuItem icon="user--follow" onSelect={() => setSharing(true)}>
                    Sharing…
                  </AdaptiveMenuItem>
                )}
                {leaves ? (
                  <AdaptiveMenuItem icon="logout" onSelect={() => void leave()}>
                    Leave
                  </AdaptiveMenuItem>
                ) : (
                  (t.revoked || removedFromMail) && (
                    <AdaptiveMenuItem icon="trash-can" variant="destructive" onSelect={() => void removeIt()}>
                      Remove
                    </AdaptiveMenuItem>
                  )
                )}
              </AdaptiveMenu>
            ),
          }
        : null,
    // The chrome is drawn again whenever what it offers changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [phone, t?.id, t?.revoked, canShare, leaves, removedFromMail, subject],
  )
  usePushedChrome(chrome)

  if (!t) {
    if (isPending) return <Loading />
    return (
      <AppFrameInset>
        <EmptyState size="sm" overline="Team" title="That shared conversation is gone." />
      </AppFrameInset>
    )
  }
  if (!doc || !data) return <Loading />

  // The owner's reply goes on their real conversation, quoted as their mail settings say.
  const answerWith = async (html: string) => {
    const thread = t.threadId ? await getCoreClient().then((c) => c.getThread(t.threadId!)).catch(() => []) : []
    const target = replyTarget(thread)
    if (!target) return void toast.error("That conversation isn't in your mail any more")
    openComposer(replyDraft(target, { quote: mailPrefs?.quote ?? true, replyBelow: mailPrefs?.replyBelow ?? false, openingHtml: html }))
  }
  const state = t.revoked ? <Badge>Stopped</Badge> : live ? <Badge tone="live">Live</Badge> : <Badge>Connecting</Badge>
  const readOnly = t.revoked || removedFromMail

  return (
    <div className={phone ? "flex flex-1 flex-col px-4 pb-8" : "flex flex-1 flex-col pb-8"}>
      <article aria-label={subject} className="flex flex-col gap-6">
        <div className="flex items-start justify-between gap-6">
          <MetaList>
            <MetaItem label="Shared by">{owner ? "You" : (t.from ?? "A teammate")}</MetaItem>
            <MetaItem label="State">{state}</MetaItem>
            {here.length > 0 && (
              <MetaItem label="Here">
                <HereTiles names={here} />
              </MetaItem>
            )}
          </MetaList>
          {/* Once the owner's mail no longer has it, the banner below holds REMOVE: one control for one job. */}
          {!phone && (canShare || leaves || t.revoked) && (
            <Toolbar aria-label="Shared conversation">
              {canShare && <ToolbarButton label="Sharing…" onClick={() => setSharing(true)} />}
              {leaves ? <ToolbarButton label="Leave" onClick={() => void leave()} /> : t.revoked && <ToolbarButton label="Remove" onClick={() => void removeIt()} />}
            </Toolbar>
          )}
        </div>

        <h2 className="type-title break-words text-foreground">{subject}</h2>

        {/* States (brief M9): stopped for a guest, everything read-only; the owner's mail no longer has it. */}
        {t.revoked && !owner && <Banner tone="info" size="compact" title="The owner stopped sharing." body="What you had stays here as your copy. Only you can see it." />}
        {removedFromMail && (
          <Banner
            tone="info"
            size="compact"
            title="That conversation isn't in your mail any more."
            action={
              <Button variant="secondary" size="sm" onClick={() => void removeIt()}>
                Remove
              </Button>
            }
          />
        )}

        <TeamTabs
          doc={doc}
          comments={data.comments}
          owner={owner}
          from={data.from || t.from}
          readOnly={readOnly}
          onUseReply={owner ? (html) => void answerWith(html) : undefined}
          messages={<SharedMessages messages={data.messages} live={live} />}
          files={t.revoked ? <p className="type-body text-muted-foreground">Files stopped with the share.</p> : owner && t.threadId ? <OwnerFiles shareId={t.id} threadId={t.threadId} readOnly={removedFromMail} /> : <TeammateFiles shareId={t.id} />}
        />
      </article>

      {canShare && t.threadId && <ShareThreadLayer threadId={t.threadId} subject={subject} open={sharing} onOpenChange={setSharing} />}
      {confirm.question()}
    </div>
  )
}

/** MESSAGES (brief M9): the shared copy, oldest first, each message open, read-only. Rules and space, no cards. */
function SharedMessages({ messages, live }: { messages: TeamMessage[]; live: boolean }) {
  if (messages.length === 0) return <p className="type-body text-muted-foreground">{live ? "No messages yet." : "The messages arrive once the owner's relay can be reached."}</p>
  return (
    <ol aria-label="Messages" className="flex flex-col rule-b">
      {messages.map((m) => (
        <li key={m.id} aria-label={`Message from ${m.from}`} className="flex flex-col gap-4 rule-t pt-4 pb-6" data-role="team-message">
          <div className="flex min-h-8 items-center gap-3">
            <InitialTile size="s" initials={initials({ name: m.from, email: m.email })} />
            <span className="min-w-0 flex-1 truncate type-ui-emphasis text-foreground">{m.from}</span>
            <span className="shrink-0 type-meta text-muted-foreground">{longTime(m.date)}</span>
          </div>
          <p className="max-w-(--c-app-frame-reading) type-body break-words whitespace-pre-wrap text-foreground">{m.text || "(no text)"}</p>
        </li>
      ))}
    </ol>
  )
}

/** OPEN A LINK… (brief M9): a form with LINK and the primary OPEN. */
export function OpenTeamLinkLayer({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <FormLayer open={open} onClose={() => onOpenChange(false)}>
      {open && <OpenTeamLinkForm onDone={() => onOpenChange(false)} />}
    </FormLayer>
  )
}

function OpenTeamLinkForm({ onDone }: { onDone: () => void }) {
  const [text, setText] = useState("")
  const [busy, setBusy] = useState(false)
  const link = parseShareUrl(text)
  const openLink = useOpenTeamLink()
  const wrong = !!text.trim() && (!link || link.kind !== "thread")
  const ok = link?.kind === "thread"
  return (
    <FormLayerForm
      overline="Team"
      title="Open a shared conversation"
      primary={{ label: "Open", icon: "link", disabled: !ok, loading: busy }}
      onSubmit={() => {
        if (!link || link.kind !== "thread") return
        setBusy(true)
        void openLink(link).then((done) => (done ? onDone() : setBusy(false)))
      }}
    >
      <TextField
        label="Link"
        data-form-focus
        autoComplete="off"
        placeholder="https://…/share#…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        error={wrong ? (link?.kind === "note" ? "That's a shared note. Open it in Notes, with Open a shared note…" : "That isn't a shared-conversation link. It looks like https://…/share#…") : undefined}
        helper={ok ? `${link.title || "A conversation"}${link.from ? ` // from ${link.from}` : ""}` : "Paste the link a teammate sent you."}
      />
    </FormLayerForm>
  )
}
