import { useState } from "react"

import { AutoCheckSwitch, UpdateStatusRow } from "@unicron/ui"
import { isDesktopApp, isMember } from "@/core/client"
import { useCore } from "@/core/queries"
import { GatewayUpdatesSection } from "@/features/gateway-updates"
import { SaveFailed } from "@/features/settings/save-failed"
import { SettingBlock } from "@/features/settings/setting-block"

import { withUpdates } from "./update-client"
import { APP_WORDS } from "./update-model"
import { useUpdates } from "./use-updates"

const said = (e: unknown) => (e instanceof Error ? e.message : String(e))

/**
 * Settings › About (brief T12; ADR-0112): two groups, as in every app
 * (cross-app decisions §3). THIS APP for the desktop app, which updates
 * itself; SERVER for a gateway's owner. An update that is ready raises no
 * toast: the mark on the way into Settings says so (ADR-0083).
 */
export function AboutBody() {
  const owner = !!useCore().data?.remote && !isMember()
  return (
    <div className="flex flex-col gap-8">
      {isDesktopApp() && <ThisApp />}
      {owner && <GatewayUpdatesSection />}
    </div>
  )
}

/**
 * THIS APP: unicron's `UpdateStatusRow` (VERSION · "Vale {version}" and the
 * channel, the state as one line, CHECK FOR UPDATES, RESTART TO UPDATE once
 * an update is ready or RELOAD APP otherwise, RELEASE NOTES when there are
 * some) and `AutoCheckSwitch`. The switch saves silently; a refusal leaves it
 * as it was with one critical line.
 */
function ThisApp() {
  const status = useUpdates()
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [autoFailed, setAutoFailed] = useState<string | null>(null)
  if (!status) return null

  const run = (work: Promise<unknown>) => {
    setError(null)
    work.catch((e: unknown) => setError(said(e)))
  }

  return (
    <SettingBlock title="This app">
      <UpdateStatusRow
        status={status}
        appName="Vale"
        words={APP_WORDS}
        onCheck={() => run(withUpdates((c) => c.check()))}
        onRestart={() => run(withUpdates((c) => c.restart()))}
        onReload={() => run(withUpdates((c) => c.reload()))}
        onOpenLink={() => run(withUpdates((c) => c.openPage()))}
        error={error}
      />
      <AutoCheckSwitch
        status={status}
        words={APP_WORDS}
        disabled={saving}
        onCheckedChange={(on) => {
          setSaving(true)
          setAutoFailed(null)
          withUpdates((c) => c.setAuto(on))
            .catch((e: unknown) => setAutoFailed(said(e)))
            .finally(() => setSaving(false))
        }}
      />
      <SaveFailed message={autoFailed} />
    </SettingBlock>
  )
}
