import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"

import { type IconName, Button, Field, FieldDescription, FieldGroup, FieldLabel, FieldRow, FieldRowAction, Input, NativeSelect, NativeSelectOption, NavItem, SectionHeader, Skeleton, toast, useAppFrame } from "@unicron/ui"
import { usePushedScreen } from "@/app/places"
import { gatewayMe, getCoreClient, isMember, signOutOfGateway } from "@/core/client"
import { useAccounts, useCore } from "@/core/queries"
import type { Account, AccountConfig, DavConfig, JmapConfig, OAuthIssuer, Provider, Security, ServerConfig } from "@/core/types"
import { useConfirm } from "@/lib/confirm"

import { OAuthSignIn } from "./oauth-sign-in"
import { AccountScreenHead } from "./settings/account-screen-head"
import { setAccountStep, useAccountStep } from "./settings/account-step"
import { SaveFailed } from "./settings/save-failed"

interface Preset {
  id: string
  label: string
  icon: IconName
  provider: Provider
  /** Why it can't be added yet. Shown instead of hiding the option. */
  unavailable?: string
  /** Signs in on the provider's page in the browser instead of a form. */
  oauth?: OAuthIssuer
  imap?: ServerConfig
  smtp?: ServerConfig
  /** JMAP accounts sync and send over HTTPS; no IMAP/SMTP needed. */
  jmap?: JmapConfig
  /** Which server fields the form asks for. */
  custom?: "imap" | "jmap"
  passwordLabel: string
  passwordHelp?: { text: string; href: string }
  /** Calendars and contacts. `ask` lets people enter their own servers. */
  dav?: DavConfig | "ask"
  /** Help for a separate calendar app password (`dav.separateSecret`). */
  davPasswordHelp?: { text: string; href: string }
}

// In the order first run lists them (brief X8).
const PRESETS: Preset[] = [
  { id: "google", label: "Gmail", icon: "email", provider: "google", passwordLabel: "", oauth: "google" },
  { id: "microsoft", label: "Outlook / Microsoft 365", icon: "email", provider: "microsoft", passwordLabel: "", oauth: "microsoft" },
  {
    id: "icloud", label: "iCloud", icon: "cloud", provider: "i_cloud",
    imap: { host: "imap.mail.me.com", port: 993, security: "tls" },
    smtp: { host: "smtp.mail.me.com", port: 587, security: "start_tls" },
    passwordLabel: "App-specific password",
    passwordHelp: { text: "Create one at account.apple.com → Sign-In and Security.", href: "https://support.apple.com/102654" },
    // The same app-specific password covers iCloud Calendar and Contacts.
    dav: { calendarUrl: "https://caldav.icloud.com/", contactsUrl: "https://contacts.icloud.com/" },
  },
  {
    id: "fastmail", label: "Fastmail", icon: "flash", provider: "jmap",
    // Fastmail is the JMAP reference server: faster sync, no IMAP/SMTP.
    jmap: { sessionUrl: "https://api.fastmail.com/jmap/session", bearer: true },
    passwordLabel: "API token",
    passwordHelp: { text: "In Fastmail: Settings → Privacy & Security → Connected apps & API tokens. Choose JMAP and allow Email and Email submission. (Not available on Basic plans.)", href: "https://www.fastmail.help/hc/en-us/articles/5254602856719" },
    // API tokens can't do CalDAV, so calendars need a separate app password.
    dav: { calendarUrl: "https://caldav.fastmail.com/", contactsUrl: "https://carddav.fastmail.com/", separateSecret: true },
    davPasswordHelp: { text: "Optional. In Fastmail: Settings → Privacy & Security → App passwords, with access to calendars and contacts.", href: "https://www.fastmail.help/hc/en-us/articles/1500000278342" },
  },
  {
    id: "other", label: "Other (IMAP)", icon: "bare-metal-server", provider: "generic", custom: "imap",
    imap: { host: "", port: 993, security: "tls" },
    smtp: { host: "", port: 465, security: "tls" },
    passwordLabel: "Password",
    dav: "ask",
  },
  {
    id: "jmap", label: "Other (JMAP)", icon: "api", provider: "jmap", custom: "jmap",
    jmap: { sessionUrl: "", bearer: false },
    passwordLabel: "Password",
    dav: "ask",
  },
]

