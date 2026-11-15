import { useCore } from "@/core/queries"
import { AdvancedMail } from "@/features/advanced-mail"
import { MeetingSettingsSection } from "@/features/meeting-settings"
import { MenuBarSettingsSection } from "@/features/menu-bar-settings"
import { ScreenerSettingsSection } from "@/features/screener-settings"

import { SecondZoneRow, WeekStartsRow } from "./second-zone-row"
import { SettingBlock } from "./setting-block"

/**
 * What a settings section shows when it is more than one feature's
 * component (ADR-0085); the registry in `sections.ts` names the rest
 * directly. The section's title and its one
 * line are the frame's (ADR-0104), so a body starts with its rows. A lane
 * that rebuilds a section changes its body here, or points the registry at
 * its own. Mail, Signatures and templates, Notifications and Calendar are
 * ADR-0110's; Notes, Shortcuts and AI are ADR-0111's, Team members and
 * About ADR-0112's, in their own files.
 */

export function MailBody() {
  return (
    <div className="flex flex-col gap-8">
      <AdvancedMail />
      <ScreenerSettingsSection />
    </div>
  )
}

export function CalendarBody() {
  const remote = !!useCore().data?.remote
  return (
    <div className="flex flex-col gap-8">
      <MeetingSettingsSection />
      {/* The menu bar is the desktop's; the demo stands in for it. A gateway has none. */}
      {!remote && <MenuBarSettingsSection />}
      {/* This device's choices, beside the hours of the week and the day. No week numbers and no default alert: the core has neither (W4). */}
      <SettingBlock title="Time">
        <SecondZoneRow />
        <WeekStartsRow />
      </SettingBlock>
    </div>
  )
}
