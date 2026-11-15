import { useState } from "react"

import { Button, ConfirmDialogConsequence, ConfirmDialogConsequences, SecretField, TextField, type SecretFieldHost, type SecretFieldReferenceHost } from "@unicron/ui"
import { FormLayerForm } from "@/components/editor-frame"
import { getCoreClient, isTauri } from "@/core/client"
import { useCore, useNotesRelay } from "@/core/queries"
import type { RelayConfig } from "@/core/types"
import { useLeaveGuard } from "@/lib/leave-guard"

import { useSaveRelay } from "./relay-setup"
import { isKey } from "./sealed"
import { relayUrlProblem, useSyncStatus } from "./sync"

const said = (e: unknown) => (e instanceof Error ? e.message : String(e))

/**
 * Set up sync (brief T5; ADR-0111), in the form layer: RELAY ADDRESS ·
 * ACCESS TOKEN · ENCRYPTION KEY, the last only when the relay is encrypted
 * (this device has its key, or the relay said it needs one). The primary
 * TURN ON SYNC, or SAVE once it is on, with TURN OFF SYNC beside it. A save
 * is silent; one that fails stays in the form with the server's words.
 */
export function SyncSetupForm({ onDone }: { onDone: () => void }) {
  const { data: relay } = useNotesRelay()
  const { data: core } = useCore()
  const status = useSyncStatus()
  const saveRelay = useSaveRelay()
  const [url, setUrl] = useState(relay?.url ?? "")
  const [token, setToken] = useState(relay?.token ?? "")
  const [key, setKey] = useState("")
  const [tried, setTried] = useState(false)
  const [saving, setSaving] = useState<"save" | "off" | null>(null)
  const [error, setError] = useState<string | null>(null)
  useLeaveGuard(() => url !== (relay?.url ?? "") || token !== (relay?.token ?? "") || key !== "")

  const problem = url.trim() ? relayUrlProblem(url.trim()) : "Enter the relay’s address"
  const keyProblem = key.trim() && !isKey(key) ? "That isn't a whole key. Copy it again from a device that has it." : null
  // The relay said it's sealed and this device has no key: that's the field to fill.
  const needsKey = !relay?.key && status.status === "error" && !!status.error?.includes("end-to-end")
  const sealed = !!relay?.key || needsKey

  const run = async (kind: "save" | "off", value: RelayConfig | null) => {
    setSaving(kind)
    setError(null)
    try {
      await saveRelay(value)
      onDone()
    } catch (e) {
      setError(said(e))
    } finally {
      setSaving(null)
    }
  }

  return (
    <FormLayerForm
      overline="Notes"
      title="Sync between devices"
      primary={{ label: relay ? "Save" : "Turn on sync", icon: "checkmark", loading: saving === "save" }}
      error={error}
      footerStart={
        relay && (
          <Button type="button" variant="ghost" loading={saving === "off"} onClick={() => void run("off", null)}>
            Turn off sync
          </Button>
        )
      }
      onSubmit={() => {
        setTried(true)
        // An empty key field keeps the key this device has: emptying it never turns encryption off.
        if (!problem && !keyProblem) void run("save", { url: url.trim(), token: token.trim(), key: key.trim() || relay?.key || null })
      }}
    >
      <TextField
        label="Relay address"
        inputMode="url"
        autoComplete="off"
        spellCheck={false}
        placeholder="wss://notes.example.com"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        helper="Any Hocuspocus server works."
        error={tried && problem ? problem : undefined}
        data-form-focus=""
      />
      <TextField label="Access token" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} helper={core?.remote ? "Sealed on your gateway." : "Kept in your system keychain."} />
      {sealed && (
        <SecretField
          mode="edit"
          id="relay-key"
          label="Encryption key"
          value={key}
          onChange={setKey}
          error={keyProblem ?? (needsKey ? "This relay is end-to-end encrypted. Paste the key from a device that syncs with it." : undefined)}
          description={relay?.key ? "Paste it from a device that already syncs. Left empty, this device keeps its key." : "Paste it from a device that already syncs."}
        />
      )}
    </FormLayerForm>
  )
}

/**
 * The key's clipboard (unicron SecretField): copied as text, cleared when the
 * timer ends. The page can't read the clipboard back without asking, so the
 * clear runs even if something else was copied since; the field says so.
 */
const webClipboard: SecretFieldHost = {
  copy: (bytes) => navigator.clipboard.writeText(new TextDecoder().decode(bytes)),
  clear: () => navigator.clipboard.writeText(""),
}

/**
 * On the desktop and phone the core copies the key itself (ADR-0070). It can
 * read the clipboard back, so the clear leaves anything copied since.
 */
const coreClipboard: SecretFieldReferenceHost = {
  copyRef: async () => (await getCoreClient()).copyRelayKey(),
  clipboardHolds: async (hash) => (await getCoreClient()).clipboardHolds(hash),
  clear: async () => void (await getCoreClient()).clearClipboard(),
}

/**
 * The KEY row once notes are end-to-end encrypted (brief T5): hold to show,
 * and Copy, which clears the clipboard after 90 s, long enough to paste it
 * on another device.
 */
export function RelayKeyRow({ relayKey }: { relayKey: string }) {
  return <SecretField label="Key" mono getSecret={async () => new TextEncoder().encode(relayKey)} host={isTauri() ? coreClipboard : webClipboard} revealMode="hold" clipboardTimer={90} description="Each of your devices needs it to sync." />
}

/** The question's three lines (brief T5), passed to `confirm.question()`. */
export function EncryptionConsequences() {
  return (
  <ConfirmDialogConsequences>
    {/* The brief names `key` and `link--off`; unicron's set has neither, so `password` and `unlink` stand in. */}
    <ConfirmDialogConsequence icon="password">You'll get a key. Each of your other devices needs it to keep syncing, so copy it there.</ConfirmDialogConsequence>
    <ConfirmDialogConsequence icon="unlink">Notes and conversations you've shared stop working. Share them again for a link that's encrypted too.</ConfirmDialogConsequence>
    <ConfirmDialogConsequence icon="trash-can">The relay deletes the readable copies it has. It can't go back to readable sync.</ConfirmDialogConsequence>
  </ConfirmDialogConsequences>
  )
}