/** The provider's name on an account's row (brief T1). */
function providerName(a: Account): string {
  switch (a.provider) {
    case "google":
      return "Gmail"
    case "microsoft":
      return "Outlook"
    case "i_cloud":
      return "iCloud"
    case "jmap":
      return isFastmail(a.jmap?.sessionUrl) ? "Fastmail" : "JMAP"
    case "local":
      return "This device"
    default:
      return "IMAP"
  }
}

function isFastmail(url: string | undefined) {
  try {
    const host = new URL(url ?? "").hostname
    return host === "fastmail.com" || host.endsWith(".fastmail.com")
  } catch {
    return false
  }
}

/** An OAuth account whose sync failed signs in again in the browser (ADR-0046): its row offers SIGN IN. */
const needsSignIn = (a: Account) => !!a.oauth && !!a.lastError

/** What is wrong or under way, after the provider's name: "Gmail // sign-in needed". Nothing when all is well. */
function accountState(a: Account): string | null {
  if (needsSignIn(a)) return "sign-in needed"
  if (a.lastError) return "not syncing"
  if (a.lastSync === null) return "first sync"
  return null
}

/** "Synced Thu 09:16": the day and the clock, as the frames write a time; the date once it is a week old. */
function synced(secs: number, now = new Date()) {
  const at = new Date(secs * 1000)
  if (now.getTime() - at.getTime() > 6 * 86_400_000) return `Synced ${at.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
  const day = at.toLocaleDateString(undefined, { weekday: "short" })
  return `Synced ${day} ${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`
}

/** Signs an OAuth account in again, in the browser; SIGN IN shows its loading state meanwhile. */
function useSignInAgain() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => (await getCoreClient()).reauthOAuthAccount(id),
    onSuccess: (a) => {
      void qc.invalidateQueries()
      toast.success(`Signed in to ${a.address}`)
    },
  })
}

/**
 * Settings → Accounts (brief T1; ADR-0104). The accounts, one Field Row
 * each, as Mobile / 16 and Desktop / 12 draw them; the providers to add one
 * with; and, on a gateway, signing out of it. Managing an account, adding
 * one and connecting its calendars are screens pushed in this column. A team
 * member sees whose accounts these are, and Sign out.
 */
export function AccountsSection() {
  const step = useAccountStep((s) => s.step)
  const { data: accounts = [], isPending } = useAccounts()
  // A pushed screen is a history entry where the section is pushed itself (ADR-0084): Back closes it first.
  usePushedScreen(step.kind !== "list", () => setAccountStep({ kind: "list" }))
  if (isMember()) return <MemberBlock />
  if (isPending) return <SkeletonRows />
  const back = () => setAccountStep({ kind: "list" })
  if (step.kind === "add") {
    const preset = PRESETS.find((p) => p.id === step.preset)
    if (preset?.oauth) return <OAuthSignIn issuer={preset.oauth} onBack={back} onDone={back} />
    if (preset) return <AddAccountForm preset={preset} onBack={back} onDone={back} />
  }
  const account = step.kind === "manage" || step.kind === "connect" ? accounts.find((a) => a.id === step.id) : undefined
  if (step.kind === "connect" && account) return <ConnectDavForm account={account} onBack={() => setAccountStep({ kind: "manage", id: account.id })} />
  if (step.kind === "manage" && account) return <ManageAccount account={account} onBack={back} />
  return <AccountList />
}

/** Loading a section: three skeleton rows (brief T0). */
function SkeletonRows() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-label="Loading accounts">
      <Skeleton variant="row" />
      <Skeleton variant="row" />
      <Skeleton variant="row" />
    </div>
  )
}

/** Where mail and passwords are kept, by build: one line (brief T1). Kept in full: it is about privacy. */
function StorageLine() {
  const { data: core } = useCore()
  const line =
    core?.kind === "demo"
      ? "You're using the web preview with sample mail. Connecting real accounts needs the desktop app for now."
      : core?.remote
        ? "Mail is kept on your gateway. Passwords are sealed there with its key."
        : "Mail stays on this device. Passwords are kept in your system keychain."
  return <p className="type-body pb-6 text-text-secondary">{line}</p>
}

/**
 * The ACCOUNTS group: one Field Row per account, as drawn. Settings' phone
 * screen shows it above the list of sections too (Mobile / 16), where
 * MANAGE opens the account inside Accounts.
 */
export function AccountRows({ onManage }: { onManage?: (a: Account) => void }) {
  const { data: accounts = [] } = useAccounts()
  const phone = useAppFrame().phone
  const signIn = useSignInAgain()
  if (!accounts.length) return null
  return (
    <section aria-label="Accounts">
      <SectionHeader title="Accounts" count={accounts.length} level={3} />
      {accounts.map((a) => {
        const state = accountState(a)
        const failed = signIn.isError && signIn.variables === a.id ? signIn.error.message : null
        return (
          <div key={a.id}>
            <FieldRow
              size={phone ? "stacked" : "default"}
              label={a.displayName}
              // The address, then when it last synced, or what went wrong (the value already says "first sync").
              description={
                <>
                  {a.address}
                  {a.lastError ? (
                    <>
                      {" · "}
                      <span className="text-critical-text">{a.lastError}</span>
                    </>
                  ) : (
                    a.lastSync !== null && ` · ${synced(a.lastSync)}`
                  )}
                </>
              }
              action={
                needsSignIn(a) ? (
                  <FieldRowAction loading={signIn.isPending && signIn.variables === a.id} onClick={() => signIn.mutate(a.id)}>
                    Sign in
                  </FieldRowAction>
                ) : (
                  <FieldRowAction onClick={() => (onManage ?? manage)(a)}>Manage</FieldRowAction>
                )
              }
            >
              {state ? `${providerName(a)} // ${state}` : providerName(a)}
            </FieldRow>
            <SaveFailed message={failed} />
          </div>
        )
      })}
    </section>
  )
}

