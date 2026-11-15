import { useTheme } from "next-themes"
import { useEffect, useState } from "react"

import { useUi } from "@/app/ui-store"
import { useDemoUpdate } from "@/app/update-mark"
import { VERTICALS } from "@/app/verticals"
import { Command, CommandDialog, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut, Icon, Kbd, toast, useAppFrame, type IconName } from "@unicron/ui"
import { isDesktopApp, isMember } from "@/core/client"
import { useKeyBindings, useScreener } from "@/core/queries"
import { setCalendarHours, useCalendarViewPrefs } from "@/features/calendar/view-prefs"
import { openMissed, useMissedReminders } from "@/features/calendar/missed-reminders"
import { openRestoreContacts } from "@/features/contacts/open-restore"
import { LANES } from "@/features/mail/lanes"
import { openSharedNote } from "@/features/notes/open-shared-note"
import { startAddAccount } from "@/features/onboarding/start-add-account"
import { openSearch } from "@/features/search/open"
import { useSettingsSections } from "@/features/settings/sections"
import { useUpdates } from "@/features/updates/use-updates"
import { withUpdates } from "@/features/updates/update-client"
import { keyLabel, searchKey } from "@/lib/keys"

const LANE_ICONS: Record<string, IconName> = {
  inbox: "email",
  screener: "user--admin",
  unread: "email--new",
  starred: "star",
  snoozed: "time",
  waiting: "notification",
  scheduled: "send--alt",
  archive: "archive",
}

/** "Check for updates" from the menu: checks, and opens Settings › About, where the outcome shows. */
function checkForUpdates() {
  useUi.getState().openSettings("about")
  void withUpdates((c) => c.check()).catch((e) => toast.error("Couldn't check for updates", { description: String(e) }))
}

const apple = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform)
const mod = apple ? "⌘" : "Ctrl+"
const alt = apple ? "⌥" : "Alt+"

/** A row's way to run: close the menu, then do it. */
type Run = (fn: () => void) => () => void

/**
 * ⌘K / Ctrl+K (ADR-0096; brief X3, cross-app decisions §6): do or reach
 * anything by name. The form-size dialog in the top third; groups under mono
 * overlines (CREATE, MAIL, GO TO, SETTINGS, VIEW, and VALE in the desktop
 * app), a key at the right of each row that has one; while typing, the last
 * row is "Search everything for …". Off while writing a message. A team
 * member sees MAIL, Search and their own settings sections. Mounted once at
 * the root.
 */
