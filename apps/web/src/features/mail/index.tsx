import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"

import { factTime, usePlaceStrip, useRefresh, useScreenFact, useScreenPlace } from "@/app/screen"
import { checkMail, useStatus } from "@/app/live-status"
import { useSectionSwitcher } from "@/app/places"
import { useSectionBanner, type SectionBanner } from "@/app/section-banner"
import { SectionSwitcher } from "@/app/section-switcher"
import { pendingJump, useUi } from "@/app/ui-store"
import { vertical } from "@/app/verticals"
import { Icon, Button, EmptyState, formatListCount, type PageHeadSwipe } from "@unicron/ui"
import { LoadState } from "@/components/load-state"
import { leaveThen } from "@/lib/leave-guard"
import { MasterDetail } from "@/components/master-detail"
import { ScreenHead } from "@/components/page"
import { VirtualList } from "@/components/virtual-list"
import { getCoreClient } from "@/core/client"
import { useCore, useInboxOverview, useMailPrefs, useMe, useMessagePages, useSplits, useSwipeActions, useThread } from "@/core/queries"
import type { Category, Lane, MessageSummary } from "@/core/types"

import { useTriage } from "./actions"
import { useNowSecs } from "@/hooks/use-now"
import { startFirstRun } from "@/features/onboarding/start-add-account"

import { ConversationView } from "./conversation-view"
import { CATEGORIES, LANES } from "./lanes"
import { MailNav } from "./mail-nav"
import { useSenderActions } from "./sender-actions"
import { editFailed, markFailedSeen, useFailedSends, useOutboxItems } from "./outbox"
import { OutboxList, OutboxMessage } from "./scheduled-list"
import { SenderPanelSlot } from "./sender-profile"
import { TeamList, TeamThreadView } from "../team/team-view"
import { InboxChips, NewsletterBundle, ScreenerPointer } from "./splits"
import { LaneConversation, LoadingRows, SnoozedBeside } from "./lane-list"
import { rowTime } from "./row-time"
import { useSnoozed } from "./use-snoozed"
import { useMailVerbs } from "./vocabulary"
import { useMailPlace } from "./use-mail-place"
import { useMailShortcuts } from "./use-shortcuts"

