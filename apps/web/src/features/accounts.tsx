import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"

import { type IconName, Button, Field, FieldLabel, FieldRow, FieldRowAction, NativeSelect, NativeSelectOption, NavItem, SectionHeader, Skeleton, TextField, toast, useAppFrame } from "@unicron/ui"
import { usePushedScreen } from "@/app/places"
import { gatewayMe, getCoreClient, isDesktopApp, isMember, signOutOfGateway } from "@/core/client"
import { useAccounts, useCore } from "@/core/queries"
import type { Account, AccountConfig, DavConfig, JmapConfig, OAuthIssuer, Provider, Security, ServerConfig } from "@/core/types"
import { useConfirm } from "@/lib/confirm"

import { OAuthSignIn } from "./oauth-sign-in"
import { AccountFormEnd, AccountFormTop, AddPlaceProvider, FormFailed } from "./onboarding/add-form"
import { useAddPlace, type AddPlace } from "./onboarding/add-place"
import { AccountScreenHead } from "./settings/account-screen-head"
import { setAccountStep, useAccountStep } from "./settings/account-step"
import { SaveFailed } from "./settings/save-failed"

interface Preset {
  id: string
  label: string
  /** What step 2's title adds: "Add Gmail", "Add IMAP account". */
  name: string
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
  { id: "google", label: "Gmail", name: "Gmail", icon: "email", provider: "google", passwordLabel: "", oauth: "google" },
  { id: "microsoft", label: "Outlook / Microsoft 365", name: "Outlook", icon: "email", provider: "microsoft", passwordLabel: "", oauth: "microsoft" },
  {
    id: "icloud", label: "iCloud", name: "iCloud", icon: "cloud", provider: "i_cloud",
    imap: { host: "imap.mail.me.com", port: 993, security: "tls" },
    smtp: { host: "smtp.mail.me.com", port: 587, security: "start_tls" },
    passwordLabel: "App-specific password",
    passwordHelp: { text: "Create one at account.apple.com → Sign-In and Security.", href: "https://support.apple.com/102654" },
    // The same app-specific password covers iCloud Calendar and Contacts.
    dav: { calendarUrl: "https://caldav.icloud.com/", contactsUrl: "https://contacts.icloud.com/" },
  },
  {
    id: "fastmail", label: "Fastmail", name: "Fastmail", icon: "flash", provider: "jmap",
    // Fastmail is the JMAP reference server: faster sync, no IMAP/SMTP.
    jmap: { sessionUrl: "https://api.fastmail.com/jmap/session", bearer: true },
    passwordLabel: "API token",
    passwordHelp: { text: "In Fastmail: Settings → Privacy & Security → Connected apps & API tokens. Choose JMAP and allow Email and Email submission. (Not available on Basic plans.)", href: "https://www.fastmail.help/hc/en-us/articles/5254602856719" },
    // API tokens can't do CalDAV, so calendars need a separate app password.
    dav: { calendarUrl: "https://caldav.fastmail.com/", contactsUrl: "https://carddav.fastmail.com/", separateSecret: true },
    davPasswordHelp: { text: "Optional. In Fastmail: Settings → Privacy & Security → App passwords, with access to calendars and contacts.", href: "https://www.fastmail.help/hc/en-us/articles/1500000278342" },
  },
  {
    id: "other", label: "Other (IMAP)", name: "IMAP account", icon: "bare-metal-server", provider: "generic", custom: "imap",
    imap: { host: "", port: 993, security: "tls" },
    smtp: { host: "", port: 465, security: "tls" },
    passwordLabel: "Password",
    dav: "ask",
  },
  {
    id: "jmap", label: "Other (JMAP)", name: "JMAP account", icon: "api", provider: "jmap", custom: "jmap",
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
  // First run's step 2, in this column (brief T1, X8; ADR-0107).
  if (step.kind === "add" && PRESETS.some((p) => p.id === step.preset)) return <AddAccountStep preset={step.preset} where="settings" onBack={back} onAdded={(a) => (toast.success(`Added ${a.address}`), back())} />
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

/** Where mail and passwords are kept, by build: one line (brief T1). Kept in full: it is about privacy. First run's step 1 says it too (brief X8). */
export function StorageLine({ bare = false }: { bare?: boolean }) {
  const { data: core } = useCore()
  const line =
    core?.kind === "demo" && !isDesktopApp()
      ? "You're using the web preview with sample mail. Connecting real accounts needs the desktop app for now."
      : core?.remote
        ? "Mail is kept on your gateway. Passwords are sealed there with its key."
        : "Mail stays on this device. Passwords are kept in your system keychain."
  return <p className={bare ? "type-body text-text-secondary" : "type-body pb-6 text-text-secondary"}>{line}</p>
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
        <div className="pt-2">
          <ProviderList onPick={(preset) => setAccountStep({ kind: "add", preset })} />
        </div>
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
  const { data: core } = useCore()
  const webDemo = core?.kind === "demo" && !isDesktopApp()
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
        {/* The web demo cannot remove an account: the button says why rather than letting it fail (Vale 60, cross-app §14). */}
        <Button variant="ghost-destructive" disabled={webDemo} disabledReason={webDemo ? "Not in the demo" : undefined} onClick={() => void remove()}>
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

/**
 * The six providers, in the order first run lists them (brief X8): step 1's
 * rows and Settings' ADD AN ACCOUNT (brief T1). One this build cannot add is
 * off, with its reason as a visible line, and stays in the tab order (#37).
 */
export function ProviderList({ onPick }: { onPick: (preset: string) => void }) {
  const { data: core } = useCore()
  return (
    <ul role="list" aria-label="Providers" className="flex flex-col gap-1">
      {PRESETS.map((preset) => {
        const unavailable = core?.remote && preset.oauth && !SAME_COMPUTER ? OAUTH_REMOTE : core?.kind === "demo" && !isDesktopApp() && !preset.oauth ? DEMO_ONLY : preset.unavailable
        return (
          <li key={preset.id}>
            <NavItem label={preset.label} icon={preset.icon} disabled={!!unavailable} description={unavailable} onClick={() => !unavailable && onPick(preset.id)} />
          </li>
        )
      })}
    </ul>
  )
}

/**
 * Step 2 of adding an account (brief X8): the provider's form, in first
 * run's focus frame or in Settings › Accounts' column. `onAdded` gets the
 * new account; the place says it was added (a toast, or the Inbox's).
 */
export function AddAccountStep({ preset: id, where, onBack, onAdded }: { preset: string; where: AddPlace; onBack: () => void; onAdded: (a: Account) => void }) {
  const preset = PRESETS.find((p) => p.id === id)
  if (!preset) return null
  return (
    <AddPlaceProvider where={where} onBack={onBack}>
      {preset.oauth ? <OAuthSignIn issuer={preset.oauth} title={`Add ${preset.name}`} onAdded={onAdded} /> : <AddAccountForm preset={preset} onAdded={onAdded} />}
    </AddPlaceProvider>
  )
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))

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

/** A server's three fields, under its header: SERVER · PORT · SECURITY (brief X8). */
function ServerFields({ label, value, onChange, idPrefix }: { label: string; value: ServerConfig; onChange: (v: ServerConfig) => void; idPrefix: string }) {
  return (
    <section aria-label={label} className="flex flex-col gap-4">
      <SectionHeader title={label} level={3} />
      <div className="grid grid-cols-[1fr_6rem] gap-4">
        <TextField label="Server" placeholder="mail.example.com" value={value.host} onChange={(e) => onChange({ ...value, host: e.target.value.trim() })} id={`${idPrefix}-host`} autoCapitalize="none" autoComplete="off" />
        <TextField label="Port" inputMode="numeric" value={value.port} onChange={(e) => onChange({ ...value, port: Number(e.target.value.replace(/\D/g, "")) || 0 })} id={`${idPrefix}-port`} />
      </div>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-security`}>Security</FieldLabel>
        <NativeSelect id={`${idPrefix}-security`} value={value.security} onChange={(e) => onChange({ ...value, security: e.target.value as Security })}>
          {SECURITY.map((s) => (
            <NativeSelectOption key={s.value} value={s.value}>
              {s.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
    </section>
  )
}

/** A help line with its link, as the provider writes it. */
function Help({ text, href }: { text: string; href: string }) {
  return (
    <>
      {text}{" "}
      <a href={href} target="_blank" rel="noreferrer" className="underline underline-offset-2">
        How
      </a>
    </>
  )
}

/**
 * Step 2 for a provider that takes a password (brief X8): EMAIL ADDRESS,
 * NAME ON SENT MAIL and the provider's secret; Other adds its servers, JMAP
 * its session; calendars and contacts only where the preset asks. ADD
 * ACCOUNT checks with the server before it saves; what the server says when
 * it refuses stays in a compact critical Banner above it.
 */
function AddAccountForm({ preset, onAdded }: { preset: Preset; onAdded: (a: Account) => void }) {
  const { block } = useAddPlace()
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
  const title = `Add ${preset.name}`

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
      onAdded(a)
    },
  })
  const separateDav = typeof preset.dav === "object" && preset.dav.separateSecret

  return (
    <form aria-label={title} onSubmit={(e) => (e.preventDefault(), add.mutate())} className="flex flex-1 flex-col gap-8">
      <AccountFormTop title={title} />
      <div className="flex flex-col gap-4">
        <TextField id="acct-address" label="Email address" type="email" required autoComplete="email" autoCapitalize="none" value={address} onChange={(e) => setAddress(e.target.value)} />
        <TextField id="acct-name" label="Name on sent mail" placeholder="Your name" autoComplete="name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        {custom === "jmap" && (
          <TextField id="acct-session" label="Session URL" type="url" required placeholder="https://mail.example.com/jmap/session" helper="Often https://your-server/.well-known/jmap" autoCapitalize="none" value={sessionUrl} onChange={(e) => setSessionUrl(e.target.value)} />
        )}
        {custom && <TextField id="acct-user" label="Username" placeholder="Usually your email address" autoCapitalize="none" value={username} onChange={(e) => setUsername(e.target.value)} />}
        <TextField
          id="acct-password"
          label={preset.passwordLabel}
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          helper={preset.passwordHelp && <Help {...preset.passwordHelp} />}
        />
      </div>
      {custom === "imap" && (
        <>
          <ServerFields label="Incoming (IMAP)" value={imap} onChange={setImap} idPrefix="imap" />
          <ServerFields label="Outgoing (SMTP)" value={smtp} onChange={setSmtp} idPrefix="smtp" />
        </>
      )}
      {(separateDav || preset.dav === "ask") && (
        <section aria-label="Calendars and contacts" className="flex flex-col gap-4">
          <SectionHeader title="Calendars and contacts" level={3} />
          {separateDav ? (
            <TextField
              id="acct-dav-password"
              label="App password for calendars and contacts"
              type="password"
              autoComplete="off"
              value={davPassword}
              onChange={(e) => setDavPassword(e.target.value)}
              helper={preset.davPasswordHelp && <Help {...preset.davPasswordHelp} />}
            />
          ) : (
            <DavUrlFields calendarUrl={calendarUrl} setCalendarUrl={setCalendarUrl} contactsUrl={contactsUrl} setContactsUrl={setContactsUrl} />
          )}
        </section>
      )}
      {typeof preset.dav === "object" && !preset.dav.separateSecret && <p className="type-caption text-text-secondary">Calendars and contacts connect with the same password.</p>}

      <FormFailed message={add.error ? errorText(add.error) : null} />
      <AccountFormEnd
        primary={
          <Button type="submit" block={block} loading={add.isPending}>
            Add account
          </Button>
        }
      >
        <p className="type-caption text-text-secondary">Checked before saving.</p>
      </AccountFormEnd>
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
      <TextField
        id="acct-caldav"
        label="Calendar server (CalDAV)"
        type="url"
        placeholder="https://dav.example.com/"
        helper="Optional. The server address is enough; we find your calendars from there."
        autoCapitalize="none"
        value={calendarUrl}
        onChange={(e) => setCalendarUrl(e.target.value)}
      />
      <TextField id="acct-carddav" label="Contacts server (CardDAV)" type="url" placeholder="https://dav.example.com/" autoCapitalize="none" value={contactsUrl} onChange={(e) => setContactsUrl(e.target.value)} />
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
  const phone = useAppFrame().phone
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
    <form onSubmit={(e) => (e.preventDefault(), connect.mutate())} className="flex flex-col gap-8">
      <AccountScreenHead title={`Calendars and contacts // ${account.displayName}`} onBack={onBack} />
      <div className="flex flex-col gap-4">
        {!fixed && <DavUrlFields calendarUrl={calendarUrl} setCalendarUrl={setCalendarUrl} contactsUrl={contactsUrl} setContactsUrl={setContactsUrl} />}
        <TextField
          id="dav-password"
          label={separate ? "App password for calendars and contacts" : "Password"}
          type="password"
          required={separate}
          autoComplete="off"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          helper={separate ? (preset?.davPasswordHelp?.text ?? "This server needs its own password for calendars.") : "Leave blank to use the account's saved password."}
        />
      </div>
      <FormFailed message={connect.error ? errorText(connect.error) : null} />
      <AccountFormEnd
        primary={
          <Button type="submit" block={phone} loading={connect.isPending}>
            Connect
          </Button>
        }
      />
    </form>
  )
}