const manage = (a: Account) => setAccountStep({ kind: "manage", id: a.id })

function AccountList() {
  const { data: core } = useCore()
  const owner = !!core?.remote && !isMember()
  const focusAdd = useAccountStep((s) => s.focusAdd)
  const add = useRef<HTMLElement>(null)
  // "Add an account…" from elsewhere (startAddAccount): the providers, with the first one focused.
  useEffect(() => {
    if (!focusAdd) return
    useAccountStep.setState({ focusAdd: false })
    add.current?.scrollIntoView({ block: "start" })
    add.current?.querySelector<HTMLElement>("a, button")?.focus({ preventScroll: true })
  }, [focusAdd])

  return (
    <div className="flex flex-col gap-8">
      <div>
        <StorageLine />
        <AccountRows />
      </div>

      <section ref={add} aria-label="Add an account">
        <SectionHeader title="Add an account" level={3} />
        <ul role="list" className="flex flex-col gap-1 pt-2">
          {PRESETS.map((preset) => {
            const unavailable = core?.remote && preset.oauth && !SAME_COMPUTER ? OAUTH_REMOTE : core?.kind === "demo" && !preset.oauth ? DEMO_ONLY : preset.unavailable
            return (
              <li key={preset.id}>
                <NavItem label={preset.label} icon={preset.icon} disabled={!!unavailable} description={unavailable} onClick={() => setAccountStep({ kind: "add", preset: preset.id })} />
              </li>
            )
          })}
        </ul>
      </section>

      {/* Signing out of the gateway, for its owner, last (brief T1; it was a button under the section list). */}
      {owner && (
        <section aria-label="Gateway">
          <SectionHeader title="Gateway" level={3} />
          <FieldRow label="Signed in" action={<FieldRowAction onClick={() => void signOutOfGateway().then(() => location.reload())}>Sign out</FieldRowAction>}>
            This gateway
          </FieldRow>
        </section>
      )}
    </div>
  )
}