export function MailView() {
  // Mail's place (ADR-0084): the lane and the account, in the UI store, so the sidebar, the page head's
  // sheet and the command menu all switch them. A lane or an account that is gone falls back to the first.
  const { tab, account, accounts, waiting } = useMailPlace()
  const accountId = account?.id ?? null
  const lane: Lane = tab === "scheduled" || tab === "team" || tab === "mine" ? "inbox" : tab
  // A shared inbox (ADR-0063): "Assigned to me" lists what is yours.
  const me = useMe()
  // Mail → Team (ADR-0060): shared conversations open in their own view.
  const teamOpen = useUi((s) => s.teamOpen)
  const setTeamOpen = useUi((s) => s.setTeamOpen)
  // People / Updates / Newsletters chips filter the inbox.
  const category = useUi((s) => s.mailCategory)
  const setCategory = useUi((s) => s.setMailCategory)
  const split = useUi((s) => s.mailSplit)
  const senderActions = useSenderActions()
  const { data: splits = [] } = useSplits()
  const now = useNowSecs()
  // Selection is a conversation. The row is remembered so the reader stays
  // open when the row leaves the current lane (e.g. read mail in "Unread").
  const [selected, setSelected] = useState<MessageSummary | null>(() => pendingJump("thread")?.row ?? null)
  useEffect(() => void useUi.getState().takeJump("thread"), [])
  // Another lane or account, picked in the nav: what was open belongs to the place left behind.
  const placeKey = `${tab}/${accountId ?? ""}`
  const [placeSeen, setPlaceSeen] = useState(placeKey)
  if (placeSeen !== placeKey) {
    setPlaceSeen(placeKey)
    setSelected(null)
  }
  const selectedId = selected?.threadId ?? null
  // The Outbox's open message (ADR-0095): an outbox item, not a conversation.
  const [outboxOpen, setOutboxOpen] = useState<string | null>(null)
  if (placeSeen !== placeKey && outboxOpen) setOutboxOpen(null)
  const outbox = useOutboxItems(accountId)
  const { failed, unseen } = useFailedSends()
  // Opening the Outbox counts as seeing what failed: the banner, its toast and the critical tone go (brief M7).
  const failedIds = failed.map((i) => i.id).join(" ")
  useEffect(() => {
    if (tab === "scheduled" && failedIds) markFailedSeen(failedIds.split(" "))
  }, [tab, failedIds])

  const { data: core } = useCore()
  // All of the inbox (no chip) folds newsletters into the bundle row. Searching a lane is Search's (ADR-0085).
  const bundling = tab === "inbox" && !category && !split
  const { data: pages, isPending, error: readError, refetch, isRefetching, hasNextPage, isFetchingNextPage, fetchNextPage } = useMessagePages({
    lane,
    accountId,
    search: null,
    category: tab === "inbox" ? category : null,
    split: tab === "inbox" ? split : null,
    bundle: bundling,
    assignedTo: tab === "mine" ? me.id : null,
  })
  const { data: thread } = useThread(selectedId)
  const { data: overview } = useInboxOverview(accountId)
  const openComposer = useUi((s) => s.openComposer)
  // A check the person asks for is live status while it runs (ADR-0086).
  const checking = useStatus((s) => s.checking > 0)
  const triage = useTriage(() => setSelected(null))
  const verb = useMailVerbs(triage, senderActions)
  const { data: swipes = { right: "read", rightLong: "none", left: "archive", leftLong: "none" } } = useSwipeActions()
  const markSeen = triage.markSeen

  const list = useMemo(() => pages?.pages.flat() ?? [], [pages])
  const loadMore = () => hasNextPage && !isFetchingNextPage && void fetchNextPage()
  const row = list.find((m) => m.threadId === selectedId) ?? selected ?? undefined
  // A reply typed in the open conversation asks before another row or Back drops it (ADR-0092).
  const select = (id: string | null) => leaveThen(() => setSelected(id ? (list.find((m) => m.threadId === id) ?? null) : null))

  // Opening a conversation reads it — once, so "Mark unread" sticks. Advanced
  // settings can wait 3 seconds, so a glance doesn't count, or leave it to you (ADR-0055).
  const markedRef = useRef<string | null>(null)
  const { data: mailPrefs } = useMailPrefs()
  const markRead = mailPrefs?.markRead
  useEffect(() => {
    if (!markRead || markRead === "manual") return
    if (!row || !thread || !thread.some((m) => !m.seen) || markedRef.current === row.threadId) return
    const mark = () => {
      markedRef.current = row.threadId
      markSeen(row, true)
    }
    if (markRead === "open") return mark()
    const t = setTimeout(mark, 3000)
    return () => clearTimeout(t)
  }, [row, thread, markSeen, markRead])

  const multiAccount = accounts.length > 1
  const laneInfo = LANES.find((l) => l.id === tab)!
  // An empty Inbox says when snoozed mail comes back (Mobile / 06), and a desktop lists it beside (Desktop / 04).
  const snoozed = useSnoozed(accountId)
  const inboxZero = tab === "inbox" && !category && !split

  // What the shell says about this screen (ADR-0083): the place, the newest
  // conversation for the phone's scrolled strip, and when mail last arrived.
  // The Screener says how many senders wait, a real count (brief M3): `SCREENER // 03 WAITING`.
  const where = [
    laneInfo.label,
    tab === "screener" ? `${formatListCount(waiting)} waiting` : null,
    // `OUTBOX // 03`: what waits to go (brief M7).
    tab === "scheduled" && outbox.items.length > 0 ? formatListCount(outbox.items.length) : null,
    account ? account.displayName : multiAccount && tab !== "screener" ? "All accounts" : null,
  ]
    .filter(Boolean)
    .join(" // ")
  useScreenPlace(laneInfo.label)
  usePlaceStrip(where, tab === "scheduled" || tab === "team" ? null : (list[0]?.subject ?? null))
  const synced = syncedAt(account ? [account] : accounts)
  useScreenFact(synced ? `Synced // ${synced}` : null)
  // Pull to refresh, and a second tap on Mail's tab: the core checks the servers, and the lists are read again (app/status.tsx).
  useRefresh(checkMail)

  // The page head is the way to the folders and accounts wherever the sidebar does not list them (brief X1).
  // A sideways swipe on it steps the account: All, then each (brief 3.6).
  const stepAccount = useCallback(
    (direction: PageHeadSwipe) => {
      const ids = [null, ...accounts.map((a) => a.id)]
      const at = ids.indexOf(accountId)
      useUi.getState().setMailAccount(ids[(at + (direction === "next" ? 1 : -1) + ids.length) % ids.length] ?? null)
    },
    [accounts, accountId],
  )
  const accountName = account ? account.displayName : multiAccount ? "All accounts" : null
  // After the title, which the head says first: "Today, Personal. Change folder or account." on the page head,
  // and "Inbox, Personal. Change folder or account." on the small title it collapses to.
  const switching = useSectionSwitcher(`${accountName ? `${accountName}. ` : ""}${multiAccount ? "Change folder or account." : "Change folder."}`, multiAccount ? stepAccount : undefined)

  // An account that stopped syncing is Mail's banner (ADR-0086, ADR-0090; Mobile / 07, Desktop / 05): the first one,
  // in the server's words, with when its mail stops. An account signed in with the provider signs in again from the
  // banner, through the core's reauth; any other opens Accounts, where its password is.
  const failing = accounts.find((a) => a.lastError)
  const stops = failing?.lastSync ? factTime(failing.lastSync) : null
  const qc = useQueryClient()
  const reauth = useMutation({
    mutationFn: async (id: string) => (await getCoreClient()).reauthOAuthAccount(id),
    onSuccess: () => void qc.invalidateQueries(),
  })
  const reauthError = reauth.error ? reauth.error.message : null
  const syncBanner = useMemo<SectionBanner | null>(() => {
    if (!failing?.lastError) return null
    const signIn = !!failing.oauth
    return {
      title: `${failing.displayName} account stopped syncing`,
      // A failed sign-in says so in the server's words, beside the button (cross-app decisions §9).
      body: reauthError ?? [failing.lastError, stops && `${failing.displayName} mail stops at ${stops}.`].filter(Boolean).join(" "),
      action: signIn
        ? { label: "Sign in", loading: reauth.isPending, onClick: () => reauth.mutate(failing.id) }
        : { label: "Open accounts", onClick: () => useUi.getState().openSettings("accounts") },
    }
    // reauth.mutate is stable; the banner changes only with what it says.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [failing?.id, failing?.displayName, failing?.lastError, failing?.oauth, stops, reauthError, reauth.isPending])
  // A send that failed and has not been seen (brief M7, X4): the first in its own words with EDIT, or how many with OPEN OUTBOX.
  const notSent = unseen[0]
  const notSentCount = unseen.length
  const failBanner = useMemo<SectionBanner | null>(() => {
    if (!notSent) return null
    if (notSentCount > 1) return { title: `${formatListCount(notSentCount)} messages not sent`, action: { label: "Open Outbox", onClick: () => useUi.getState().showMailTab("scheduled") } }
    return { title: `Not sent: ${notSent.draft.subject.trim() || "message"}`, body: notSent.error ?? undefined, action: { label: "Edit", onClick: () => editFailed(notSent) } }
  }, [notSent, notSentCount])
  // One banner per section: an account that stopped syncing first.
  useSectionBanner("mail", syncBanner ?? failBanner)

  useMailShortcuts({
    list,
    selectedId,
    select,
    compose: () => openComposer({ accountId: accountId ?? accounts[0]?.id }),
    triage,
    selected: row,
    verb,
  })

  return (
    <MasterDetail
      section="Mail"
      onBack={() => (tab === "team" ? setTeamOpen(null) : tab === "scheduled" ? setOutboxOpen(null) : leaveThen(() => setSelected(null)))}
      onRoot={() => {
        useUi.getState().showMailTab("inbox")
        setTeamOpen(null)
        setSelected(null)
      }}
      header={
        <ScreenHead
          overline={where}
          // The Inbox keeps the drawn "Today" and its date; every other lane is named.
          title={tab === "inbox" ? "Today" : laneInfo.label}
          short={laneInfo.label}
          meta={tab === "inbox" ? folioDate(new Date(now * 1000)) : undefined}
          switcher={switching.switcher}
          actions={
            core?.kind === "native" && (
              <Button variant="ghost" size="icon" aria-label="Check for new mail" onClick={() => void checkMail()} disabled={checking}>
                <Icon name="renew" className={checking ? "animate-spin" : undefined} />
              </Button>
            )
          }
          below={
            <div className="flex flex-col gap-3">
              <SectionSwitcher state={switching} overline={["Mail", accountName].filter(Boolean).join(" // ")} title="Folders">
                <MailNav layer more={switching.sheet} />
              </SectionSwitcher>
              {/* The Inbox's filters (brief M2): All, the categories and the splits, one choice at a time. */}
              {tab === "inbox" && accounts.length > 0 && <InboxChips accountId={accountId} onPick={() => setSelected(null)} />}
            </div>
          }
        />
      }
      list={
        tab === "scheduled" ? (
          <OutboxList accountId={accountId} selectedId={outboxOpen} onOpen={setOutboxOpen} />
        ) : tab === "team" ? (
          <TeamList />
        ) : accounts.length === 0 && !isPending ? (
          <EmptyState
            overline="Mail"
            title="Add your first account."
            body="Gmail, Outlook, iCloud, Fastmail or any IMAP account."
            actionLabel="Add account"
            onAction={startFirstRun}
          />
        ) : isPending ? (
          <LoadingRows count={5} label={`Loading ${laneInfo.label}`} />
        ) : (
          <LoadState place={laneInfo.label} overline={laneInfo.label} error={readError} hasData={list.length > 0} onRetry={() => void refetch()} retrying={isRefetching}>
            {/* Above the first conversation, at most two compact rows (brief M1): the Screener where the sidebar can't say it, and the newsletters. */}
            {tab === "inbox" && !category && !split && waiting > 0 && switching.switcher && (
              <ScreenerPointer waiting={waiting} onOpen={() => useUi.getState().setMailTab("screener")} />
            )}
            {bundling && <NewsletterBundle accountId={accountId} now={now} onOpen={() => (setCategory("newsletters"), setSelected(null))} />}
            {list.length === 0 && !(bundling && overview?.bundle) ? (
              inboxZero ? (
                <EmptyState
                  overline={`Inbox zero // ${rowTime(now, new Date(now * 1000))}`}
                  title="Nothing left today."
                  body={snoozed[0]?.snoozedUntil ? `Snoozed mail comes back ${comesBack(snoozed[0].snoozedUntil, now)}.` : undefined}
                  actionLabel="Open archive"
                  onAction={() => useUi.getState().setMailTab("archive")}
                />
              ) : (
                <EmptyState {...emptyCopy(tab === "inbox" ? category : null, laneInfo.label, tab, tab === "inbox" ? splits.find((s) => s.id === split)?.name : undefined)} />
              )
            ) : (
              <VirtualList
                items={list}
                itemKey={(m) => m.threadId}
                // The rows' own heights (brief M1): 120 with a two-line preview, 100 with one or none.
                estimate={(m) => (m.preview.length > 48 ? 120 : 100)}
                onEnd={loadMore}
                label={laneInfo.label}
                render={(m) => (
                  <LaneConversation
                    message={m}
                    lane={lane}
                    now={now}
                    selected={m.threadId === selectedId}
                    onOpen={() => leaveThen(() => setSelected(m))}
                    account={multiAccount && !accountId ? accounts.find((a) => a.id === m.accountId)?.displayName : undefined}
                    swipes={swipes}
                    screening={tab === "screener"}
                    triage={triage}
                    senders={senderActions}
                    verb={verb}
                  />
                )}
              />
            )}
            {isFetchingNextPage && <LoadingRows count={3} label={`Loading more of ${laneInfo.label}`} />}
          </LoadState>
        )
      }
      pick={
        failing && stops
          ? `${failing.displayName} mail stops at ${stops}. Pick a conversation to see it here.`
          : tab === "scheduled"
            ? "Pick a message to see it here."
            : vertical("mail").pick
      }
      idle={
        inboxZero && list.length === 0 && !isPending && accounts.length > 0 ? (
          <SnoozedBeside accountId={accountId} now={now} selectedId={selectedId} onOpen={setSelected} />
        ) : undefined
      }
      side={tab !== "team" && <SenderPanelSlot />}
      detail={
        tab === "team" ? (
          teamOpen && <TeamThreadView key={teamOpen} id={teamOpen} />
        ) : tab === "scheduled" ? (
          outboxOpen && <OutboxMessage key={outboxOpen} id={outboxOpen} onGone={() => setOutboxOpen(null)} />
        ) : selectedId && (
          <ConversationView
            key={selectedId}
            row={row}
            thread={thread}
            account={accounts.find((a) => a.id === row?.accountId)}
            showAccount={multiAccount}
            triage={triage}
            screening={tab === "screener"}
            onLeave={() => setSelected(null)}
            onOpenThread={setSelected}
          />
        )
      }
    />
  )
}

/** The date as the frames write it beside a title: `THU 11.12`. */
const folioDate = (d: Date) =>
  `${d.toLocaleDateString(undefined, { weekday: "short" }).toUpperCase()} ${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`

/** When the accounts shown last finished a sync: the oldest of them, so the line never claims more than is true. */
function syncedAt(accounts: { lastSync: number | null }[]) {
  if (!accounts.length || accounts.some((a) => a.lastSync === null)) return null
  return factTime(Math.min(...accounts.map((a) => a.lastSync!)))
}

/** "at 8:00 AM tomorrow": when snoozed mail comes back, as a sentence says it, in the device's format. */
function comesBack(at: number, now: number) {
  const d = new Date(at * 1000)
  const today = new Date(now * 1000)
  const days = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) / 86_400_000)
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
  if (days <= 0) return `at ${time}`
  if (days === 1) return `at ${time} tomorrow`
  return `at ${time} on ${d.toLocaleDateString(undefined, days < 7 ? { weekday: "long" } : { weekday: "long", month: "long", day: "numeric" })}`
}

/** A lane's empty state, in brief 5.2's words: `{NAME} // 00`, a title, a line at most. */
function emptyCopy(category: Category | null, label: string, tab: string, split?: string): { overline: string; title: string; body?: string } {
  if (split) return { overline: `${split} // 00`, title: "Nothing in this split.", body: "Mail that matches it shows up here." }
  if (category) {
    const c = CATEGORIES.find((x) => x.id === category)!
    return { overline: `${c.label} // 00`, title: c.empty }
  }
  const copy: Record<string, { title: string; body?: string }> = {
    inbox: { title: "Nothing here." },
    unread: { title: "Nothing unread." },
    starred: { title: "Nothing starred.", body: "Star mail to keep it close." },
    snoozed: { title: "Nothing snoozed.", body: "Snoozed mail waits here until it's time." },
    waiting: { title: "Not waiting on anyone.", body: "Set a reminder when you send." },
    archive: { title: "Nothing archived." },
    screener: { title: "No new senders.", body: "First-time senders wait here." },
    mine: { title: "Nothing is yours.", body: "Conversations you take show up here." },
  }
  return { overline: `${label} // 00`, ...(copy[tab] ?? { title: "Nothing here." }) }
}
