import { isMember, isTauri } from "@/core/client"
import { useCore } from "@/core/queries"
import { AdvancedMail } from "@/features/advanced-mail"
import { GatewayUpdatesSection } from "@/features/gateway-updates"
import { MeetingSettingsSection } from "@/features/meeting-settings"
import { MenuBarSettingsSection } from "@/features/menu-bar-settings"
import { ScreenerSettingsSection } from "@/features/screener-settings"
import { AboutSection } from "@/features/updates/about-section"

import { SecondZoneRow } from "./second-zone-row"

/**
 * What a settings section shows when it is more than one feature's
 * component (ADR-0085); the registry in `sections.ts` names the rest
 * directly. The section's title and its one
 * line are the frame's (ADR-0104), so a body starts with its rows. A lane
 * that rebuilds a section changes its body here, or points the registry at
 * its own. Mail, Signatures and templates, AI, Notifications, Team members,
 * Calendar, Shortcuts and About keep today's rows until their slices.
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
      {/* The menu bar is the desktop's; the demo stands in for it. */}
      {!remote && <MenuBarSettingsSection />}
      {/* A choice for this device, beside the hours of the week and the day (it was in the calendar's side list). */}
      <SecondZoneRow />
    </div>
  )
}

/** Registered and not shown yet: the notes lane gives it rows, and its `when`, without touching the store. */
export const NotesBody = () => null

/**
 * About (brief T12): this app's updates on the desktop app, and the
 * gateway's for its owner, which were a section of their own ("Gateway
 * updates", ADR-0077) until ADR-0104. The two groups get their headers
 * when About is rebuilt.
 */
export function AboutBody() {
  const owner = !!useCore().data?.remote && !isMember()
  return (
    <div className="flex flex-col gap-8">
      {isTauri() && <AboutSection />}
      {owner && <GatewayUpdatesSection />}
    </div>
  )
}
