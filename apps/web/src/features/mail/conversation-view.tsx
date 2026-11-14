import { useEffect, useMemo, useState, type ReactElement, type ReactNode } from "react"

import { usePushedChrome } from "@/app/screen"
import { useUi } from "@/app/ui-store"
import {
  AdaptiveMenu,
  AdaptiveMenuGroup,
  AdaptiveMenuItem,
  AdaptiveMenuRadioGroup,
  AdaptiveMenuRadioItem,
  AdaptiveMenuSeparator,
  AppFrameInset,
  Badge,
  Button,
  Composer,
  DropdownMenuItem,
  EmptyState,
  FieldRow,
  FieldRowAction,
  FieldRowValue,
  FloatButton,
  Icon,
  IconButton,
  InitialTile,
  ListRow,
  MetaItem,
  MetaList,
  NeedsYou,
  SectionHeader,
  Skeleton,
  Toolbar,
  ToolbarButton,
  ToolbarToggle,
  formatListCount,
  toast,
  useAppFrame,
} from "@unicron/ui"
import { DateTimePicker } from "@/components/date-picker"
import { getCoreClient, isMember } from "@/core/client"
import { useAiReady, useContactPhotos, useMailAction, useMailPrefs, useSharedInbox, useSignatures, useThread, useThreadShare } from "@/core/queries"
import type { Account, Address, Category, Draft, Invite, MessageDetail, MessageSummary } from "@/core/types"
import { useConfirm } from "@/lib/confirm"
import { useLeaveGuard } from "@/lib/leave-guard"
import { longTime, snoozeOptions } from "@/lib/time"
import { useNowSecs } from "@/hooks/use-now"

import type { useTriage } from "./actions"
import { SuggestedRepliesRow, SummaryCard } from "./ai-assist"
import { AttachmentFile } from "./attachment-preview"
import { UNDO_SECONDS, displayName, forwardDraft, initials, replyDraft, replyTarget } from "./format"
import { HtmlBody } from "./html-body"
import { InviteCard } from "./invite-card"
import { ANSWERS, folio, inviteLine, inviteTime, useInviteAnswer, useRowSize, waitsForAnswer } from "./invite-words"
import { CATEGORIES } from "./lanes"
import { htmlToText, textToHtml } from "./rich-text"
import { rowTime } from "./row-time"
import { useSenderActions } from "./sender-actions"
import { openSenderPanel, setSenderPanel } from "./sender-panel"
import { signatureBlock } from "./signature"
import { SignatureSuggestion } from "./signature-suggestion"
import { UnsubscribeAction } from "./unsubscribe"
import { useAiAssist } from "./use-ai-assist"
import { LinkedNotes } from "../notes/linked-notes"
import { shareLinksIn, type ShareLink } from "../notes/share-link"
import { useAddShared } from "../notes/use-add-shared"
import { useOpenTeamLink } from "../team/use-open-team-link"
import { useQuickContext } from "../notes/use-quick-context"
import { ShareThreadDialog } from "../team/share-thread-dialog"
import { InboxTeamPanel } from "../team/inbox-team"
import { OwnerTeamPanel } from "../team/owner-team-panel"

/** Mailbox providers' domains: a split for one of them would catch everyone who uses it, so it is for the sender alone. */
const SHARED_DOMAINS = /^(gmail|googlemail|outlook|hotmail|live|icloud|me|yahoo|proton|protonmail|fastmail)\./

/** A first name, as "Reply to Mira" says it. */
const firstName = (a: Address) => displayName(a).split(/[\s@]/)[0] || displayName(a)

const isMine = (m: MessageDetail, account?: Account) => m.mailbox === "Sent" || (!!account && m.from.email === account.address)

/**
 * The conversation (ADR-0092; brief M4, M5's AI part; Mobile / 02, Desktop / 01's detail column).
 * The message is the focal point. Top to bottom: the meta line (MetaList, with the actions' Toolbar
 * beside it on a desktop), the title and its one mono line, the notice slot, the summary, the
 * messages oldest first with no cards, what comes after them (suggested replies, the team block,
 * notes), and the reply field pinned at the foot: the screen's only Composer. On a phone the top bar
 * holds Back, Archive and More, and the reply field is the bottom row.
 */
