import { factTime } from "@/app/screen"
import { checkMail, useStatus } from "@/app/live-status"
import { useNavPicked } from "@/app/places"
import { FirstGroup } from "@/app/section-switcher"
import { useUi } from "@/app/ui-store"
import { Button, FieldRow, FieldRowAction, NavItem, NavSection, SectionHeader, type IconName } from "@unicron/ui"
import { isMember } from "@/core/client"
import { useCore } from "@/core/queries"
import { startAddAccount } from "@/features/onboarding/start-add-account"

import { LANES, type MailTab } from "./lanes"
import { useFailedSends } from "./outbox"
import { useMailPlace } from "./use-mail-place"

const ICONS: Record<MailTab, IconName> = {
  inbox: "email",
  screener: "user--admin",
  unread: "email--new",
  starred: "star",
  snoozed: "time",
  waiting: "notification",
  scheduled: "send--alt",
  archive: "archive",
  mine: "user",
  team: "user--multiple",
}
const lane = (id: MailTab) => LANES.find((l) => l.id === id)!

/**
 * Mail's second level (ADR-0084; brief X1): the folders, the team's two
 * lists, and the accounts as a filter. In the sidebar on a desktop; in the
 * page head's sheet or popover elsewhere (`layer`), where `more` adds the
 * phone's own last group.
 */
export function MailNav({ layer = false, more = false }: { layer?: boolean; more?: boolean }) {
  const { tab, account, accounts, folders, team, waiting } = useMailPlace()
  // Settings or Search stands in the section's place: then none of its rows is the current one.
  const settings = useUi((s) => !!s.settings || !!s.search)
  const picked = useNavPicked()
  // A send that failed and has not been looked at: the Outbox in the critical tone (brief M7), until it is opened.
  const notSent = useFailedSends().unseen.length
  const go = (id: MailTab) => {
    useUi.getState().setMailTab(id)
    picked()
  }
  const row = (id: MailTab) => (
    <NavItem
      key={id}
      label={lane(id).label}
      icon={ICONS[id]}
      current={!settings && tab === id}
      // The Screener's count is the desktop's pointer to it (brief M3); a phone shows a row at the top of the Inbox.
      mark={id === "screener" && waiting > 0 ? { count: waiting, label: `${waiting} new ${waiting === 1 ? "sender" : "senders"} waiting` } : undefined}
      tone={id === "scheduled" && notSent > 0 ? "critical" : undefined}
      toneLabel={id === "scheduled" && notSent > 0 ? `${notSent === 1 ? "a message" : `${notSent} messages`} not sent` : undefined}
      onClick={() => go(id)}
    />
  )
  return (
    <>
      <FirstGroup layer={layer} title="Mail // folders">
        {folders.map(row)}
      </FirstGroup>
      {accounts.length > 1 && (
        <div className="flex flex-col gap-1">
          {/* A filter, not a place: a radio group, so no row here is ever "current". No "All" row, as
              Mobile / 05 and Desktop / 01 draw it: none chosen is all of them. While one is chosen, the
              heading's ALL goes back to all of them (Vale 1): unpicking a radio by pressing it again is
              hidden from most people and from screen readers. Pressing the chosen account still works. */}
          <NavSection
            title="Accounts"
            count={accounts.length}
            checkable="single"
            aria-label="Account"
            action={
              account ? (
                <Button
                  variant="link"
                  size="inline"
                  aria-label="Show all accounts"
                  onClick={() => {
                    useUi.getState().setMailAccount(null)
                    picked()
                  }}
                >
                  All
                </Button>
              ) : undefined
            }
          >
            {accounts.map((a) => (
              <NavItem
                key={a.id}
                ref={a.lastError ? showBroken : undefined}
                label={a.displayName}
                icon="user--avatar"
                checked={account?.id === a.id}
                tone={a.lastError ? "critical" : undefined}
                toneLabel="sync problem"
                onCheckedChange={() => useUi.getState().setMailAccount(a.id)}
                onClick={(e) => {
                  if (account?.id === a.id) {
                    e.preventDefault()
                    useUi.getState().setMailAccount(null)
                  }
                  picked()
                }}
              />
            ))}
          </NavSection>
          {/* The accounts are the gateway owner's: a team member works their mail and adds none (ADR-0063). */}
          {!isMember() && <NavItem
            label="Add an account…"
            icon="add"
            onClick={() => {
              picked()
              startAddAccount()
            }}
          />}
        </div>
      )}
      {/* The team's lists after the accounts (Desktop / 05): an account that stopped syncing stays in sight. */}
      {team.length > 0 && <NavSection title="Team">{team.map(row)}</NavSection>}
      {more && <MailMore />}
    </>
  )
}

/**
 * An account that stopped syncing is the sidebar's one critical signal (Desktop / 05). When the
 * groups are taller than the window, the scrolling middle brings its row into view once it
 * appears, moving by whole groups so no row is left cut in half at the top.
 */
function showBroken(el: HTMLElement | null) {
  const middle = el?.closest<HTMLElement>('[data-slot="app-frame-sidebar-middle"]')
  if (!el || !middle) return el?.scrollIntoView({ block: "nearest" })
  const below = el.getBoundingClientRect().bottom - middle.getBoundingClientRect().bottom
  if (below <= 0) return
  const need = middle.scrollTop + below
  const top = middle.getBoundingClientRect().top - middle.scrollTop
  // The first group (Search, APPS, the folders) that starts at or past the distance needed.
  const step = [...middle.children].map((c) => c.getBoundingClientRect().top - top).find((t) => t >= need)
  middle.scrollTop = step ?? need
}

/** The phone sheet's last group: when mail was last checked, and the plain way to check again (pull to refresh has one too). */
function MailMore() {
  const { data: core } = useCore()
  const { account, accounts } = useMailPlace()
  const checking = useStatus((s) => s.checking > 0)
  // Only the desktop core checks the servers itself; a gateway keeps its own time.
  if (core?.kind !== "native") return null
  const shown = account ? [account] : accounts
  const checked = shown.length > 0 && shown.every((a) => a.lastSync !== null) ? factTime(Math.min(...shown.map((a) => a.lastSync!))) : "Not yet"
  return (
    <section className="flex flex-col gap-2">
      <SectionHeader title="More" level={3} />
      <FieldRow
        size="stacked"
        rule="none"
        label="Last checked"
        action={
          <FieldRowAction loading={checking} onClick={() => void checkMail()}>
            Check again
          </FieldRowAction>
        }
      >
        {checked}
      </FieldRow>
    </section>
  )
}
