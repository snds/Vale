import { useState } from "react"

import { FieldRow, FieldRowAction, FieldRowValue, ToggleRow, toast } from "@unicron/ui"
import { FormLayer } from "@/components/editor-frame"
import { getCoreClient } from "@/core/client"
import { useNoteAction, useNotesPrefs, useNotesRelay } from "@/core/queries"
import type { NotesPrefs } from "@/core/types"
import { useRowSize } from "@/features/settings/row-size"
import { useSettingSave } from "@/features/settings/save"
import { SaveFailed } from "@/features/settings/save-failed"
import { SettingBlock } from "@/features/settings/setting-block"
import { useConfirm } from "@/lib/confirm"

import { ImportForm } from "./import-dialog"
import { openNotesForm, useNotesSetupForm } from "./open-sync-setup"
import { EncryptionConsequences, RelayKeyRow, SyncSetupForm } from "./relay-dialog"
import { useTurnOnEncryption } from "./relay-setup"
import { type SyncStatus, useSyncStatus } from "./sync"

/** The relay's state, as the SYNC BETWEEN DEVICES row says it. An error says its own words under the row. */
const SYNC_VALUE: Record<SyncStatus, string> = { off: "Off", connecting: "Connecting…", synced: "Up to date", error: "Not syncing" }

/**
 * Settings › Notes (brief T5; ADR-0111): what was the Notes More menu's
 * set-up, as rows. SYNC: where notes sync, with SET UP or CHANGE opening the
 * set-up form, and END-TO-END ENCRYPTION, which asks first and then shows the
 * KEY. READING: the two preferences, saved at once and silently. MOVING:
 * IMPORT (the import form) and EXPORT (a toast names where it went).
 */
export function NotesSettings() {
  const { data: relay, isPending } = useNotesRelay()
  const { data: prefs } = useNotesPrefs()
  const sync = useSyncStatus()
  const size = useRowSize()
  const form = useNotesSetupForm((s) => s.form)
  const confirm = useConfirm()
  const turnOn = useTurnOnEncryption(confirm)
  const save = useSettingSave()
  const setPrefs = useNoteAction((c, p: NotesPrefs) => c.setNotesPrefs(p))
  const [exporting, setExporting] = useState(false)

  const change = (row: keyof NotesPrefs, value: boolean) => prefs && save.run(row, setPrefs.mutateAsync({ ...prefs, [row]: value }))
  const exportAll = async () => {
    setExporting(true)
    try {
      // Every note as a Markdown file with front matter, as Obsidian reads them (ADR-0034).
      toast(`Saved notes to ${await (await getCoreClient()).exportNotes()}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setExporting(false)
    }
  }
  const sealed = !!relay?.key
  // The relay's error shows even when this device has no relay saved: it is what the banner over Notes sends you here for.
  const syncing = relay || sync.status === "error" ? sync.status : "off"

  return (
    <div className="flex flex-col gap-8">
      <SettingBlock title="Sync">
        <FieldRow
          size={size}
          label="Sync between devices"
          description={syncing === "error" ? <span className="text-critical-text">{sync.error}</span> : relay ? undefined : "Through a relay you run, or one you trust."}
          action={
            <FieldRowAction disabled={isPending} onClick={() => openNotesForm("sync")}>
              {relay ? "Change" : "Set up"}
            </FieldRowAction>
          }
        >
          {SYNC_VALUE[syncing]}
        </FieldRow>
        <FieldRow
          size={size}
          label="End-to-end encryption"
          disabledReason={relay || sealed ? undefined : "Needs sync between devices."}
          action={sealed ? undefined : <FieldRowAction onClick={() => relay && void turnOn(relay)}>Turn on</FieldRowAction>}
        >
          {sealed ? "On" : "Off"}
        </FieldRow>
        {relay?.key && <RelayKeyRow relayKey={relay.key} />}
      </SettingBlock>

      <SettingBlock title="Reading">
        <ToggleRow label="Find text in images" description="Read on this device." checked={prefs?.readImageText ?? true} disabled={!prefs} onCheckedChange={(on) => change("readImageText", on)} />
        <SaveFailed message={save.failed("readImageText")} />
        <ToggleRow label="Move checked items down" checked={prefs?.sortChecked ?? true} disabled={!prefs} onCheckedChange={(on) => change("sortChecked", on)} />
        <SaveFailed message={save.failed("sortChecked")} />
      </SettingBlock>

      <SettingBlock title="Moving">
        <FieldRow size={size} label="Import" action={<FieldRowAction onClick={() => openNotesForm("import")}>Import</FieldRowAction>}>
          {/* A list of names: it wraps between words on a phone rather than being cut in the middle. */}
          <FieldRowValue truncate="wrap">Apple Notes, Google Keep, Markdown</FieldRowValue>
        </FieldRow>
        <FieldRow size={size} label="Export" action={<FieldRowAction loading={exporting} onClick={() => void exportAll()}>Export</FieldRowAction>}>
          <FieldRowValue truncate="wrap">All notes as Markdown</FieldRowValue>
        </FieldRow>
      </SettingBlock>

      <FormLayer open={form === "sync"} onClose={() => openNotesForm(null)}>
        {form === "sync" && <SyncSetupForm onDone={() => openNotesForm(null)} />}
      </FormLayer>
      <FormLayer open={form === "import"} onClose={() => openNotesForm(null)}>
        {form === "import" && <ImportForm onDone={() => openNotesForm(null)} />}
      </FormLayer>
      {confirm.question(<EncryptionConsequences />)}
    </div>
  )
}
