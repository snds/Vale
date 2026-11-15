import { useQueryClient } from "@tanstack/react-query"
import { useState, type FormEvent } from "react"

import { Banner, Button, TextField, useAppFrame } from "@unicron/ui"
import { FormLayer, FormLayerForm } from "@/components/editor-frame"
import { getCoreClient } from "@/core/client"
import { useNotesLock } from "@/core/queries"
import type { NotesLockInfo } from "@/core/types"
import { useLeaveGuard } from "@/lib/leave-guard"

/** The server's words as a sentence: a capital, and a full stop. */
const sentence = (e: unknown) => {
  const s = (e instanceof Error ? e.message : String(e)).trim()
  if (!s) return s
  const up = s.charAt(0).toUpperCase() + s.slice(1)
  return /[.!?]$/.test(up) ? up : `${up}.`
}
/** The core's word for a wrong passphrase (notes_lock.rs: "that passphrase isn't right"). */
const wrongPassphrase = (e: unknown) => /isn't right/i.test(e instanceof Error ? e.message : String(e))

/** After a lock change, every view of notes reads again (the key lives in the core). */
function useRefreshNotes() {
  const qc = useQueryClient()
  return () => void qc.invalidateQueries({ queryKey: ["notes"] })
}

/**
 * The passphrase step before locking (ADR-0043, brief N5), in the form layer:
 * "Lock notes" sets one the first time; "Unlock notes" asks for it when a lock
 * is set and notes are locked now. `onDone` runs once the key is in memory.
 */
export function AskPassphrase({ open, onOpenChange, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void }) {
  const { data: info } = useNotesLock()
  return (
    <FormLayer open={open && !!info} onClose={() => onOpenChange(false)}>
      {info && (info.set ? <UnlockForm info={info} onDone={onDone} /> : <SetForm onDone={onDone} />)}
    </FormLayer>
  )
}

