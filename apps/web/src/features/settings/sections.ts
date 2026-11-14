import type { ComponentType } from "react"

import type { IconName } from "@unicron/ui"
import { isMember, isTauri } from "@/core/client"
import { useAccounts, useCore } from "@/core/queries"

import { AccountsSection } from "@/features/accounts"
import { AiSettingsForm } from "@/features/ai-settings"
import { AppearanceSettings } from "@/features/appearance-settings"
import { ShortcutSettings } from "@/features/grammar"
import { PushSettingsSection } from "@/features/push-settings"
import { Members } from "@/features/team-members"
import { WritingSettings } from "@/features/writing-settings"

import { AboutBody, CalendarBody, MailBody, NotesBody } from "./section-bodies"

/**
 * The settings sections, in one place (ADR-0085; brief T0). The settings
 * page, the phone's list of sections and the command menu all read this
 * list, so a section added or renamed here shows in all three. The store
 * imports only the id type, so a lane that adds rows to a section, or shows
 * a hidden one, edits this folder and nothing else.
 */

/**
 * A section's id: what `openSettings` takes and the store keeps. `gateway`
 * is no longer a section of its own (ADR-0104): its update rows are About's
 * and its sign-out is Accounts'. The id stays so an old link still lands, on
 * About.
 */
export type SettingsSection = "accounts" | "team" | "mail" | "writing" | "ai" | "notifications" | "calendar" | "notes" | "appearance" | "shortcuts" | "gateway" | "about"

/** The overline groups of brief T0, in order. A group with no section shown is left out. */
export type SettingsGroup = "Accounts" | "Mail" | "Calendar and notes" | "Vale"

/** What decides whether a person has a section. */
export interface SettingsContext {
  /** At least one mail account is set up. */
  hasAccount: boolean
  /** The core is a gateway's (or the demo standing in for one), not this device's own. */
  remote: boolean
  /** A team member on a gateway (ADR-0063): the mail is shared, the rest is the owner's. */
  member: boolean
  /** The desktop app, which updates itself (ADR-0076). */
  desktopApp: boolean
}

export interface SettingsSectionEntry {
  id: SettingsSection
  /** As the list, the breadcrumb and the command menu name it. "and", never "&". */
  name: string
  /** The section head's one line, under its title (cross-app decisions §5). */
  description: string
  group: SettingsGroup
  icon: IconName
  /** Other words the command menu finds it by. */
  keywords: string[]
  /** Who has it. The conditions are the ones each section had before the list moved here. */
  when: (ctx: SettingsContext) => boolean
  body: ComponentType
}

export const SETTINGS_SECTIONS: SettingsSectionEntry[] = [
  // A team member has it too: the one block that says whose accounts these are, and Sign out.
  { id: "accounts", name: "Accounts", group: "Accounts", icon: "user--settings", description: "Where your mail, calendars and contacts come from.", keywords: ["settings", "add account", "sign in", "sign out", "gateway"], when: () => true, body: AccountsSection },
  { id: "team", name: "Team members", group: "Accounts", icon: "user--multiple", description: "People you add read and reply from this gateway's accounts. Everything else stays yours.", keywords: ["settings", "people", "invite", "shared inbox"], when: (c) => c.remote && !c.member, body: Members },
  { id: "mail", name: "Mail", group: "Mail", icon: "email", description: "The defaults keep your reading private. Change them here.", keywords: ["settings", "privacy", "images", "screener", "mark as read", "quote", "receipts"], when: (c) => c.hasAccount && !c.member, body: MailBody },
  { id: "writing", name: "Signatures and templates", group: "Mail", icon: "edit", description: "What goes under your messages, and text you reuse.", keywords: ["settings", "signature", "template", "snippet"], when: (c) => c.hasAccount && !c.member, body: WritingSettings },
  { id: "ai", name: "AI summaries and replies", group: "Mail", icon: "bot", description: "Off unless you turn it on. A conversation goes to the model only when you ask.", keywords: ["settings", "model", "summary", "assistant"], when: (c) => c.hasAccount && !c.member, body: AiSettingsForm },
  // "New mail on your phone" until ADR-0085; the id was "phone".
  { id: "notifications", name: "Notifications", group: "Mail", icon: "mobile", description: "How new mail reaches your phone while Vale is closed.", keywords: ["settings", "push", "phone", "new mail", "alerts"], when: (c) => c.hasAccount && !c.remote && !c.member, body: PushSettingsSection },
  { id: "calendar", name: "Calendar", group: "Calendar and notes", icon: "calendar", description: "How meetings open, and the hours you see.", keywords: ["settings", "meetings", "menu bar", "time zone", "second zone"], when: (c) => !c.member, body: CalendarBody },
  // Registered so its id is the store's already; hidden until the notes lane gives it rows (brief T5).
  { id: "notes", name: "Notes", group: "Calendar and notes", icon: "notebook", description: "Where notes sync.", keywords: ["settings"], when: () => false, body: NotesBody },
  // Everyone has it, a team member too: the theme is this device's, not the gateway's (ADR-0082).
  { id: "appearance", name: "Appearance", group: "Vale", icon: "contrast", description: "How Vale looks on this device.", keywords: ["settings", "theme", "stone", "graphite", "dark mode", "light mode", "system"], when: () => true, body: AppearanceSettings },
  { id: "shortcuts", name: "Shortcuts and gestures", group: "Vale", icon: "keyboard", description: "Every key and swipe, so nothing is gesture-only.", keywords: ["settings", "keyboard", "swipe", "change keys", "change keys and swipes"], when: () => true, body: ShortcutSettings },
  // The desktop app's own updates (ADR-0076), and a gateway's for its owner (ADR-0077; brief T12, "Server").
  { id: "about", name: "About", group: "Vale", icon: "information", description: "This version of Vale, and its updates.", keywords: ["settings", "version", "updates", "server", "gateway", "image"], when: (c) => !c.member && (c.desktopApp || c.remote), body: AboutBody },
]

/** "Find a setting" from this many sections up (cross-app decisions §5). */
export const FIND_FROM = 10

/** The sections whose name, line or keywords hold the words typed into "Find a setting". */
export function findSections(sections: SettingsSectionEntry[], query: string): SettingsSectionEntry[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return sections
  return sections.filter((s) => {
    const text = [s.name, s.description, ...s.keywords].join(" ").toLowerCase()
    return words.every((w) => text.includes(w))
  })
}

/** The sections this person has, in order: a team member only their own; most need an account. */
export function useSettingsSections(): SettingsSectionEntry[] {
  const { data: accounts = [] } = useAccounts()
  const { data: core } = useCore()
  const ctx: SettingsContext = { hasAccount: accounts.length > 0, remote: !!core?.remote, member: isMember(), desktopApp: isTauri() }
  return SETTINGS_SECTIONS.filter((s) => s.when(ctx))
}