/** One account, pushed in the column (brief T1): its facts, its calendars, and removing it. */
function ManageAccount({ account: a, onBack }: { account: Account; onBack: () => void }) {
  const phone = useAppFrame().phone
  const size = phone ? "stacked" : "default"
  const qc = useQueryClient()
  const signIn = useSignInAgain()
  const confirm = useConfirm()
  const remove = async () => {
    const yes = await confirm.ask({
      overline: `${a.displayName} // Account`,
      title: `Remove ${a.address}?`,
      description: "Mail on the server is not affected.",
      confirmLabel: "Remove",
      run: async () => (await getCoreClient()).removeAccount(a.id),
    })
    if (!yes) return
    onBack()
    void qc.invalidateQueries()
    toast.success(`Removed ${a.address}`)
  }
  return (
    <div className="flex flex-col">
      <AccountScreenHead title={a.displayName} onBack={onBack} />
      <FieldRow size={size} label="Address">
        {a.address}
      </FieldRow>
      <FieldRow size={size} label="Provider">
        {providerName(a)}
      </FieldRow>
      <FieldRow
        size={size}
        label="Mail"
        description={a.lastError ? <span className="text-critical-text">{a.lastError}</span> : undefined}
        action={
          needsSignIn(a) ? (
            <FieldRowAction loading={signIn.isPending} onClick={() => signIn.mutate(a.id)}>
              Sign in
            </FieldRowAction>
          ) : undefined
        }
      >
        {a.lastError ? "Not syncing" : a.lastSync !== null ? synced(a.lastSync) : "First sync"}
      </FieldRow>
      <SaveFailed message={signIn.isError ? signIn.error.message : null} />
      <FieldRow
        size={size}
        label="Calendars and contacts"
        rule="both"
        description={a.dav ? (a.davError ? <span className="text-critical-text">{a.davError}</span> : a.davLastSync !== null ? synced(a.davLastSync) : "Connecting") : undefined}
        action={a.dav ? undefined : <FieldRowAction onClick={() => setAccountStep({ kind: "connect", id: a.id })}>Connect</FieldRowAction>}
      >
        {a.dav ? (a.davError ? "Not syncing" : "Connected") : "Not connected"}
      </FieldRow>
      <div className="pt-8">
        <Button variant="ghost-destructive" onClick={() => void remove()}>
          Remove account
        </Button>
      </div>
      {confirm.question()}
    </div>
  )
}

/** A team member's Accounts (ADR-0063; brief T1): the accounts are the owner's. */
function MemberBlock() {
  const me = gatewayMe()
  return (
    <div className="flex flex-col items-start gap-6">
      <p className="type-body text-text-body">{`You're signed in as ${me?.name} on a shared inbox. Its accounts belong to the owner.`}</p>
      <Button variant="secondary" onClick={() => void signOutOfGateway().then(() => location.reload())}>
        Sign out
      </Button>
    </div>
  )
}

const DEMO_ONLY = "Needs the desktop app"

/**
 * Provider sign-in returns to a page on the computer running the app. Behind
 * a gateway that's the server, so it only works when the browser is there too.
 */
const SAME_COMPUTER = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname)
const OAUTH_REMOTE = "Sign in from the desktop app, or open the gateway on its own computer"

/** JMAP accounts carry no IMAP/SMTP settings. */
const UNUSED: ServerConfig = { host: "", port: 0, security: "tls" }

const SECURITY: { value: Security; label: string }[] = [
  { value: "tls", label: "SSL/TLS" },
  { value: "start_tls", label: "STARTTLS" },
  { value: "plain", label: "None (this computer only)" },
]

