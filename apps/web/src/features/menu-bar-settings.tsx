import { ToggleRow } from "@unicron/ui"
import { useMenuBarPrefs, usePimAction } from "@/core/queries"
import type { MenuBarPrefs } from "@/core/types"
import { useSettingSave } from "@/features/settings/save"
import { SaveFailed } from "@/features/settings/save-failed"
import { SettingBlock } from "@/features/settings/setting-block"

/**
 * Settings › Calendar › MENU BAR (brief T4; ADR-0054): the menu-bar
 * calendar's two switches. Not on a gateway. Saves at once and silently.
 */
export function MenuBarSettingsSection() {
  const { data: prefs } = useMenuBarPrefs()
  const set = usePimAction((c, p: MenuBarPrefs) => c.setMenuBarPrefs(p))
  const save = useSettingSave()
  if (!prefs) return null
  return (
    <SettingBlock title="Menu bar">
      <ToggleRow
        label="Calendar in the menu bar"
        description="While it's on, closing the window keeps Vale running there."
        checked={prefs.enabled}
        onCheckedChange={(enabled) => save.run("enabled", set.mutateAsync({ ...prefs, enabled }))}
      />
      <SaveFailed message={save.failed("enabled")} />
      <ToggleRow
        label="Show what's next"
        description="Beside the icon, like “Design review in 25 min”."
        checked={prefs.enabled && prefs.showNext}
        disabledReason={prefs.enabled ? undefined : "Needs Calendar in the menu bar."}
        onCheckedChange={(showNext) => save.run("showNext", set.mutateAsync({ ...prefs, showNext }))}
      />
      <SaveFailed message={save.failed("showNext")} />
    </SettingBlock>
  )
}
