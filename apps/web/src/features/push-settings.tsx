import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"

import { Badge, Banner, Button, ListRow, RadioGroup, RadioRow, TextField, toast, type BadgeTone } from "@unicron/ui"
import { getCoreClient } from "@/core/client"
import type { PushAccount, PushMode, PushSettings, PushSettingsInput } from "@/core/types"
import { useSettingSave } from "@/features/settings/save"
import { SaveFailed } from "@/features/settings/save-failed"
import { SettingBlock } from "@/features/settings/setting-block"

const GUIDE = "https://github.com/snds/Vale/blob/main/tools/push-relay/README.md"

const CHOICES: { mode: PushMode; label: string; hint: string }[] = [
  { mode: "periodic", label: "On the phone's schedule", hint: "No server. Usually every 15 minutes to a few hours." },
  { mode: "relay", label: "Instant, through your relay", hint: "A small server you run. It holds your app passwords." },
]

const said = (e: unknown) => (e instanceof Error ? e.message : String(e))
const KEY = ["push-settings"]

/**
 * Settings › Notifications (brief T8; ADR-0015, ADR-0110): how new mail
 * reaches this device while Vale is closed. Two choices: the phone's own
 * checks, which save at once, or a self-hosted relay, which saves with
 * CONNECT TO RELAY (then SAVE). With the relay: the accounts it watches, and
 * SEND A TEST.
 */
export function PushSettingsSection() {
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: KEY, queryFn: async () => (await getCoreClient()).getPushSettings() })
  // The relay chosen and not yet connected: its form shows; nothing is saved until CONNECT TO RELAY.
  const [picked, setPicked] = useState<PushMode | null>(null)
  const save = useSettingSave()
  const store = async (input: PushSettingsInput) => {
    const s = await (await getCoreClient()).setPushSettings(input)
    qc.setQueryData(KEY, s)
    return s
  }
  const test = useMutation({
    mutationFn: async () => (await getCoreClient()).sendTestPush(),
    onSuccess: () => toast.success("Test sent", { description: "It should arrive in a few seconds" }),
    onError: (e) => toast.error(said(e)),
  })

  if (!data) return null
  const chosen = picked ?? data.mode
  const connected = data.mode === "relay"
  const choose = (mode: PushMode) => {
    if (mode === "relay") return setPicked(connected ? null : "relay")
    setPicked(null)
    // The phone's own schedule needs no server: it saves at once.
    if (connected) save.run("mode", store({ mode: "periodic" }))
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col">
        <RadioGroup aria-label="How new mail reaches this phone" value={chosen} onValueChange={(v) => choose(v as PushMode)}>
          {CHOICES.map((c, i) => (
            <RadioRow key={c.mode} value={c.mode} label={c.label} description={c.hint} rule={i === 0 ? "none" : "top"} />
          ))}
        </RadioGroup>
        <SaveFailed message={save.failed("mode")} />
      </div>

      {chosen === "relay" && <RelayForm data={data} onSave={(input) => store({ mode: "relay", ...input }).then(() => setPicked(null))} />}

      {connected && chosen === "relay" && (
        <SettingBlock title="Accounts on the relay" count={data.accounts.length}>
          {data.error && <Banner size="compact" tone="critical" body={`The relay didn't answer: ${data.error}`} />}
          <ul aria-label="Accounts on the relay" className="flex flex-col">
            {data.accounts.map((a) => (
              <li key={a.accountId}>
                <RelayAccount account={a} />
              </li>
            ))}
          </ul>
          <div className="flex pt-4">
            <Button variant="secondary" loading={test.isPending} onClick={() => test.mutate()}>
              Send a test
            </Button>
          </div>
        </SettingBlock>
      )}
    </div>
  )
}

/** The relay's address, token and, where the phone has no push service, its UnifiedPush address. */
function RelayForm({ data, onSave }: { data: PushSettings; onSave: (v: { relayUrl: string; relayToken: string | null; unifiedPushEndpoint: string | null }) => Promise<unknown> }) {
  const [url, setUrl] = useState(data.relayUrl ?? "")
  const [token, setToken] = useState("")
  const [endpoint, setEndpoint] = useState(data.unifiedPushEndpoint ?? "")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const saved = data.mode === "relay"
  return (
    <SettingBlock title="Relay">
      <form
        aria-label="Relay"
        className="flex flex-col gap-4 pt-4"
        onSubmit={async (e) => {
          e.preventDefault()
          setSaving(true)
          setError(null)
          try {
            await onSave({ relayUrl: url.trim(), relayToken: token.trim() || null, unifiedPushEndpoint: endpoint.trim() || null })
            setToken("")
          } catch (err) {
            setError(said(err))
          } finally {
            setSaving(false)
          }
        }}
      >
        <TextField
          label="Relay address"
          type="url"
          inputMode="url"
          autoCapitalize="none"
          required
          placeholder="https://relay.example.com"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          helper={
            <>
              Behind https, on a home server or a small VPS.{" "}
              <a href={GUIDE} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                Set-up guide
              </a>
            </>
          }
        />
        <TextField
          label="Relay token"
          type="password"
          autoComplete="off"
          required={!saved}
          value={token}
          onChange={(e) => setToken(e.target.value)}
          helper={saved ? "Saved. Leave empty to keep it." : "The RELAY_TOKEN you set on the relay. Kept in this device's keychain."}
        />
        {!data.platformPush && (
          <TextField
            label="UnifiedPush address"
            type="url"
            inputMode="url"
            autoCapitalize="none"
            placeholder="https://ntfy.sh/your-private-topic"
            value={endpoint}
            onChange={(e) => setEndpoint(e.target.value)}
            helper="This device has no push service of its own. Android without Google can use ntfy or another UnifiedPush app."
          />
        )}
        {error && <Banner size="compact" tone="critical" body={error} />}
        <div className="flex">
          <Button type="submit" loading={saving} disabled={!url.trim()}>
            {saved ? "Save" : "Connect to relay"}
          </Button>
        </div>
      </form>
    </SettingBlock>
  )
}

/** One watched account and its tag: INSTANT, WAITING or NEEDS ATTENTION; the phone's schedule where the relay can't watch it. */
function RelayAccount({ account: a }: { account: PushAccount }) {
  const s = a.status
  const [tag, tone]: [string, BadgeTone] = a.via === "periodic" ? ["Phone's schedule", "neutral"] : s?.error ? ["Needs attention", "critical"] : s ? ["Instant", "success"] : ["Waiting", "neutral"]
  return <ListRow size="compact" title={a.address} badge={<Badge tone={tone}>{tag}</Badge>} detail={s?.error ?? a.note ?? undefined} />
}