/** Lock notes, the first time: the passphrase twice and an optional hint. */
function SetForm({ onDone }: { onDone: () => void }) {
  const [pass, setPass] = useState("")
  const [again, setAgain] = useState("")
  const [hint, setHint] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const refresh = useRefreshNotes()
  useLeaveGuard(!!(pass || again || hint))
  const mismatch = again.length > 0 && pass !== again
  const submit = async () => {
    if (pass !== again) return
    setBusy(true)
    setError(null)
    try {
      await (await getCoreClient()).setNotesPassphrase(pass, hint.trim() || null)
      refresh()
      onDone()
    } catch (e) {
      setError(sentence(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <FormLayerForm
      overline="Locked notes"
      title="Lock notes"
      primary={{ label: "Set passphrase", icon: "locked", disabled: !pass || !again || mismatch, loading: busy }}
      error={error}
      onSubmit={() => void submit()}
    >
      <p className="type-body text-muted-foreground">One passphrase opens every locked note, on all your devices.</p>
      <Banner tone="warning" size="compact" body="Forget it and locked notes can't be opened. Nobody can reset it." />
      <TextField
        label="Passphrase"
        type="password"
        autoComplete="new-password"
        data-form-focus
        helper="At least 6 characters."
        value={pass}
        onChange={(e) => (setPass(e.target.value), setError(null))}
      />
      <TextField
        label="Again"
        type="password"
        autoComplete="new-password"
        value={again}
        error={mismatch ? "Doesn't match yet." : undefined}
        onChange={(e) => (setAgain(e.target.value), setError(null))}
      />
      <TextField label="Hint (optional)" autoComplete="off" helper="Shown on request, to anyone who opens a locked note." value={hint} onChange={(e) => setHint(e.target.value)} />
    </FormLayerForm>
  )
}

/** Typing the passphrase, the hint on request, and the identity as a way in: one state for the layer and the note. */
function useUnlock(onDone?: () => void) {
  const [pass, setPass] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [hintShown, setHintShown] = useState(false)
  const [busy, setBusy] = useState<"pass" | "identity" | null>(null)
  const refresh = useRefreshNotes()
  const unlock = async () => {
    if (!pass) return
    setBusy("pass")
    try {
      await (await getCoreClient()).unlockNotes(pass)
      refresh()
      onDone?.()
    } catch (e) {
      setError(wrongPassphrase(e) ? "That isn't the passphrase." : sentence(e))
      setPass("")
    } finally {
      setBusy(null)
    }
  }
  // The shared identity holds the same key (ADR-0051): a way in without typing.
  const withIdentity = async () => {
    setBusy("identity")
    try {
      await (await getCoreClient()).unlockNotesWithIdentity()
      refresh()
      onDone?.()
    } catch (e) {
      setError(sentence(e))
    } finally {
      setBusy(null)
    }
  }
  const type = (v: string) => (setPass(v), setError(null))
  return { pass, type, error, hintShown, showHint: () => setHintShown(true), busy, unlock, withIdentity }
}
type Unlock = ReturnType<typeof useUnlock>

/** PASSPHRASE, with SHOW HINT beside it when there is a hint; the hint then shows as the field's helper. */
function PassphraseField({ u, info, focus }: { u: Unlock; info: NotesLockInfo; focus?: boolean }) {
  return (
    <TextField
      label="Passphrase"
      type="password"
      autoComplete="current-password"
      value={u.pass}
      onChange={(e) => u.type(e.target.value)}
      error={u.error ?? undefined}
      helper={u.hintShown && info.hint ? `Hint: ${info.hint}` : undefined}
      trailing={
        info.hint && !u.hintShown ? (
          <Button type="button" variant="ghost" size="sm" onClick={u.showHint}>
            Show hint
          </Button>
        ) : undefined
      }
      data-form-focus={focus || undefined}
    />
  )
}

/** Unlock notes, in the form layer: before locking another note while notes are locked. */
function UnlockForm({ info, onDone }: { info: NotesLockInfo; onDone: () => void }) {
  const u = useUnlock(onDone)
  return (
    <FormLayerForm
      overline="Locked notes"
      title="Unlock notes"
      primary={{ label: "Unlock", icon: "unlocked", disabled: !u.pass, loading: u.busy === "pass" }}
      footerStart={
        info.identity ? (
          <Button type="button" variant="secondary" loading={u.busy === "identity"} onClick={() => void u.withIdentity()}>
            Unlock with your identity
          </Button>
        ) : undefined
      }
      onSubmit={() => void u.unlock()}
    >
      <p className="type-body text-muted-foreground">The passphrase that opens every locked note.</p>
      <PassphraseField u={u} info={info} focus />
    </FormLayerForm>
  )
}

/**
 * A locked note while notes are locked (brief N5), in the note's own space
 * under its top line (which ends `// LOCKED`): its title, "This note is
 * locked.", PASSPHRASE, a primary UNLOCK, and a secondary UNLOCK WITH YOUR
 * IDENTITY where the device offers it.
 */
export function LockedPanel({ title }: { title: string }) {
  const { data: info } = useNotesLock()
  const u = useUnlock()
  // The note's own title size: large on a desktop, as its title field (note-editor.tsx).
  const large = !useAppFrame().phone
  const submit = (e: FormEvent) => {
    e.preventDefault()
    void u.unlock()
  }
  return (
    <section aria-labelledby="locked-note-title" data-role="locked-note" className="locked-note">
      <div className="flex flex-col gap-1">
        <h2 id="locked-note-title" className={`text-foreground ${large ? "type-display-compact" : "type-title"}`}>
          {title || "Locked note"}
        </h2>
        <p className="type-body text-muted-foreground">This note is locked.</p>
      </div>
      {info && (
        <form className="flex flex-col gap-4" onSubmit={submit} aria-label="Unlock">
          <PassphraseField u={u} info={info} />
          <div className="flex flex-wrap items-center gap-4">
            <Button type="submit" disabled={!u.pass} loading={u.busy === "pass"}>
              Unlock
            </Button>
            {info.identity && (
              <Button type="button" variant="secondary" loading={u.busy === "identity"} onClick={() => void u.withIdentity()}>
                Unlock with your identity
              </Button>
            )}
          </div>
        </form>
      )}
    </section>
  )
}
