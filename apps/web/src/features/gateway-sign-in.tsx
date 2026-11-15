import { useEffect, useState, type FormEvent, type ReactNode } from "react"

import { AppFrame, AppFrameFocus, AppLockup, Button, EmptyState, PageHead, TextField, Toaster, useAppFrame } from "@unicron/ui"
import { SIGNED_OUT, isTauri } from "@/core/client"
import { doorSession, gateway } from "@/features/updates/gateway-client"

type Gate = "checking" | "open" | "sign-in"

const said = (e: unknown) => (e instanceof Error ? e.message : String(e))

/**
 * In front of the app when it's served by a web gateway (ADR-0016): the
 * gateway holds your accounts, so it asks for its password first. On the
 * desktop and phone apps, and the demo, this renders the app straight away
 * (a demo scenario can play a gateway's door: `gateway-signin`,
 * `gateway-join`, `invitation-ended`). The door is the focus frame
 * (brief X9; cross-app decisions §4): 432 wide, the lockup, one primary.
 */
export function GatewayGate({ children }: { children: ReactNode }) {
  // The desktop and phone apps never sit behind a gateway.
  const [gate, setGate] = useState<Gate>(() => (isTauri() ? "open" : "checking"))
  useEffect(() => {
    if (isTauri()) return
    void doorSession().then((s) => setGate(s && !s.signedIn ? "sign-in" : "open"))
    const out = () => setGate("sign-in")
    window.addEventListener(SIGNED_OUT, out)
    return () => window.removeEventListener(SIGNED_OUT, out)
  }, [])
  if (gate === "checking") return null
  // An invitation to the team (ADR-0063): /join#<code>.
  if (location.pathname === "/join") return <Door label="Join the team"><Join /></Door>
  if (gate === "sign-in") return <Door label="Sign in"><SignIn /></Door>
  return children
}

/** The focus frame the door stands in, with its own Toaster: the app's frame isn't there yet. */
function Door({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <AppFrame>
        <AppFrameFocus lockup={<AppLockup name="Vale" />} aria-label={label}>
          {children}
        </AppFrameFocus>
      </AppFrame>
      <Toaster />
    </>
  )
}

/** A door's form: its head, its fields, and its one primary at the foot (at the phone's foot, above the keyboard). */
function DoorForm({ label, overline, title, line, primary, onSubmit, children }: { label: string; overline: string; title: string; line: string; primary: ReactNode; onSubmit: () => void; children: ReactNode }) {
  const phone = useAppFrame().phone
  const submit = (e: FormEvent) => {
    e.preventDefault()
    onSubmit()
  }
  return (
    <form aria-label={label} noValidate onSubmit={submit} className={phone ? "flex flex-1 flex-col gap-8" : "flex flex-col gap-8"}>
      <div className="flex flex-col gap-4">
        <PageHead overline={overline} title={title} size="sm" />
        <p className="type-body text-text-secondary">{line}</p>
      </div>
      <div className="flex flex-col gap-4">{children}</div>
      {phone ? <div className="sticky bottom-(--keyboard-inset) mt-auto flex flex-col bg-surface-ground pt-4 pb-[max(--spacing(4),env(safe-area-inset-bottom))]">{primary}</div> : primary}
    </form>
  )
}

/**
 * The gateway's words for a wrong password (`apps/gateway/src/lib.rs`),
 * said the shared way: "That isn't the {name of the secret}." (cross-app
 * decisions §4). Anything else it says stays in its own words.
 */
function wrongPassword(message: string, member: boolean): string | null {
  if (/not the gateway password/i.test(message)) return "That isn't the gateway password."
  if (/email and password don't match/i.test(message)) return member ? "That isn't your password." : "That isn't the gateway password."
  return null
}

/**
 * Sign in (brief X9): EMAIL, only for someone invited to the team; then
 * GATEWAY PASSWORD with the owner's helper, or PASSWORD once an email is
 * typed. SIGN IN is the one primary and keeps its word while it works. A
 * wrong password is the field's error; anything else the gateway says shows
 * under the password too, in its words.
 */
function SignIn() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const member = !!email.trim()
  return (
    <DoorForm
      label="Sign in"
      overline="Gateway"
      title="Sign in."
      line={member ? "With the email you were invited with, and your password." : "This gateway holds your accounts."}
      onSubmit={async () => {
        if (!password) {
          setError(member ? "Enter your password." : "Enter the gateway password.")
          return
        }
        setBusy(true)
        setError(null)
        try {
          await gateway().signIn(password, email)
          // A fresh start, so every query and the event stream use the new session.
          location.reload()
        } catch (err) {
          const message = said(err)
          setError(wrongPassword(message, member) ?? message.charAt(0).toUpperCase() + message.slice(1))
          setBusy(false)
        }
      }}
      primary={
        <Button type="submit" block loading={busy}>
          Sign in
        </Button>
      }
    >
      <TextField
        label="Email"
        type="email"
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        helper="Only if you were invited to the team."
        value={email}
        onChange={(e) => {
          setEmail(e.target.value)
          setError(null)
        }}
      />
      <TextField
        label={member ? "Password" : "Gateway password"}
        type="password"
        autoComplete="current-password"
        autoFocus
        helper={member ? undefined : "The GATEWAY_PASSWORD it was started with."}
        error={error ?? undefined}
        value={password}
        onChange={(e) => {
          setPassword(e.target.value)
          setError(null)
        }}
      />
    </DoorForm>
  )
}

/** The gateway's words for a spent or expired invitation (`apps/gateway/src/members.rs`). */
const ENDED = /invitation doesn't work any more/i

/**
 * Joining the team (brief X9; ADR-0063), at /join#<code>: CHOOSE A
 * PASSWORD, at least 12 characters, and JOIN. A spent or expired invitation,
 * or a link with no code, is the critical empty state "This invitation has
 * ended."
 */
function Join() {
  const code = location.hash.slice(1)
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [ended, setEnded] = useState(!code)
  if (ended) return <EmptyState tone="critical" size="sm" overline="Invitation" title="This invitation has ended." body="Ask for a new link." />
  return (
    <DoorForm
      label="Join the team"
      overline="Invitation"
      title="Join the team."
      line="You've been invited to work on a shared inbox. You'll sign in with your email and this password."
      onSubmit={async () => {
        if (password.length < 12) {
          setError("At least 12 characters.")
          return
        }
        setBusy(true)
        setError(null)
        try {
          await gateway().join(code, password)
          // Into the app, and off the invitation's address.
          location.replace("/")
        } catch (err) {
          const message = said(err)
          if (ENDED.test(message)) setEnded(true)
          else setError(message.charAt(0).toUpperCase() + message.slice(1))
          setBusy(false)
        }
      }}
      primary={
        <Button type="submit" block loading={busy}>
          Join
        </Button>
      }
    >
      <TextField
        label="Choose a password"
        type="password"
        autoComplete="new-password"
        autoFocus
        helper="At least 12 characters."
        error={error ?? undefined}
        value={password}
        onChange={(e) => {
          setPassword(e.target.value)
          setError(null)
        }}
      />
    </DoorForm>
  )
}
