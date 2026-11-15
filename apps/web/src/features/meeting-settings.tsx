import { ToggleRow } from "@unicron/ui"
import { useMeetingPrefs, usePimAction } from "@/core/queries"
import { useSettingSave } from "@/features/settings/save"
import { SaveFailed } from "@/features/settings/save-failed"
import { SettingBlock } from "@/features/settings/setting-block"

/** Settings › Calendar › CALLS (brief T4; ADR-0030): how Join opens a call. Saves at once and silently. */
export function MeetingSettingsSection() {
  const { data: prefs } = useMeetingPrefs()
  const set = usePimAction((c, openInApps: boolean) => c.setMeetingPrefs({ openInApps }))
  const save = useSettingSave()
  if (!prefs) return null
  return (
    <SettingBlock title="Calls">
      <ToggleRow
        label="Calls open in their apps"
        description="Zoom and Teams. Off: every call opens in the browser."
        checked={prefs.openInApps}
        onCheckedChange={(on) => save.run("calls", set.mutateAsync(on))}
      />
      <SaveFailed message={save.failed("calls")} />
    </SettingBlock>
  )
}
