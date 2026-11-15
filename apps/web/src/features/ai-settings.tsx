import { useState } from "react"

import { AdaptiveMenu, AdaptiveMenuRadioGroup, AdaptiveMenuRadioItem, Button, FieldRow, FieldRowAction, RadioGroup, RadioRow, TextField } from "@unicron/ui"
import { useAiModels, useAiSettings, useCore, useSetAiKey, useSetAiPrefs } from "@/core/queries"
import type { AiEndpoint, AiPrefs, AiProvider, AiSettings } from "@/core/types"
import { useRowSize } from "@/features/settings/row-size"
import { useSettingSave } from "@/features/settings/save"
import { SaveFailed } from "@/features/settings/save-failed"
import { SettingBlock } from "@/features/settings/setting-block"
import { useConfirm } from "@/lib/confirm"

/** What each choice means (brief T7). `remote`: on a gateway, where "this computer" is the server. */
function choices(remote: boolean): { value: AiProvider; label: string; hint: string }[] {
  return [
    { value: "off", label: "Off", hint: "Vale never sends your mail to a model." },
    { value: "local", label: remote ? "On your own server" : "On this computer", hint: "Ollama, LM Studio or similar. Mail stays on your machines." },
    { value: "anthropic", label: "Claude, with your API key", hint: "What you ask about goes to Anthropic." },
    { value: "compatible", label: "Another service, with your API key", hint: "What you ask about goes there." },
  ]
}

type Hosted = "anthropic" | "compatible"

/**
 * Settings › AI summaries and replies (brief T7; ADR-0059, ADR-0111). The
 * caption first; MODEL RUNS as four RadioRows; then, by the choice, the
 * server's address, the model (a menu of what the server lists, or a field
 * when it lists none), the API key (write-only), and the connection's state.
 * Every change saves at once and silently.
 */
export function AiSettingsForm() {
  const { data: settings } = useAiSettings()
  const { data: core } = useCore()
  const set = useSetAiPrefs()
  const save = useSettingSave()
  if (!settings) return null
  const prefs = settings.prefs
  const remote = !!core?.remote
  const change = (row: string, p: Partial<AiPrefs>) => save.run(row, set.mutateAsync({ ...prefs, ...p }))
  const provider = prefs.provider

  return (
    <div className="flex flex-col gap-8">
      <p className="type-caption text-text-secondary">Off unless you turn it on. A conversation goes to the model only when you ask for its summary or replies.</p>

      <SettingBlock title="Model runs">
        <RadioGroup aria-label="Model runs" value={provider} onValueChange={(v) => change("provider", { provider: v as AiProvider })}>
          {choices(remote).map((o, i) => (
            <RadioRow key={o.value} value={o.value} label={o.label} description={o.hint} rule={i === 0 ? "none" : "top"} />
          ))}
        </RadioGroup>
        <SaveFailed message={save.failed("provider")} />
      </SettingBlock>

      {provider !== "off" && <ModelBlock key={provider} provider={provider} settings={settings} remote={remote} change={change} failed={save.failed} />}
    </div>
  )
}

/** The rows under the choice: the address, the model, the key and the connection. */
function ModelBlock({ provider, settings, remote, change, failed }: { provider: Exclude<AiProvider, "off">; settings: AiSettings; remote: boolean; change: (row: string, p: Partial<AiPrefs>) => void; failed: (row: string) => string | null }) {
  const p = settings.prefs
  const size = useRowSize()
  const hosted = provider !== "local"
  const endpoint: AiEndpoint | null = provider === "local" ? p.local : provider === "compatible" ? p.compatible : null
  const setEndpoint = (e: Partial<AiEndpoint>) => change(provider === "local" ? "local" : "compatible", provider === "local" ? { local: { ...p.local, ...e } } : { compatible: { ...p.compatible, ...e } })
  const model = provider === "anthropic" ? p.anthropicModel : endpoint!.model
  const pick = (m: string) => (provider === "anthropic" ? change("model", { anthropicModel: m }) : setEndpoint({ model: m }))
  // The server's list of models is also the connection check: an answer means the address (and key) are right.
  const models = useAiModels(provider, true, endpoint?.url)
  const listed = models.isSuccess && models.data.length > 0

  return (
    <SettingBlock title={provider === "local" ? "Model server" : provider === "anthropic" ? "Claude" : "Service"}>
      {(endpoint || !listed) && (
      <div className="flex flex-col gap-6 pt-4 pb-2">
        {endpoint && (
          <AddressField
            key={endpoint.url}
            label={provider === "local" ? "Server address" : "Service address"}
            value={endpoint.url}
            helper={
              provider === "local"
                ? `Ollama is at http://localhost:11434/v1 and LM Studio at http://localhost:1234/v1${remote ? ", as the gateway sees them" : ""}. Plain http works only on your own network.`
                : "Its OpenAI-style API, ending in /v1 for most services."
            }
            failed={failed(provider === "local" ? "local" : "compatible")}
            onSave={(url) => setEndpoint({ url })}
          />
        )}
        {!listed && (
          <ModelField
            key={model}
            value={model}
            helper={models.isSuccess ? (provider === "local" ? "No models on this server yet. With Ollama, run “ollama pull llama3.2”." : "This service lists no models that can chat. Its name exactly as the service knows it.") : "Its name exactly as the server knows it."}
            onSave={pick}
          />
        )}
      </div>
      )}
      {listed && (
        <FieldRow
          size={size}
          label="Model"
          action={
            <AdaptiveMenu title="Model" trigger={<FieldRowAction>Change</FieldRowAction>}>
              <AdaptiveMenuRadioGroup value={model} onValueChange={pick}>
                {/* A saved model the server no longer lists still shows, so nothing changes behind your back. */}
                {(model && !models.data.includes(model) ? [model, ...models.data] : models.data).map((m) => (
                  <AdaptiveMenuRadioItem key={m} value={m}>
                    {m}
                  </AdaptiveMenuRadioItem>
                ))}
              </AdaptiveMenuRadioGroup>
            </AdaptiveMenu>
          }
        >
          {model || "None chosen"}
        </FieldRow>
      )}
      <SaveFailed message={failed("model")} />
      {hosted && <KeyRow provider={provider} saved={settings.keys[provider]} remote={remote} />}
      <FieldRow
        size={size}
        label="Connection"
        description={models.isError ? <span className="text-critical-text">{models.error.message}</span> : undefined}
        action={models.isError ? <FieldRowAction onClick={() => void models.refetch()}>Try again</FieldRowAction> : undefined}
      >
        <span role="status">{models.isPending || models.isRefetching ? "Checking the connection…" : models.isError ? "Not connected" : "Connected."}</span>
      </FieldRow>
      <p className="type-caption pt-4 text-text-secondary">
        What's sent: the text of the one conversation you ask about, newest messages first. Never attachments, images or other mail, and nothing is sent on its own.
      </p>
    </SettingBlock>
  )
}