function ServerFields({ label, value, onChange, idPrefix }: { label: string; value: ServerConfig; onChange: (v: ServerConfig) => void; idPrefix: string }) {
  return (
    <fieldset className="grid grid-cols-[1fr_6rem] gap-2">
      <legend className="mb-1.5 text-sm font-medium">{label}</legend>
      <Input aria-label={`${label} server`} placeholder="mail.example.com" value={value.host} onChange={(e) => onChange({ ...value, host: e.target.value.trim() })} id={`${idPrefix}-host`} autoCapitalize="none" />
      <Input aria-label={`${label} port`} inputMode="numeric" value={value.port} onChange={(e) => onChange({ ...value, port: Number(e.target.value.replace(/\D/g, "")) || 0 })} />
      <div className="col-span-2 flex flex-col">
        <NativeSelect aria-label={`${label} security`} value={value.security} onChange={(e) => onChange({ ...value, security: e.target.value as Security })}>
          {SECURITY.map((s) => (
            <NativeSelectOption key={s.value} value={s.value}>
              {s.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
    </fieldset>
  )
}

function AddAccountForm({ preset, onBack, onDone }: { preset: Preset; onBack: () => void; onDone: () => void }) {
  const [address, setAddress] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [password, setPassword] = useState("")
  const [username, setUsername] = useState("")
  const [imap, setImap] = useState(preset.imap ?? UNUSED)
  const [smtp, setSmtp] = useState(preset.smtp ?? UNUSED)
  const [sessionUrl, setSessionUrl] = useState(preset.jmap?.sessionUrl ?? "")
  const [davPassword, setDavPassword] = useState("")
  const [calendarUrl, setCalendarUrl] = useState("")
  const [contactsUrl, setContactsUrl] = useState("")
  const custom = preset.custom
  const qc = useQueryClient()

  const add = useMutation({
    mutationFn: async () => {
      const config: AccountConfig = {
        displayName: displayName.trim() || address.split("@")[0]!,
        address: address.trim(),
        username: (username || address).trim(),
        provider: preset.provider,
        imap,
        smtp,
        jmap: preset.jmap ? { sessionUrl: sessionUrl.trim(), bearer: preset.jmap.bearer } : null,
        dav: davFor(preset, calendarUrl, contactsUrl, davPassword),
      }
      return (await getCoreClient()).addAccount(config, password, davPassword || null)
    },
    onSuccess: (a) => {
      void qc.invalidateQueries()
      toast.success(`Added ${a.address}`)
      onDone()
    },
  })

  return (
    <form onSubmit={(e) => (e.preventDefault(), add.mutate())} className="flex flex-col gap-4">
      <AccountScreenHead title={`Add // ${preset.label}`} onBack={onBack} />
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="acct-address">Email address</FieldLabel>
          <Input id="acct-address" type="email" required autoComplete="email" value={address} onChange={(e) => setAddress(e.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="acct-name">Name on sent mail</FieldLabel>
          <Input id="acct-name" placeholder="Your name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoComplete="name" />
        </Field>
        {custom === "jmap" && (
          <Field>
            <FieldLabel htmlFor="acct-session">JMAP session URL</FieldLabel>
            <Input id="acct-session" type="url" required placeholder="https://mail.example.com/jmap/session" value={sessionUrl} onChange={(e) => setSessionUrl(e.target.value)} autoCapitalize="none" />
            <FieldDescription>Often https://your-server/.well-known/jmap</FieldDescription>
          </Field>
        )}
        {custom && (
          <Field>
            <FieldLabel htmlFor="acct-user">Username</FieldLabel>
            <Input id="acct-user" placeholder="Usually your email address" value={username} onChange={(e) => setUsername(e.target.value)} autoCapitalize="none" />
          </Field>
        )}
        <Field>
          <FieldLabel htmlFor="acct-password">{preset.passwordLabel}</FieldLabel>
          <Input id="acct-password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          {preset.passwordHelp && (
            <FieldDescription>
              {preset.passwordHelp.text}{" "}
              <a href={preset.passwordHelp.href} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                How
              </a>
            </FieldDescription>
          )}
        </Field>
        {custom === "imap" && (
          <>
            <ServerFields label="Incoming (IMAP)" value={imap} onChange={setImap} idPrefix="imap" />
            <ServerFields label="Outgoing (SMTP)" value={smtp} onChange={setSmtp} idPrefix="smtp" />
          </>
        )}
        {typeof preset.dav === "object" && preset.dav.separateSecret && (
          <Field>
            <FieldLabel htmlFor="acct-dav-password">App password for calendars and contacts</FieldLabel>
            <Input id="acct-dav-password" type="password" value={davPassword} onChange={(e) => setDavPassword(e.target.value)} autoComplete="off" />
            {preset.davPasswordHelp && (
              <FieldDescription>
                {preset.davPasswordHelp.text}{" "}
                <a href={preset.davPasswordHelp.href} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                  How
                </a>
              </FieldDescription>
            )}
          </Field>
        )}
        {preset.dav === "ask" && <DavUrlFields calendarUrl={calendarUrl} setCalendarUrl={setCalendarUrl} contactsUrl={contactsUrl} setContactsUrl={setContactsUrl} />}
        {typeof preset.dav === "object" && !preset.dav.separateSecret && (
          <p className="type-caption text-text-secondary">Calendars and contacts connect with the same password.</p>
        )}
      </FieldGroup>

      <SaveFailed message={add.error?.message ?? null} />
      <div className="flex flex-col items-end gap-2">
        <Button type="submit" loading={add.isPending}>
          Add account
        </Button>
        <p className="type-caption text-text-secondary">Checked before saving.</p>
      </div>
    </form>
  )
}

/** The DAV part of a new account: preset servers, typed ones, or none. */
function davFor(preset: Preset, calendarUrl: string, contactsUrl: string, davPassword: string): DavConfig | null {
  if (preset.dav === "ask") {
    const cal = calendarUrl.trim() || null
    const card = contactsUrl.trim() || null
    return cal || card ? { calendarUrl: cal, contactsUrl: card } : null
  }
  if (!preset.dav) return null
  // A separate-secret preset only connects when that password was given.
  return preset.dav.separateSecret && !davPassword ? null : preset.dav
}

function DavUrlFields({ calendarUrl, setCalendarUrl, contactsUrl, setContactsUrl }: { calendarUrl: string; setCalendarUrl: (v: string) => void; contactsUrl: string; setContactsUrl: (v: string) => void }) {
  return (
    <>
      <Field>
        <FieldLabel htmlFor="acct-caldav">Calendar server (CalDAV)</FieldLabel>
        <Input id="acct-caldav" type="url" placeholder="https://dav.example.com/" value={calendarUrl} onChange={(e) => setCalendarUrl(e.target.value)} autoCapitalize="none" />
        <FieldDescription>Optional. The server address is enough; we find your calendars from there.</FieldDescription>
      </Field>
      <Field>
        <FieldLabel htmlFor="acct-carddav">Contacts server (CardDAV)</FieldLabel>
        <Input id="acct-carddav" type="url" placeholder="https://dav.example.com/" value={contactsUrl} onChange={(e) => setContactsUrl(e.target.value)} autoCapitalize="none" />
      </Field>
    </>
  )
}

/** Adds calendars and contacts to an account that only has mail (brief T1: CONNECT on Manage). */
function ConnectDavForm({ account, onBack }: { account: Account; onBack: () => void }) {
  const preset = PRESETS.find((p) => p.provider === account.provider && typeof p.dav === "object" && (p.jmap ? !!account.jmap : !account.jmap))
  const fixed = preset && typeof preset.dav === "object" ? preset.dav : null
  const [calendarUrl, setCalendarUrl] = useState(fixed?.calendarUrl ?? "")
  const [contactsUrl, setContactsUrl] = useState(fixed?.contactsUrl ?? "")
  // Without a preset, JMAP accounts (API tokens) need their own DAV password.
  const separate = fixed?.separateSecret ?? !!account.jmap
  const [password, setPassword] = useState("")
  const qc = useQueryClient()
  const connect = useMutation({
    mutationFn: async () => {
      const dav: DavConfig = { calendarUrl: calendarUrl.trim() || null, contactsUrl: contactsUrl.trim() || null, separateSecret: separate }
      if (!dav.calendarUrl && !dav.contactsUrl) throw new Error("Enter a calendar or contacts server.")
      return (await getCoreClient()).setAccountDav(account.id, dav, password || null)
    },
    onSuccess: () => {
      void qc.invalidateQueries()
      toast.success(`Connected calendars and contacts for ${account.address}`)
      onBack()
    },
  })
  return (
    <form onSubmit={(e) => (e.preventDefault(), connect.mutate())} className="flex flex-col gap-4">
      <AccountScreenHead title={`Calendars and contacts // ${account.displayName}`} onBack={onBack} />
      <FieldGroup>
        {!fixed && <DavUrlFields calendarUrl={calendarUrl} setCalendarUrl={setCalendarUrl} contactsUrl={contactsUrl} setContactsUrl={setContactsUrl} />}
        <Field>
          <FieldLabel htmlFor="dav-password">{separate ? "App password for calendars and contacts" : "Password"}</FieldLabel>
          <Input id="dav-password" type="password" required={separate} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" />
          <FieldDescription>
            {separate ? (preset?.davPasswordHelp?.text ?? "This server needs its own password for calendars.") : "Leave blank to use the account's saved password."}
          </FieldDescription>
        </Field>
      </FieldGroup>
      <SaveFailed message={connect.error?.message ?? null} />
      <div className="flex justify-end">
        <Button type="submit" loading={connect.isPending}>
          Connect
        </Button>
      </div>
    </form>
  )
}