export function CommandPalette({ onCreate }: { onCreate: Record<"mail" | "calendar" | "contacts" | "notes", () => void> }) {
  const open = useUi((s) => s.paletteOpen)
  const setOpen = useUi((s) => s.setPaletteOpen)
  const [query, setQuery] = useState("")

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "k" || !(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return
      // The composer keeps the keyboard while you write.
      if (useUi.getState().composer) return
      e.preventDefault()
      useUi.getState().setPaletteOpen(!useUi.getState().paletteOpen)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const run: Run = (fn) => () => {
    setOpen(false)
    setQuery("")
    fn()
  }
  const q = query.trim()
  const member = isMember()

  return (
    <CommandDialog open={open} onOpenChange={(o) => (setOpen(o), !o && setQuery(""))} title="Command menu" description="Type to find an action, a place or a setting">
      <Command>
        <CommandInput autoFocus placeholder="Type a command or search…" value={query} onValueChange={setQuery} />
        <CommandList>
          {/* No empty state: while you type, the last row is always there. */}
          {!member && <CreateGroup run={run} onCreate={onCreate} />}
          <MailGroup run={run} />
          <GoToGroup run={run} member={member} />
          <SettingsGroup run={run} member={member} />
          {!member && <ViewGroup run={run} />}
          {isDesktopApp() && <ValeGroup run={run} />}
          {q && (
            <CommandGroup heading="Search" forceMount>
              {/* The last row in every app (cross-app decisions §6). Its value never matches, so a command that does ranks above it. A team member has mail alone. */}
              <CommandItem value="search-everything" forceMount onSelect={run(() => openSearch(member ? "mail" : "all", q))}>
                <Icon name="search" />
                {member ? `Search mail for “${q}”` : `Search everything for “${q}”`}
              </CommandItem>
            </CommandGroup>
          )}
        </CommandList>
      </Command>
      <div className="px-4 py-3">
        <p className="type-meta text-muted-foreground">
          <Kbd>?</Kbd> lists every key.
        </p>
      </div>
    </CommandDialog>
  )
}

/** CREATE: a new thing of each kind, a quick note about what is open, and a shared note by its link. */
function CreateGroup({ run, onCreate }: { run: Run; onCreate: Record<"mail" | "calendar" | "contacts" | "notes", () => void> }) {
  const { data: keys } = useKeyBindings()
  const quickLabel = useUi((s) => s.quickContext?.label)
  return (
    <CommandGroup heading="Create">
      <CommandItem onSelect={run(onCreate.mail)} keywords={["compose", "write", "email", "message"]}>
        <Icon name="edit" />
        New message
        {keys?.["mail.compose"] && <CommandShortcut>{keyLabel(keys["mail.compose"])}</CommandShortcut>}
      </CommandItem>
      <CommandItem onSelect={run(onCreate.calendar)} keywords={["meeting", "appointment"]}>
        <Icon name="calendar" />
        New event
      </CommandItem>
      <CommandItem onSelect={run(onCreate.contacts)} keywords={["person", "people"]}>
        <Icon name="user--multiple" />
        New contact
      </CommandItem>
      <CommandItem onSelect={run(onCreate.notes)}>
        <Icon name="notebook" />
        New note
      </CommandItem>
      <CommandItem onSelect={run(() => useUi.getState().openQuickNote())} keywords={["jot", "scratch", "quick", "note"]}>
        <Icon name="edit" />
        Quick note{quickLabel ? ` about ${quickLabel}` : ""}
        <CommandShortcut>{alt}N</CommandShortcut>
      </CommandItem>
      <CommandItem onSelect={run(openSharedNote)} keywords={["link", "shared", "open", "note"]}>
        <Icon name="link" />
        Open a shared note…
      </CommandItem>
    </CommandGroup>
  )
}

/** MAIL: every lane, as Mail's folders list them. */
function MailGroup({ run }: { run: Run }) {
  const { data: screener } = useScreener()
  return (
    <CommandGroup heading="Mail">
      {LANES.filter((l) => l.id !== "screener" || screener?.enabled).map((l) => (
        <CommandItem key={l.id} value={`mail ${l.label}`} onSelect={run(() => useUi.getState().showMailTab(l.id))}>
          <Icon name={LANE_ICONS[l.id] ?? "email"} />
          {l.label}
        </CommandItem>
      ))}
    </CommandGroup>
  )
}

/** GO TO: each section and its places, Restore contacts, Search with its key, and Missed reminders once that list was raised. */
function GoToGroup({ run, member }: { run: Run; member: boolean }) {
  const { data: keys } = useKeyBindings()
  const missed = useMissedReminders((s) => s.raised && s.items.length > 0)
  const ui = useUi.getState
  const key = searchKey(keys)
  return (
    <CommandGroup heading="Go to">
      {!member && (
        <>
          {VERTICALS.map((v) => (
            <CommandItem key={v.id} value={`go to ${v.label}`} onSelect={run(() => ui().setVertical(v.id))}>
              <Icon name={v.icon} />
              {v.label}
            </CommandItem>
          ))}
          <CommandItem value="go to Tasks" onSelect={run(() => (ui().setVertical("calendar"), ui().setCalendarPlace("tasks")))} keywords={["to do", "checklist"]}>
            <Icon name="task" />
            Tasks
          </CommandItem>
          <CommandItem value="go to Booking links" onSelect={run(() => (ui().setVertical("calendar"), ui().setCalendarPlace("booking")))} keywords={["schedule", "appointment", "link"]}>
            <Icon name="link" />
            Booking links
          </CommandItem>
          <CommandItem value="go to Duplicates" onSelect={run(() => (ui().setVertical("contacts"), ui().setContactsPlace({ kind: "duplicates" })))} keywords={["merge", "contacts"]}>
            <Icon name="copy" />
            Duplicates
          </CommandItem>
          <CommandItem value="go to Recently deleted" onSelect={run(() => (ui().setVertical("contacts"), ui().setContactsPlace({ kind: "deleted" })))} keywords={["trash", "deleted", "contacts"]}>
            <Icon name="trash-can" />
            Recently deleted
          </CommandItem>
          <CommandItem value="go to Restore contacts" onSelect={run(openRestoreContacts)} keywords={["undo", "contacts", "earlier"]}>
            <Icon name="restart" />
            Restore contacts
          </CommandItem>
        </>
      )}
      {/* Search as a place (ADR-0085), from where you are. */}
      <CommandItem value="go to Search" onSelect={run(() => openSearch())} keywords={["find", "look for"]}>
        <Icon name="search" />
        Search
        {key && <CommandShortcut>{keyLabel(key)}</CommandShortcut>}
      </CommandItem>
      {!member && missed && (
        <CommandItem value="go to Missed reminders" onSelect={run(openMissed)} keywords={["reminders", "alerts", "missed"]}>
          <Icon name="notification" />
          Missed reminders
        </CommandItem>
      )}
    </CommandGroup>
  )
}

/** SETTINGS: Settings, each section this person has by name, Add an account…, and the keys list. */
function SettingsGroup({ run, member }: { run: Run; member: boolean }) {
  const sections = useSettingsSections()
  const ui = useUi.getState
  return (
    <CommandGroup heading="Settings">
      <CommandItem onSelect={run(() => ui().openSettings())} keywords={["preferences", "options"]}>
        <Icon name="settings" />
        Settings
        <CommandShortcut>{mod},</CommandShortcut>
      </CommandItem>
      {sections.map((s) => (
        <CommandItem key={s.id} value={`settings ${s.name}`} onSelect={run(() => ui().openSettings(s.id))} keywords={s.keywords}>
          <Icon name={s.icon} />
          {s.name}
        </CommandItem>
      ))}
      {!member && (
        <CommandItem onSelect={run(startAddAccount)} keywords={["account", "sign in", "gmail", "outlook", "imap"]}>
          <Icon name="add" />
          Add an account…
        </CommandItem>
      )}
      <CommandItem onSelect={run(() => ui().setShortcutsOpen(true))} keywords={["keyboard", "shortcuts", "keys", "hotkeys"]}>
        <Icon name="keyboard" />
        Keyboard shortcuts
        <CommandShortcut>?</CommandShortcut>
      </CommandItem>
    </CommandGroup>
  )
}

/** VIEW: the theme by its names, the calendar's hours, and the sidebar (where it can collapse). */
function ViewGroup({ run }: { run: Run }) {
  const { setTheme } = useTheme()
  const { hours } = useCalendarViewPrefs()
  const collapsed = useUi((s) => s.sidebarCollapsed)
  // The sidebar collapses only where it shows in full; narrower, the frame draws its rail anyway.
  const expanded = useAppFrame().layout === "expanded"
  return (
    <CommandGroup heading="View">
      {/* The same three choices as Settings › Appearance, saved in the same place (ADR-0082). */}
      <CommandItem onSelect={run(() => setTheme("system"))} keywords={["appearance", "device", "automatic", "auto", "dark mode", "light mode"]}>
        <Icon name="devices" />
        Theme: System
      </CommandItem>
      <CommandItem onSelect={run(() => setTheme("light"))} keywords={["appearance", "light mode", "light", "day"]}>
        <Icon name="sun" />
        Theme: Stone
      </CommandItem>
      <CommandItem onSelect={run(() => setTheme("dark"))} keywords={["appearance", "dark mode", "dark", "night"]}>
        <Icon name="moon" />
        Theme: Graphite
      </CommandItem>
      <CommandItem onSelect={run(() => setCalendarHours(!hours))} keywords={["calendar", "hours", "grid", "week", "day"]}>
        <Icon name="time" />
        {hours ? "Hide hours" : "Show hours"}
      </CommandItem>
      {expanded && (
        <CommandItem onSelect={run(() => useUi.getState().setSidebarCollapsed(!collapsed))} keywords={["sidebar", "rail", "collapse", "expand"]}>
          <Icon name={collapsed ? "side-panel--open" : "side-panel--close"} />
          {collapsed ? "Show sidebar" : "Collapse sidebar"}
          <CommandShortcut>{mod}\</CommandShortcut>
        </CommandItem>
      )}
    </CommandGroup>
  )
}

/** VALE, in the desktop app (ADR-0076): its updates and a reload. Their outcome shows in Settings › About. */
function ValeGroup({ run }: { run: Run }) {
  const state = useUpdates()?.state
  const demoReady = useDemoUpdate((s) => s.offered !== null)
  const ready = state === "ready" || demoReady
  return (
    <CommandGroup heading="Vale">
      <CommandItem onSelect={run(checkForUpdates)} keywords={["update", "upgrade", "new version", "about"]}>
        <Icon name="renew" />
        Check for updates
      </CommandItem>
      {ready && (
        <CommandItem onSelect={run(() => void withUpdates((c) => c.restart()).catch((e) => toast.error("Couldn't restart Vale", { description: String(e) })))} keywords={["update", "install", "restart"]}>
          <Icon name="restart" />
          Restart to update
        </CommandItem>
      )}
      <CommandItem onSelect={run(() => void withUpdates((c) => c.reload()).catch((e) => toast.error("Couldn't reload Vale", { description: String(e) })))} keywords={["restart", "relaunch", "reopen"]}>
        <Icon name="restart" />
        Reload app
      </CommandItem>
    </CommandGroup>
  )
}