/** An address that saves when you leave it; a refused one goes back to the saved address, with the reason under it. */
function AddressField({ label, value, helper, failed, onSave }: { label: string; value: string; helper: string; failed: string | null; onSave: (url: string) => void }) {
  const [text, setText] = useState(value)
  return (
    <TextField
      label={label}
      inputMode="url"
      autoComplete="off"
      spellCheck={false}
      value={text}
      helper={helper}
      error={failed ?? undefined}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => (text.trim() && text.trim() !== value ? onSave(text.trim()) : setText(value))}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
    />
  )
}

/** The model as typed, for a server that lists none (or can't be asked yet). Saves when you leave it. */
function ModelField({ value, helper, onSave }: { value: string; helper: string; onSave: (m: string) => void }) {
  const [text, setText] = useState(value)
  return (
    <TextField
      label="Model"
      autoComplete="off"
      spellCheck={false}
      value={text}
      helper={helper}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => text.trim() !== value && onSave(text.trim())}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
    />
  )
}

/**
 * API KEY (brief T7): a key goes in once and stays in the keychain (or the
 * gateway's sealed store). Vale never reads it back: with one saved, the row
 * says where it is, with REPLACE and REMOVE; REMOVE asks, since the key can't
 * come back.
 */
function KeyRow({ provider, saved, remote }: { provider: Hosted; saved: boolean; remote: boolean }) {
  const setKey = useSetAiKey()
  const size = useRowSize()
  const confirm = useConfirm()
  const [replacing, setReplacing] = useState(false)
  const [text, setText] = useState("")
  const [error, setError] = useState<string | null>(null)
  const where = remote ? "the gateway's sealed store" : "your system keychain"
  const submit = () => {
    setError(null)
    setKey.mutate(
      { provider, key: text.trim() },
      {
        onSuccess: () => {
          setText("")
          setReplacing(false)
        },
        onError: (e) => setError(e.message),
      },
    )
  }
  const remove = () =>
    void confirm.ask({
      title: "Remove the API key?",
      description: `Vale can't ask ${provider === "anthropic" ? "Claude" : "the service"} until you add a key again.`,
      confirmLabel: "Remove",
      run: () => setKey.mutateAsync({ provider, key: null }),
    })

  if (saved && !replacing) {
    return (
      <>
        <FieldRow
          size={size}
          label="API key"
          action={
            <>
              <FieldRowAction onClick={() => setReplacing(true)}>Replace</FieldRowAction>
              <FieldRowAction variant="ghost-destructive" onClick={remove}>
                Remove
              </FieldRowAction>
            </>
          }
        >
          {`Saved in ${where}`}
        </FieldRow>
        {confirm.question()}
      </>
    )
  }
  return (
    <form
      aria-label="API key"
      className="flex flex-col gap-3 pt-4 pb-6"
      onSubmit={(e) => {
        e.preventDefault()
        if (text.trim()) submit()
      }}
    >
      <TextField
        label="API key"
        type="password"
        autoComplete="off"
        spellCheck={false}
        placeholder={provider === "anthropic" ? "sk-ant-…" : "sk-…"}
        value={text}
        onChange={(e) => setText(e.target.value)}
        autoFocus={replacing}
        error={error ?? undefined}
        helper={`${provider === "anthropic" ? "Make one in the Claude Console, under API keys. " : ""}Kept in ${where}, never in Vale's database, and never shown again.`}
      />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={!text.trim()} loading={setKey.isPending}>
          Save
        </Button>
        {replacing && (
          <Button type="button" variant="ghost" onClick={() => setReplacing(false)}>
            Keep the saved key
          </Button>
        )}
      </div>
    </form>
  )
}