export function ConversationView({
  row,
  thread,
  account,
  showAccount,
  triage,
  screening = false,
  onLeave,
  onOpenThread,
}: {
  /** The list row for this conversation (thread-level state). */
  row: MessageSummary | undefined
  thread: MessageDetail[] | undefined
  account: Account | undefined
  showAccount: boolean
  triage: ReturnType<typeof useTriage>
  /** Opened from the Screener: the notice slot asks whether to let the sender in. */
  screening?: boolean
  /** Close the reader: its conversation is leaving the list (screened out, blocked). */
  onLeave?: () => void
  /** Open another conversation in this reader (from the sender panel). */
  onOpenThread?: (row: MessageSummary) => void
}) {
  // The thread's own read, for whether it failed: a conversation deleted elsewhere is gone.
  const read = useThread(row?.threadId ?? null)
  if (!thread || !row) {
    if (read.isError) return <Gone />
    return <Loading />
  }
  return <Conversation row={row} thread={thread} account={account} showAccount={showAccount} triage={triage} screening={screening} onLeave={onLeave} onOpenThread={onOpenThread} />
}

/** Loading (brief 4.0): a title bar and three lines. Generic loading, never the agent's motion. */
function Loading() {
  return (
    <AppFrameInset>
      <div role="status" aria-busy="true" aria-label="Opening the conversation" className="flex flex-col gap-5 [&_[data-slot=skeleton]]:size-full">
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

function Gone() {
  return (
    <AppFrameInset>
      <EmptyState size="sm" overline="Mail" title="That conversation is gone." />
    </AppFrameInset>
  )
}

function Conversation({
  row,
  thread,
  account,
  showAccount,
  triage,
  screening,
  onLeave,
  onOpenThread,
}: {
  row: MessageSummary
  thread: MessageDetail[]
  account: Account | undefined
  showAccount: boolean
  triage: ReturnType<typeof useTriage>
  screening: boolean
  onLeave?: () => void
  onOpenThread?: (row: MessageSummary) => void
}) {
  const phone = useAppFrame().phone
  const openComposer = useUi((s) => s.openComposer)
  const { data: mailPrefs } = useMailPrefs()
  const { data: signatures } = useSignatures()
  const now = useNowSecs()
  const senderActions = useSenderActions()
  const member = isMember()
  const confirm = useConfirm()
  const setFollowUp = useMailAction<{ threadId: string; at: number }>((c, a) => c.setFollowUp(a.threadId, a.at))
  const cancelFollowUp = useMailAction<string>((c, threadId) => c.cancelFollowUp(threadId))
  // Quick Note links to the conversation that's open (ADR-0037).
  useQuickContext({ kind: "thread", id: row.threadId, label: row.subject || "(no subject)" })
  // Shared with teammates (ADR-0060), and a shared inbox on the gateway (ADR-0063): the team block's slot.
  const { data: teamShare } = useThreadShare(row.threadId)
  const sharedInbox = useSharedInbox()
  // Opt-in AI (ADR-0059): asked for here, per conversation, and forgotten on leaving it.
  const aiReady = useAiReady()
  const { summary, replies } = useAiAssist(row.threadId)

  // Gmail and Apple Mail's convention: the newest message and anything unread start open.
  const [expanded, setExpanded] = useState<Set<string> | null>(null)
  const open = expanded ?? new Set(thread.filter((m, i) => i === thread.length - 1 || !m.seen).map((m) => m.id))
  const toggle = (id: string) => {
    const next = new Set(open)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setExpanded(next)
  }

  // Layers this screen opens.
  const [sharing, setSharing] = useState(false)
  const [unsubscribing, setUnsubscribing] = useState(false)
  const [snoozing, setSnoozing] = useState(false)
  const [reminding, setReminding] = useState(false)

  const target = replyTarget(thread)!
  const latest = thread.at(-1)!
  const subject = target.subject || latest.subject || "(no subject)"
  // The core clears snoozedUntil when a snooze wakes, so set means still snoozed.
  const snoozed = row.snoozedUntil !== null
  // Follow-up reminders hang off mail you sent.
  const sentAny = thread.some((m) => m.mailbox === "Sent")
  const reminder = thread.map((m) => m.followUpAt).find((t) => t != null) ?? null
  const due = reminder !== null && reminder <= now
  // The person on the other side (ADR-0036): the newest message you didn't send.
  const other = thread.findLast((m) => !isMine(m, account))?.from
  // The sender panel beside the columns (brief M5, DC5) follows the open conversation; FROM and More › About show it.
  useEffect(() => {
    setSenderPanel(other ?? null, row.threadId, onOpenThread)
    // `other` is a new object each read; its address says who it is.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [other?.email, other?.name, row.threadId, onOpenThread])
  useEffect(() => () => setSenderPanel(null, null), [])
  const files = thread.flatMap((m) => m.attachments.filter((a) => !a.inline))
  // A reply goes to whoever Reply answers; in a conversation of your own mail only, to whom you wrote.
  const replyTo = target.mailbox === "Sent" ? target.to : [target.from]
  const replyStyle = { quote: mailPrefs?.quote ?? true, replyBelow: mailPrefs?.replyBelow ?? false }
  const fullReply = (opening?: string) => openComposer({ ...replyDraft(target, { ...replyStyle, opening }), to: replyTo })

  // The reply field (brief M4): plain text, sent in place as Reply would send it, quoted and signed by the
  // same rules, through the outbox, so the undo window and the sending strip work as for any send.
  const [reply, setReply] = useState("")
  const [replyError, setReplyError] = useState<string | null>(null)
  const [sendingReply, setSendingReply] = useState(false)
  useLeaveGuard(() => reply.trim() !== "", () => setReply(""))
  const sendReply = async (text: string) => {
    const said = text.trim()
    if (!said) return
    setReplyError(null)
    setSendingReply(true)
    const d = replyDraft(target, { ...replyStyle, opening: said })
    const saidHtml = textToHtml(said)
    const block = signatureBlock(signatures?.find((s) => s.accountId === target.accountId)?.html)
    const html = block ? d.bodyHtml!.replace(saidHtml, `${saidHtml}${block}`) : d.bodyHtml!
    const draft: Draft = {
      accountId: target.accountId,
      to: replyTo,
      cc: [],
      subject: d.subject ?? subject,
      body: htmlToText(html),
      bodyHtml: html,
      inReplyTo: d.inReplyTo ?? null,
      references: d.references ?? [],
      attachments: [],
      followUpAfter: null,
      requestReceipt: mailPrefs?.requestReceipts ?? false,
    }
    try {
      await (await getCoreClient()).queueSend(draft, UNDO_SECONDS, null)
      setReply("")
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      // A failed action says so beside its control (cross-app decisions §9); a phone's reply field is the bottom row, so a toast.
      if (phone) toast.error(message)
      else setReplyError(message)
    } finally {
      setSendingReply(false)
    }
  }
  const expand = () => {
    fullReply(reply.trim() || undefined)
    setReply("")
  }

  const remind = (at: number, label: string) =>
    setFollowUp.mutate({ threadId: row.threadId, at }, { onSuccess: () => toast(`If nobody replies, ${subject} comes back ${label}`), onError: (e) => toast.error(e.message) })
  const snooze = (until: number, label: string) => triage.snooze(row, until, label)

  // Decisions about the sender close the reader when the conversation leaves the list (screened out, blocked).
  const decide = (from: Address, decision: "allowed" | "screened_out" | "blocked") => senderActions.decide(from, decision, decision === "allowed" ? undefined : onLeave)
  const block = async (from: Address) => {
    const name = displayName(from)
    if (await confirm.ask({ title: `Block ${name}?`, description: "Their mail goes straight to the archive.", confirmLabel: "Block" })) decide(from, "blocked")
  }
  const newSplit = (from: Address) => {
    const domain = from.email.split("@")[1]?.toLowerCase() ?? ""
    const shared = !domain || SHARED_DOMAINS.test(domain)
    const name = shared ? displayName(from) : (domain.split(".").at(-2)?.replace(/^./, (c) => c.toUpperCase()) ?? domain)
    useUi.getState().openSplitEditor({ initial: { name, senders: [shared ? from.email.toLowerCase() : `@${domain}`], exclusive: true } })
  }
  const senderDomain = (from: Address) => {
    const domain = from.email.split("@")[1]?.toLowerCase() ?? ""
    return domain && !SHARED_DOMAINS.test(domain) ? domain : "this sender"
  }
  const fromOther = target.mailbox !== "Sent" ? target.from : null
  const unsubscribable = fromOther && target.unsubscribe ? target : null

  /** More (brief M4): the conversation's other actions, then what to do about the sender, under their name. */
  const moreItems = (
    <>
      <AdaptiveMenuItem icon="reply" onSelect={() => fullReply()}>
        Reply in full
      </AdaptiveMenuItem>
      <AdaptiveMenuItem icon="vale--forward" onSelect={() => openComposer(forwardDraft(target))}>
        Forward
      </AdaptiveMenuItem>
      {reminder !== null ? (
        <AdaptiveMenuItem icon="notification--off" onSelect={() => cancelFollowUp.mutate(row.threadId, { onSuccess: () => toast(`Cancelled the reminder for ${subject}`) })}>
          Cancel reminder
        </AdaptiveMenuItem>
      ) : (
        sentAny && (
          <AdaptiveMenuItem icon="notification" onSelect={() => setReminding(true)}>
            Remind me if no reply…
          </AdaptiveMenuItem>
        )
      )}
      {aiReady && (
        <AdaptiveMenuItem icon="text--short-paragraph" onSelect={() => summary.mutate()}>
          Summarize
        </AdaptiveMenuItem>
      )}
      {!member && (
        <AdaptiveMenuItem icon={teamShare ? "user--multiple" : "user--follow"} onSelect={() => setSharing(true)}>
          {teamShare ? "Shared with teammates…" : "Share with teammates…"}
        </AdaptiveMenuItem>
      )}
      {other && (
        <AdaptiveMenuItem icon="user--avatar" onSelect={openSenderPanel}>
          About {displayName(other)}
        </AdaptiveMenuItem>
      )}
      {unsubscribable && (
        <AdaptiveMenuItem icon="email" onSelect={() => setUnsubscribing(true)}>
          Unsubscribe…
        </AdaptiveMenuItem>
      )}
      {!member && (
        <AdaptiveMenuItem icon="edit" onSelect={() => useUi.getState().openQuickNote({ kind: "thread", id: row.threadId, label: subject })}>
          Quick note about this
        </AdaptiveMenuItem>
      )}
      {fromOther && (
        <>
          <AdaptiveMenuSeparator />
          <AdaptiveMenuGroup label={displayName(fromOther)}>
            <AdaptiveMenuRadioGroup value={row.category ?? "people"} onValueChange={(v) => senderActions.move(fromOther, v as Category)}>
              {CATEGORIES.map((c) => (
                <AdaptiveMenuRadioItem key={c.id} value={c.id}>
                  Always in {c.label}
                </AdaptiveMenuRadioItem>
              ))}
            </AdaptiveMenuRadioGroup>
            <AdaptiveMenuItem icon="new-tab" onSelect={() => newSplit(fromOther)}>
              New split for {senderDomain(fromOther)}
            </AdaptiveMenuItem>
            <AdaptiveMenuItem icon="user--minus" onSelect={() => decide(fromOther, "screened_out")}>
              Screen out sender
            </AdaptiveMenuItem>
            <AdaptiveMenuItem icon="error" variant="destructive" onSelect={() => void block(fromOther)}>
              Block sender
            </AdaptiveMenuItem>
          </AdaptiveMenuGroup>
        </>
      )}
    </>
  )

  const replyField = (
    <Composer
      label={`Reply to ${displayName(replyTo[0] ?? target.from)}`}
      placeholder={`Reply to ${firstName(replyTo[0] ?? target.from)}`}
      value={reply}
      onValueChange={(v) => {
        setReply(v)
        setReplyError(null)
      }}
      onSend={(t) => void sendReply(t)}
      sending={sendingReply}
      // A letter is not a chat line: Return makes a new line, ⌘ or Ctrl + Return sends (brief 4.0), the button always.
      sendKey="mod-enter"
      leadingAction={<IconButton icon="maximize" label="Expand" tooltip="Write it in full" onClick={expand} />}
    />
  )

  // A phone (Mobile / 02): Back · Archive · More in the top bar; the reply field is the bottom row.
  const archiveLabel = row.archived ? "Move to Inbox" : "Archive"
  const chrome = useMemo(
    () =>
      phone
        ? {
            actions: (
              <>
                <FloatButton label={archiveLabel} icon={row.archived ? "reset" : "archive"} size="l" onClick={() => triage.toggleArchive(row)} />
                <AdaptiveMenu title="More" trigger={<FloatButton label="More" icon="overflow-menu--horizontal" size="l" />}>
                  <AdaptiveMenuItem icon={row.flagged ? "star--filled" : "star"} onSelect={() => triage.toggleFlag(row)}>
                    {row.flagged ? "Unstar" : "Star"}
                  </AdaptiveMenuItem>
                  {snoozed ? (
                    <AdaptiveMenuItem icon="time" onSelect={() => triage.unsnooze(row)}>
                      Unsnooze
                    </AdaptiveMenuItem>
                  ) : (
                    <AdaptiveMenuItem icon="time" onSelect={() => setSnoozing(true)}>
                      Snooze…
                    </AdaptiveMenuItem>
                  )}
                  <AdaptiveMenuItem icon="email--new" onSelect={() => triage.markSeen(row, false)}>
                    Mark unread
                  </AdaptiveMenuItem>
                  <AdaptiveMenuSeparator />
                  {moreItems}
                </AdaptiveMenu>
              </>
            ),
            fill: replyField,
          }
        : null,
    // The chrome is drawn again whenever what it shows changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [phone, row, archiveLabel, snoozed, reply, sendingReply, aiReady, member, teamShare, reminder, sentAny, other, unsubscribable, fromOther, signatures, mailPrefs, subject],
  )
  usePushedChrome(chrome)

  // A new conversation in the same reader starts with nothing asked of the model.
  useEffect(() => {
    summary.reset()
    replies.reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.threadId])

  const oneMessage = thread.length === 1
  // The newest invitation still waiting for your answer earns a block (brief M5).
  const invitation = thread.findLast((m) => waitsForAnswer(m.invite)) ?? null
  const fact = [showAccount && account ? account.displayName : null, reminder !== null && !due ? `Reminder ${rowTime(reminder, new Date(now * 1000))} if no reply` : null].filter(Boolean)

  return (
    // The column's height, so the reply field can stand at its foot (the phone keeps the frame's 16 at each side).
    <div className={phone ? "flex flex-1 flex-col px-4" : "flex flex-1 flex-col"}>
      <article aria-label={subject} className="flex flex-1 flex-col gap-6">
        {/* The meta line: the facts, and the actions beside them on a desktop (brief 6.3: an addition to the frame). */}
        <div className="relative flex items-start justify-between gap-6">
          <MetaList>
            {other ? (
              <MetaItem label="From">
                <button type="button" aria-label={`About ${displayName(other)}`} className="text-left underline-offset-4 outline-none hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" onClick={openSenderPanel}>
                  {displayName(other)}
                </button>
              </MetaItem>
            ) : (
              <MetaItem label="To">{target.to.map(displayName).join(", ") || "—"}</MetaItem>
            )}
            {oneMessage ? (
              <MetaItem label="Received">{rowTime(latest.date, new Date(now * 1000))}</MetaItem>
            ) : (
              <>
                <MetaItem label="Messages">{formatListCount(thread.length)}</MetaItem>
                <MetaItem label="Latest">{rowTime(latest.date, new Date(now * 1000))}</MetaItem>
              </>
            )}
            {files.length > 0 && <MetaItem label="Attached">{formatListCount(files.length)}</MetaItem>}
          </MetaList>
          {!phone && (
            <Toolbar aria-label="Conversation">
              <ToolbarButton icon={row.archived ? "reset" : "archive"} label={archiveLabel} shortcut="E" onClick={() => triage.toggleArchive(row)} />
              {snoozed ? (
                <ToolbarToggle icon="time" label="Unsnooze" pressed onPressedChange={() => triage.unsnooze(row)} />
              ) : (
                <LaterMenu title="Snooze until" open={snoozing} onOpenChange={setSnoozing} trigger={<ToolbarButton icon="time" label="Snooze" />} picker="Snooze" onPick={snooze} />
              )}
              <ToolbarButton icon={row.flagged ? "star--filled" : "star"} label={row.flagged ? "Unstar" : "Star"} shortcut="S" onClick={() => triage.toggleFlag(row)} />
              <ToolbarButton icon="email--new" label="Mark unread" shortcut="U" onClick={() => triage.markSeen(row, false)} />
              <AdaptiveMenu title="More" align="end" trigger={<ToolbarButton icon="overflow-menu--horizontal" label="More" />}>
                {moreItems}
              </AdaptiveMenu>
            </Toolbar>
          )}
          {/* Menus opened from another menu stand here: snoozing from a phone's More, a reminder from More or the block. */}
          {phone && !snoozed && <LaterMenu title="Snooze until" open={snoozing} onOpenChange={setSnoozing} picker="Snooze" onPick={snooze} />}
          <LaterMenu
            title="Remind me if no reply"
            open={reminding}
            onOpenChange={setReminding}
            picker="Remind me if no reply"
            action="Set reminder"
            note="If nobody has replied by then, the conversation comes back to the top of your inbox."
            onPick={remind}
          />
        </div>

        <div className="flex flex-col gap-1">
          <h2 className="type-title break-words text-foreground">{subject}</h2>
          {fact.length > 0 && <p className="type-overline text-muted-foreground">{fact.join(" // ")}</p>}
        </div>

        {/* The notice slot (brief M4, M5): one place under the title. The first thing that applies stands there (the
            Screener's question, then a reminder that came due, then an invitation to answer); a second waiting thing is
            a row under WAITING ON YOU, and the block's title ends // +1. */}
        <NoticeSlot
          screener={screening && fromOther ? <ScreenerNotice name={displayName(fromOther)} onLetIn={() => decide(fromOther, "allowed")} onScreenOut={() => decide(fromOther, "screened_out")} /> : null}
          followUp={due ? { when: longTime(reminder!), done: () => triage.toggleArchive(row), again: () => setReminding(true) } : null}
          invitation={invitation}
        />

        <SummaryCard summary={summary} onClose={summary.reset} />

        {/* No cards: rows and rules. A thread's open messages each start at a rule, as its rows do. */}
        <div className={oneMessage ? "flex flex-col" : "flex flex-col rule-b"}>
          {thread.map((m) =>
            oneMessage ? (
              <MessageBody key={m.id} message={m} mine={isMine(m, account)} />
            ) : (
              <ThreadMessage
                key={m.id}
                message={m}
                mine={isMine(m, account)}
                open={open.has(m.id)}
                onToggle={() => toggle(m.id)}
                now={now}
                // The question is the newest offer's: the message Reply answers.
                onUnsubscribe={m.id === unsubscribable?.id ? () => setUnsubscribing(true) : undefined}
              />
            ),
          )}
        </div>

        {aiReady && replies.isIdle && (
          <div>
            <Button variant="ghost" onClick={() => replies.mutate()}>
              Suggest replies
            </Button>
          </div>
        )}
        <SuggestedRepliesRow replies={replies} onPick={(text) => setReply(text)} />

        {/* The team block's slot (brief M9). */}
        {sharedInbox && <InboxTeamPanel threadId={row.threadId} />}
        {teamShare && <OwnerTeamPanel share={teamShare} onUseReply={(html) => openComposer({ ...replyDraft(target, { ...replyStyle, openingHtml: html }), to: replyTo })} />}

        {/* Notes are the gateway owner's; a team member sees nothing about them (brief 4.0). */}
        {!member && <LinkedNotes target={{ kind: "thread", id: row.threadId }} title={subject} />}

        {/* Pinned at the foot of the column (Desktop / 01): the reply field. A phone has it as its bottom row. */}
        {!phone && (
          <div className="sticky bottom-0 mt-auto flex flex-col gap-2 bg-background pt-2">
            {replyError && (
              <p role="alert" className="type-caption text-destructive">
                {replyError}
              </p>
            )}
            {replyField}
          </div>
        )}
      </article>

      <ShareThreadDialog threadId={row.threadId} subject={subject} open={sharing} onOpenChange={setSharing} />
      {unsubscribable && <UnsubscribeAction message={unsubscribable} button={false} open={unsubscribing} onOpenChange={setUnsubscribing} onArchive={() => !row.archived && triage.toggleArchive(row)} />}
      {confirm.question()}
    </div>
  )
}

/** A reminder that came due: when it was set for, and its two ways out. */
interface FollowUpNotice {
  when: string
  /** DONE: archives the conversation, with UNDO. */
  done: () => void
  /** REMIND AGAIN: the reminder's times. */
  again: () => void
}

/**
 * The notice slot (brief M4, M5; cross-app decisions §2): at most one block. The Screener's question (a calm
 * notice) comes first, then a reminder that came due, then an invitation to answer, each a needs-you block
 * with one solid action. What else waits is a row under WAITING ON YOU, and the block's title ends // +1.
 */
function NoticeSlot({ screener, followUp, invitation }: { screener: ReactNode; followUp: FollowUpNotice | null; invitation: MessageDetail | null }) {
  const waiting = [followUp && ("follow-up" as const), invitation?.invite && ("invite" as const)].filter((w) => !!w)
  const [lead, ...rows] = screener ? [null, ...waiting] : waiting
  if (!screener && !lead) return null
  return (
    <div className="flex flex-col gap-6">
      {screener ??
        (lead === "follow-up" ? (
          <FollowUpBlock notice={followUp!} more={rows.length} />
        ) : (
          <InvitationBlock message={invitation!} invite={invitation!.invite!} more={rows.length} />
        ))}
      {rows.length > 0 && (
        <section aria-label="Waiting on you" className="flex flex-col">
          <SectionHeader title="Waiting on you" count={rows.length} level={3} />
          <ul aria-label="Waiting on you">
            {rows.map((w) => (w === "follow-up" ? <FollowUpRow key={w} notice={followUp!} /> : <InvitationRow key={w} message={invitation!} invite={invitation!.invite!} />))}
          </ul>
        </section>
      )}
    </div>
  )
}

/** NO REPLY YET: a reminder you set has passed with no reply. DONE archives (with UNDO); REMIND AGAIN sets another. */
function FollowUpBlock({ notice, more }: { notice: FollowUpNotice; more: number }) {
  return (
    <NeedsYou
      title="No reply yet"
      more={more || undefined}
      body={`You asked to be reminded ${notice.when}.`}
      announce={false}
      action={
        <Button variant="needs-you" onClick={notice.done}>
          Done
        </Button>
      }
      secondaryAction={
        <Button variant="needs-you-text" onClick={notice.again}>
          Remind again
        </Button>
      }
    />
  )
}

/** An invitation not answered yet: INVITATION // WED 11.18, what and when, a solid ACCEPT and text MAYBE and DECLINE (Q9: two text actions). */
function InvitationBlock({ message, invite, more }: { message: MessageDetail; invite: Invite; more: number }) {
  const { answer, pending, error } = useInviteAnswer(invite, message.id, message.accountId)
  return (
    <div className="flex flex-col gap-2">
      <NeedsYou
        title={invite.start != null ? `Invitation // ${folio(invite.start)}` : "Invitation"}
        more={more || undefined}
        body={inviteLine(invite)}
        announce={false}
        action={
          <Button variant="needs-you" loading={pending} onClick={() => void answer("accepted")}>
            Accept
          </Button>
        }
        secondaryActions={[
          <Button key="maybe" variant="needs-you-text" disabled={pending} onClick={() => void answer("tentative")}>
            Maybe
          </Button>,
          <Button key="decline" variant="needs-you-text" disabled={pending} onClick={() => void answer("declined")}>
            Decline
          </Button>,
        ]}
      />
      {error && (
        <p role="alert" className="type-caption text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

/** The reminder as a second waiting thing: "No reply yet", DONE, and REMIND AGAIN in its menu. */
function FollowUpRow({ notice }: { notice: FollowUpNotice }) {
  return (
    <ListRow
      render={<li />}
      size="compact"
      title="No reply yet"
      meta={`Reminder ${notice.when}`}
      metaStyle="plain"
      action={
        <Button variant="secondary" size="sm" onClick={notice.done}>
          Done
        </Button>
      }
      menu={<DropdownMenuItem onClick={notice.again}>Remind again</DropdownMenuItem>}
    />
  )
}

/** The invitation as a second waiting thing: its title and time, and RESPOND, a menu of the three answers. */
function InvitationRow({ message, invite }: { message: MessageDetail; invite: Invite }) {
  const { answer, pending, error } = useInviteAnswer(invite, message.id, message.accountId)
  return (
    <ListRow
      render={<li />}
      size="compact"
      title={invite.title || "(no title)"}
      meta={[invite.start != null && invite.end != null ? inviteTime(invite.start, invite.end, invite.allDay) : null, invite.location].filter(Boolean).join(" // ")}
      metaStyle="plain"
      disabledReason={error ?? undefined}
      action={
        <AdaptiveMenu
          title={`Respond to ${invite.title || "the invitation"}`}
          align="end"
          trigger={
            <Button variant="secondary" size="sm" loading={pending}>
              Respond
            </Button>
          }
        >
          {ANSWERS.map((a) => (
            <AdaptiveMenuItem key={a.value} onSelect={() => void answer(a.value)}>
              {a.verb}
            </AdaptiveMenuItem>
          ))}
        </AdaptiveMenu>
      }
    />
  )
}

/**
 * A Vale share link in the body (brief M5): a Field Row SHARED WITH YOU with its title, and OPEN IN NOTES
 * (a note, ADR-0056) or OPEN IN TEAM (a conversation shared with teammates, ADR-0060). Notes are the gateway
 * owner's, so a team member sees only conversation links (brief 4.0).
 */
function SharedLinks({ text }: { text: string }) {
  const size = useRowSize()
  const member = isMember()
  const add = useAddShared()
  const openTeam = useOpenTeamLink()
  const [busy, setBusy] = useState<string | null>(null)
  const links = shareLinksIn(text).filter((l) => l.kind === "thread" || !member)
  if (!links.length) return null
  const open = (l: ShareLink) => {
    setBusy(l.id)
    void (l.kind === "note" ? add(l) : openTeam(l)).finally(() => setBusy(null))
  }
  return (
    <div className="flex flex-col" role="group" aria-label="Shared with you">
      {links.map((l, i) => (
        <FieldRow
          key={l.id}
          size={size}
          label="Shared with you"
          rule={i === 0 ? "none" : "top"}
          description={l.from ? `From ${l.from}` : undefined}
          action={
            <FieldRowAction loading={busy === l.id} onClick={() => open(l)}>
              {l.kind === "note" ? "Open in Notes" : "Open in Team"}
            </FieldRowAction>
          }
        >
          <FieldRowValue truncate="end">{l.title || (l.kind === "note" ? "A shared note" : "A shared conversation")}</FieldRowValue>
        </FieldRow>
      ))}
    </div>
  )
}

/** The Screener's question in the notice slot (brief M3): a calm notice, not a needs-you. */
function ScreenerNotice({ name, onLetIn, onScreenOut }: { name: string; onLetIn: () => void; onScreenOut: () => void }) {
  return (
    <section aria-label="New sender" className="flex flex-col gap-4">
      <SectionHeader title="New sender" level={3} />
      <p className="type-body text-foreground">Let {name}’s mail into your inbox?</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={onLetIn}>
          Let in
        </Button>
        <Button variant="secondary" onClick={onScreenOut}>
          Screen out
        </Button>
      </div>
    </section>
  )
}

/** One message's body and what it carries: an invitation, a shared note, the text or HTML, a signature to keep, its files. */
function MessageBody({ message, mine }: { message: MessageDetail; mine: boolean }) {
  const files = message.attachments.filter((a) => !a.inline)
  return (
    <div className="flex flex-col gap-6">
      {message.invite && <InviteCard invite={message.invite} messageId={message.id} accountId={message.accountId} />}
      <SharedLinks text={`${message.bodyText ?? ""}\n${message.bodyHtml ?? ""}`} />
      <div className="max-w-(--c-app-frame-reading)">
        {message.bodyHtml ? <HtmlBody html={message.bodyHtml} from={message.from.email} /> : <div className="type-body break-words whitespace-pre-line text-foreground">{message.bodyText}</div>}
      </div>
      {!mine && <SignatureSuggestion messageId={message.id} />}
      {files.length > 0 && (
        <div role="group" aria-label="Attachments" className="flex flex-wrap gap-2">
          {files.map((f) => (
            <AttachmentFile key={f.id} file={f} />
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * A message in a thread (brief M4). Collapsed, a compact row that opens it (sender, a line of the
 * text, an attachment mark, the time). Open, a head line (the face, the sender, "to …", the date
 * and time, SENT on your own, UNSUBSCRIBE when offered) and the body. Each is a region named for
 * its sender; Enter or Space on the row or the head opens and closes it.
 */
function ThreadMessage({ message, mine, open, onToggle, now, onUnsubscribe }: { message: MessageDetail; mine: boolean; open: boolean; onToggle: () => void; now: number; onUnsubscribe?: () => void }) {
  const { data: photos } = useContactPhotos()
  const name = mine ? "Me" : displayName(message.from)
  const hasFiles = message.attachments.some((a) => !a.inline)
  if (!open)
    return (
      <ListRow
        render={<section aria-label={`Message from ${name}`} />}
        layout="message"
        size="compact"
        mainRender={<span aria-expanded="false" />}
        onClick={onToggle}
        unread={!message.seen}
        sender={name}
        marks={hasFiles ? <Icon name="attachment" size="sm" label="Has attachments" /> : undefined}
        preview={message.preview}
        time={rowTime(message.date, new Date(now * 1000))}
      />
    )
  const photo = mine ? undefined : photos?.[message.from.email.trim().toLowerCase()]
  return (
    <section aria-label={`Message from ${name}`} className="flex flex-col gap-4 rule-t pt-4 pb-6">
      <div className="flex min-h-8 items-center gap-3">
        <button type="button" aria-expanded="true" onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-3 text-left outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          <InitialTile size="s" initials={mine ? "Me" : initials(message.from)} src={photo} />
          <span className="flex min-w-0 items-baseline gap-2">
            <span className="shrink-0 type-ui-emphasis text-foreground">{name}</span>
            <span className="truncate type-caption text-muted-foreground">to {message.to.map(displayName).join(", ") || "you"}</span>
          </span>
        </button>
        {mine && <Badge>Sent</Badge>}
        <span className="shrink-0 type-meta text-muted-foreground">{longTime(message.date)}</span>
        {onUnsubscribe && (
          <Button variant="ghost" size="sm" onClick={onUnsubscribe}>
            Unsubscribe
          </Button>
        )}
      </div>
      <MessageBody message={message} mine={mine} />
    </section>
  )
}

/**
 * A time to bring the conversation back (snooze) or to be reminded if nobody replies: the presets
 * with their exact times, then any date and time in the shared picker (ADR-0088). A menu on a
 * desktop, a sheet on a phone. Opened by its trigger, or by another menu (`open`), when it stands
 * by an anchor of its own.
 */
function LaterMenu({
  title,
  open,
  onOpenChange,
  trigger,
  picker,
  action,
  note,
  onPick,
}: {
  title: string
  open: boolean
  onOpenChange: (open: boolean) => void
  trigger?: ReactElement<Record<string, unknown>>
  picker: string
  action?: string
  note?: string
  onPick: (at: number, label: string) => void
}) {
  const [picking, setPicking] = useState(false)
  const anchor = <span aria-hidden="true" tabIndex={-1} className="pointer-events-none absolute top-full right-0 size-0" />
  return (
    <>
      <AdaptiveMenu title={title} align="end" open={open} onOpenChange={onOpenChange} trigger={trigger ?? anchor}>
        {snoozeOptions().map((o) => (
          <AdaptiveMenuItem key={o.label} icon="time" onSelect={() => onPick(o.until, o.label.toLowerCase())}>
            <span className="flex-1">{o.label}</span>
            <span className="ps-4 type-meta text-muted-foreground">{o.detail}</span>
          </AdaptiveMenuItem>
        ))}
        <AdaptiveMenuSeparator />
        <AdaptiveMenuItem icon="calendar" onSelect={() => setPicking(true)}>
          Pick date and time…
        </AdaptiveMenuItem>
      </AdaptiveMenu>
      {picking && (
        <DateTimePicker
          open
          onOpenChange={(o) => !o && setPicking(false)}
          trigger={anchor}
          title={picker}
          action={action ?? picker}
          note={note}
          onPick={(at) => onPick(at, longTime(at))}
        />
      )}
    </>
  )
}
