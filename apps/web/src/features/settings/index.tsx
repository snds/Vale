import { useEffect, useState } from "react"

import { AppFrameInset, SearchField, SectionHeader, SettingsFrame, useAppFrame, type SettingsSection as FrameSection } from "@unicron/ui"
import { DemoBar } from "@/app/demo-bar"
import { stepBack } from "@/app/places"
import { useScreenFact, useScreenPlace } from "@/app/screen"
import { useUi } from "@/app/ui-store"
import { useUpdateMark } from "@/app/update-mark"
import { ScreenHead } from "@/components/page"
import { isMember } from "@/core/client"
import { useAccounts } from "@/core/queries"
import { AccountRows } from "@/features/accounts"
import { useUpdates } from "@/features/updates/use-updates"

import { closeAccountStep, setAccountStep } from "./account-step"
import { FIND_FROM, findSections, useSettingsSections, type SettingsSection } from "./sections"

/**
 * Settings (brief T0; ADR-0104, which replaces ADR-0075's page) on
 * unicron's SettingsFrame, driven by `sections.ts`. Expanded: the page head
 * and the section list (204) beside the open section, in one column up to
 * 720, headed by its title and one line. Phone and medium: the drawn
 * ACCOUNTS rows of Mobile / 16, then ALL SETTINGS and every section; each
 * section pushes. "Find a setting" from ten sections up.
 */
export function SettingsView() {
  const settings = useUi((s) => s.settings)
  const openSettings = useUi((s) => s.openSettings)
  const frame = useAppFrame()
  const all = useSettingsSections()
  const member = isMember()
  const { data: accounts = [] } = useAccounts()
  const mark = useUpdateMark()
  const version = useUpdates()?.version

  // "Find a setting" counts every section this person has, not the ones a search leaves, so it
  // never goes away while someone types in it.
  const findable = all.length >= FIND_FROM
  const [query, setQuery] = useState("")
  const sections = findable ? findSections(all, query) : all

  // `gateway` was a section until ADR-0104; its update rows are About's now.
  const asked = settings === "gateway" ? "about" : settings === "index" ? null : settings
  // A search that leaves out the open section shows its first match beside the list, without making it the place.
  const value = asked && (sections.some((s) => s.id === asked) || !frame.split) ? asked : frame.split ? (sections[0]?.id ?? null) : null
  const current = all.find((s) => s.id === (value ?? (frame.split ? sections[0]?.id : null))) ?? null

  // The breadcrumb's last part (ADR-0083): SETTINGS // MAIL. The status is the app's version where the build knows it.
  useScreenPlace(current?.name ?? null)
  useScreenFact(version ? `Vale ${version}` : null)

  // Another section, or Settings closed, leaves Accounts at its list.
  const open = current?.id
  useEffect(() => {
    if (open !== "accounts") closeAccountStep()
  }, [open])
  useEffect(() => () => void closeAccountStep(), [])

  // Back from a section: a screen pushed inside it first (Manage an account), then the list of
  // sections, by the browser's Back when the list is the place behind (ADR-0084).
  const back = () => {
    if (closeAccountStep()) return
    stepBack((behind) => behind.settings === "index", () => useUi.setState({ settings: "index" }))
  }
  const pick = (id: string | null) => {
    if (id === null) return back()
    // Accounts again, from its own pushed screen: back to its list.
    if (id === "accounts") closeAccountStep()
    openSettings(id as SettingsSection)
  }

  const names = member ? [] : accounts.map((a) => a.displayName)
  const frameSections: FrameSection[] = sections.map((s) => ({ value: s.id, label: s.name, icon: s.icon, group: s.group, description: s.description, mark: s.id === "about" ? mark : undefined }))

  return (
    <SettingsFrame
      sections={frameSections}
      value={value}
      onValueChange={pick}
      head={
        <>
          <DemoBar in="column" />
          {/* A phone names Settings in its top row (Mobile / 16); the large head is the desktop's and medium's. */}
          {!frame.phone && <ScreenHead overline={names.length ? `Settings // ${names.join(" + ")}` : "Settings"} title="Settings" />}
          {findable && (
            <AppFrameInset>
              <div className="flex flex-col gap-2 pb-6">
                <SearchField aria-label="Find a setting" placeholder="Find a setting" value={query} onValueChange={setQuery} />
                {!sections.length && <p className="type-caption text-text-secondary">No setting matches “{query.trim()}”.</p>}
              </div>
            </AppFrameInset>
          )}
        </>
      }
      overview={
        // Mobile / 16's drawn rows that have a real setting behind them: the accounts. Then every section.
        query.trim() ? undefined : (
          <AppFrameInset>
            {!member && <AccountRows onManage={(a) => (setAccountStep({ kind: "manage", id: a.id }), openSettings("accounts"))} />}
            <div className={member || !accounts.length ? undefined : "pt-8"}>
              <SectionHeader title="All settings" count={all.length} level={2} />
            </div>
          </AppFrameInset>
        )
      }
    >
      {current && (
        <>
          <DemoBar in="column" />
          <AppFrameInset key={current.id}>
            <current.body />
          </AppFrameInset>
        </>
      )}
    </SettingsFrame>
  )
}
