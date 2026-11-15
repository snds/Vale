import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type Ref } from "react"

import { useUi, type ContactEditorState } from "@/app/ui-store"
import { DatePicker } from "@/components/date-picker"
import { FormLayer, FormLayerForm } from "@/components/editor-frame"
import {
  AdaptiveMenu,
  AdaptiveMenuRadioGroup,
  AdaptiveMenuRadioItem,
  AdaptivePopover,
  AppFrameInset,
  AppFramePageHead,
  Banner,
  Button,
  ChipField,
  FieldRow,
  FieldRowAction,
  Icon,
  IconButton,
  InitialTile,
  TextField,
  toast,
  useAppFrame,
} from "@unicron/ui"
import { getCoreClient } from "@/core/client"
import { useAccounts, useCollections, useContactLabels, usePimAction } from "@/core/queries"
import type { Account, Collection, ContactField, ContactInput } from "@/core/types"
import { leaveThen, useLeaveGuard } from "@/lib/leave-guard"

import { birthdayLabel, contactInitials, fieldLabel } from "./contact-format"
import { useContactPane } from "./contact-pane"

const EMAIL_LABELS = ["home", "work", "other"]
const PHONE_LABELS = ["cell", "home", "work", "other"]

/** A number is written with digits, and may carry spaces, a leading +, the usual - ( ) . / between them, and an extension. */
const PHONE_OK = /^[\d\s+\-()./]*\d[\d\s+\-()./]*(\s*(x|ext\.?)\s*\d+)?$/i
const PHONE_RULE = "Use digits, spaces and +."

/**
 * The contact form in the form layer (ADR-0087, ADR-0103): mounted once at
 * the root, so every section can open it. It stays empty while the form
 * stands in Contacts' detail column instead (`ContactPaneEditor`).
 */
export function ContactEditor() {
  const state = useUi((s) => s.contactEditor)
  const inPane = useContactPane((s) => s.inPane)
  const close = useUi((s) => s.closeContactEditor)
  const open = state !== null && !inPane
  return (
    <FormLayer open={open} onClose={close}>
      {open && <LayerForm key={JSON.stringify(state)} state={state} onDone={close} />}
    </FormLayer>
  )
}

/**
 * The form in the detail column (brief P3, Desktop / 10): EDIT CONTACT or
 * NEW CONTACT over the name as typed, PASTE A SIGNATURE at the head's right,
 * the fields, then CANCEL and SAVE. Every move away with changes asks first
 * (`lib/leave-guard`); Esc and CANCEL too. `onSaved` gets the card's id.
 */
export function ContactPaneEditor({ onSaved }: { onSaved: (id: string) => void }) {
  const state = useUi((s) => s.contactEditor)
  if (!state) return null
  return <PaneForm key={JSON.stringify(state)} state={state} onSaved={onSaved} />
}

/**
 * A picked image as a square JPEG photo: centered crop, 256 px, quality 0.85.
 * Small enough (tens of KB) to sync with the card to any server and phone.
 */
async function toPhoto(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("That file isn't an image this browser can open")
  })
  const side = Math.min(bitmap.width, bitmap.height)
  const canvas = document.createElement("canvas")
  canvas.width = canvas.height = 256
  canvas.getContext("2d")!.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 256, 256)
  bitmap.close()
  return canvas.toDataURL("image/jpeg", 0.85)
}

/** A book's name as SAVED IN says it: the account's, with the book's own when it says more; "On this device" without an account. */
function bookName(books: Collection[], accounts: Account[], id: string) {
  const b = books.find((x) => x.id === id)
  const a = accounts.find((x) => x.id === b?.accountId)
  if (!b) return ""
  if (!a) return b.accountId ? b.name : "On this device"
  return b.name !== a.displayName && b.name !== "Contacts" ? `${a.displayName} // ${b.name}` : a.displayName
}

/** Everything the form holds and does, the same in the layer and in the pane. */
function useContactForm(state: ContactEditorState, onSaved: (id: string) => void) {
  const { initial, contactId } = state
  const { data: books = [] } = useCollections("contacts")
  const { data: accounts = [] } = useAccounts()
  const writable = books.filter((b) => b.writable)
  const save = usePimAction((c, input: ContactInput) => (contactId ? c.updateContact(contactId, input) : c.createContact(input)))
  const [fullName, setFullName] = useState(initial.fullName ?? "")
  const [org, setOrg] = useState(initial.org ?? "")
  const [title, setTitle] = useState(initial.title ?? "")
  const [emails, setEmails] = useState<ContactField[]>(initial.emails?.length ? initial.emails : [{ label: EMAIL_LABELS[0]!, value: "" }])
  const [phones, setPhones] = useState<ContactField[]>(initial.phones?.length ? initial.phones : [{ label: PHONE_LABELS[0]!, value: "" }])
  // The birthday as two parts (Mobile / 13 draws "Mar 04"): the day of the year, picked with the app's
  // DatePicker, and an optional year, typed. A card's yearless birthday ("--03-04") keeps no year.
  const [birthdayDay, setBirthdayDay] = useState(() => /(\d{2}-\d{2})$/.exec(initial.birthday ?? "")?.[1] ?? "")
  const [birthdayYear, setBirthdayYear] = useState(() => /^(\d{4})-/.exec(initial.birthday ?? "")?.[1] ?? "")
  const yearOk = !birthdayYear.trim() || /^\d{4}$/.test(birthdayYear.trim())
  const birthday = birthdayDay ? (birthdayYear.trim() && yearOk ? `${birthdayYear.trim()}-${birthdayDay}` : `--${birthdayDay}`) : ""
  const [note, setNote] = useState(initial.note ?? "")
  const [labels, setLabels] = useState<string[]>(initial.labels ?? [])
  const [photo, setPhoto] = useState<string | null>(initial.photo ?? null)
  const photoChanged = photo !== (initial.photo ?? null)
  const [pasted, setPasted] = useState("")
  const [chosen, setBook] = useState(initial.bookId ?? "")
  const bookId = chosen || writable[0]?.id || ""
  const [error, setError] = useState<string | null>(null)
  // Phone numbers are checked once their field is left, or on SAVE; a number the card already had is never questioned.
  const [checked, setChecked] = useState<Set<number>>(() => new Set())
  const [tried, setTried] = useState(false)
  const known = new Set((initial.phones ?? []).map((p) => p.value))
  const phoneError = (i: number) => {
    const v = phones[i]?.value.trim() ?? ""
    if (!v || known.has(phones[i]!.value) || !(tried || checked.has(i))) return undefined
    return PHONE_OK.test(v) ? undefined : PHONE_RULE
  }
  const wrongPhone = phones.some((p) => {
    const v = p.value.trim()
    return v && !known.has(p.value) && !PHONE_OK.test(v)
  })

  // Asks before dropping changes once a value differs from when it opened (ADR-0087). Text pasted to fill it in counts.
  const values = JSON.stringify([fullName, org, title, emails.filter((e) => e.value.trim()), phones.filter((p) => p.value.trim()), birthday, note, labels, photo, chosen, pasted])
  const [opened] = useState(values)
  const dirty = values !== opened

  // Fills the form from a pasted signature; what you've typed stays unless the signature has it.
  const fillFrom = async (): Promise<string | null> => {
    const card = await (await getCoreClient()).parseSignature(pasted)
    if (card.fullName) setFullName(card.fullName)
    if (card.org) setOrg(card.org)
    if (card.title) setTitle(card.title)
    const kept = <T extends ContactField>(have: T[], more: T[]) => [...have.filter((f) => f.value.trim()), ...more.filter((m) => !have.some((h) => h.value.trim().toLowerCase() === m.value.trim().toLowerCase()))]
    if (card.emails.length) setEmails((e) => kept(e, card.emails))
    if (card.phones.length) setPhones((p) => kept(p, card.phones))
    const found = [card.fullName && "name", card.title && "title", card.org && "company", card.phones.length && "phone", card.emails.length && "email"].filter(Boolean)
    if (!found.length) return "Couldn't find a name, phone or email in that text"
    toast.success(`Filled in ${found.join(", ")}`)
    setPasted("")
    return null
  }

  const submit = async () => {
    setError(null)
    setTried(true)
    if (wrongPhone || !yearOk) return
    if (!bookId) return setError("There's no address book you can write to.")
    const input: ContactInput = {
      bookId,
      fullName: fullName.trim(),
      org: org.trim() || null,
      title: title.trim() || null,
      emails: emails.filter((e) => e.value.trim()),
      phones: phones.filter((p) => p.value.trim()),
      birthday: birthday || null,
      note: note.trim() || null,
      // An editor opened without the card's labels leaves them alone.
      labels: initial.labels !== undefined || labels.length ? labels : null,
      // Only a changed photo is sent; "" removes it.
      ...(photoChanged ? { photo: photo ?? "" } : {}),
    }
    try {
      const saved = await save.mutateAsync(input)
      const name = saved.fullName || "contact"
      toast.success(contactId ? `Saved ${name}` : `Added ${name}`)
      onSaved(saved.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return {
    contactId,
    isNew: !contactId,
    fullName,
    setFullName,
    org,
    setOrg,
    title,
    setTitle,
    emails,
    setEmails,
    phones,
    setPhones,
    phoneError,
    checkPhone: (i: number) => setChecked((s) => new Set(s).add(i)),
    wrongPhone,
    birthdayDay,
    setBirthdayDay,
    birthdayYear,
    setBirthdayYear,
    yearError: tried && !yearOk ? "Four digits, such as 1990." : undefined,
    note,
    setNote,
    labels,
    setLabels,
    photo,
    setPhoto,
    pasted,
    setPasted,
    fillFrom,
    writable,
    bookId,
    setBook,
    bookLabel: (id: string) => bookName(books, accounts, id),
    error,
    dirty,
    saving: save.isPending,
    submit,
  }
}
type Form = ReturnType<typeof useContactForm>

/** In the form layer: a phone's whole screen (Mobile / 13), or a 640 dialog. */
function LayerForm({ state, onDone }: { state: ContactEditorState; onDone: () => void }) {
  const form = useContactForm(state, onDone)
  useLeaveGuard(form.dirty)
  const what = form.isNew ? "New contact" : "Edit contact"
  return (
    <FormLayerForm
      overline={what}
      // A phone's top row says what the form is (Mobile / 13); a dialog's header shows the name as typed.
      title={form.fullName.trim() || what}
      phoneKind
      primary={{ label: "Save", loading: form.saving }}
      error={form.error}
      onSubmit={() => void form.submit()}
    >
      <div className="flex justify-end">
        <PasteSignature form={form} />
      </div>
      <Fields form={form} />
    </FormLayerForm>
  )
}

/** In the detail column beside the list (Desktop / 10). */
function PaneForm({ state, onSaved }: { state: ContactEditorState; onSaved: (id: string) => void }) {
  const close = useUi((s) => s.closeContactEditor)
  const form = useContactForm(state, (id) => {
    close()
    onSaved(id)
  })
  useLeaveGuard(form.dirty, close)
  useEffect(() => {
    useContactPane.setState({ dirty: form.dirty })
  }, [form.dirty])
  const name = useRef<HTMLInputElement>(null)
  useEffect(() => name.current?.focus(), [])
  const what = form.isNew ? "New contact" : "Edit contact"
  const submit = (e: FormEvent) => {
    e.preventDefault()
    void form.submit()
  }
  const keys = (e: KeyboardEvent<HTMLFormElement>) => {
    // React's events cross portals: a key in a menu or a popover the form opened is not the form's.
    if (!e.currentTarget.contains(e.target as Node)) return
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      void form.submit()
    } else if (e.key === "Escape" && !e.defaultPrevented) {
      e.preventDefault()
      // After this key is done: asked at once, the question would open in time to take the same Escape and close.
      setTimeout(() => leaveThen(close))
    }
  }
  return (
    <AppFrameInset>
      <AppFramePageHead overline={what} title={form.fullName.trim() || what} size="sm" actions={<PasteSignature form={form} />} />
      <form className="flex flex-col gap-8" aria-label={what} onSubmit={submit} onKeyDown={keys} data-slot="contact-form">
        <Fields form={form} nameRef={name} />
        {form.error && <Banner size="compact" tone="critical" body={form.error} />}
        <div className="flex flex-wrap items-center gap-4" role="group" aria-label="Form actions">
          <Button type="button" variant="secondary" onClick={() => leaveThen(close)}>
            Cancel
          </Button>
          <Button type="submit" loading={form.saving} aria-keyshortcuts="Control+Enter Meta+Enter">
            <Icon name="checkmark" data-icon="inline-start" /> Save
          </Button>
        </div>
      </form>
    </AppFrameInset>
  )
}

/** PASTE A SIGNATURE: a popover (a sheet on a phone) with the text and FILL IN. What it can't read stays as the field's error. */
function PasteSignature({ form }: { form: Form }) {
  const [open, setOpen] = useState(false)
  const [miss, setMiss] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const fill = async () => {
    setBusy(true)
    try {
      const failed = await form.fillFrom()
      setMiss(failed)
      if (!failed) setOpen(false)
    } catch (e) {
      setMiss(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <AdaptivePopover
      open={open}
      onOpenChange={(o) => (setOpen(o), setMiss(null))}
      title="Paste a signature"
      align="end"
      trigger={
        <Button type="button" variant="ghost" size="sm">
          <Icon name="paste" data-icon="inline-start" /> Paste a signature
        </Button>
      }
    >
      <div
        className="flex flex-col gap-4"
        // A key here is the popover's: Enter makes a new line, Esc closes the popover and not the form.
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            if (form.pasted.trim()) void fill()
          }
          e.stopPropagation()
        }}
      >
        <TextField
          multiline
          minRows={4}
          label="Signature"
          placeholder={"Priya Raman\nDesign systems lead | Studio\nm: +1 555 010 4410"}
          helper="Fills in the name, company, title, phones and emails it finds."
          error={miss ?? undefined}
          value={form.pasted}
          onChange={(e) => (form.setPasted(e.target.value), setMiss(null))}
          autoFocus
        />
        <Button type="button" block disabled={!form.pasted.trim()} loading={busy} onClick={() => void fill()}>
          Fill in
        </Button>
      </div>
    </AdaptivePopover>
  )
}

/** The fields of brief P3, in its order. */
function Fields({ form, nameRef }: { form: Form; nameRef?: Ref<HTMLInputElement> }) {
  const photoInput = useRef<HTMLInputElement>(null)
  const phone = useAppFrame().phone
  const { data: known = [] } = useContactLabels()
  const pick = (files: FileList | null) => {
    const f = files?.[0]
    if (f) void toPhoto(f).then(form.setPhoto, (e: Error) => toast.error(e.message))
  }
  const suggestions = known.map((k) => k.name).filter((n) => !form.labels.some((l) => l.toLowerCase() === n.toLowerCase()))
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4" role="group" aria-label="Photo">
        <InitialTile size="l" initials={contactInitials(form.fullName || "?")} src={form.photo ?? undefined} />
        <div className="flex flex-wrap gap-2">
          {/* One control, one Tab stop: the button opens the file picker; the input stays out of the tab order and of assistive tech. */}
          <Button type="button" variant="ghost" size="sm" onClick={() => photoInput.current?.click()}>
            <Icon name="camera" data-icon="inline-start" /> {form.photo ? "Change photo" : "Add photo"}
          </Button>
          <input ref={photoInput} type="file" accept="image/*" tabIndex={-1} aria-hidden="true" hidden onChange={(e) => (pick(e.target.files), (e.target.value = ""))} />
          {form.photo && (
            <Button type="button" variant="ghost" size="sm" onClick={() => form.setPhoto(null)}>
              Remove photo
            </Button>
          )}
        </div>
      </div>
      <TextField ref={nameRef} label="Name" autoComplete="name" value={form.fullName} onChange={(e) => form.setFullName(e.target.value)} data-form-focus="" />
      <div className={phone ? "flex flex-col gap-6" : "grid grid-cols-2 gap-4"}>
        <TextField label="Company" autoComplete="organization" value={form.org} onChange={(e) => form.setOrg(e.target.value)} />
        <TextField label="Job title" autoComplete="organization-title" value={form.title} onChange={(e) => form.setTitle(e.target.value)} />
      </div>
      <FieldList kind="email" form={form} />
      <FieldList kind="phone" form={form} />
      <BirthdayField form={form} />
      <ChipField
        label="Labels"
        value={form.labels}
        onValueChange={form.setLabels}
        // Reuse a label's spelling, so "clay club" joins "Clay club".
        parse={(text) => {
          const l = text.trim().replace(/,/g, " ")
          return l ? (known.find((k) => k.name.toLowerCase() === l.toLowerCase())?.name ?? l) : null
        }}
        helper={suggestions.length ? `In use: ${suggestions.slice(0, 6).join(", ")}` : undefined}
        list="contact-label-options"
      />
      <datalist id="contact-label-options">
        {suggestions.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      <TextField label="Note" multiline minRows={4} value={form.note} onChange={(e) => form.setNote(e.target.value)} />
      {form.isNew && form.writable.length > 0 && (
        <FieldRow
          size={phone ? "stacked" : "default"}
          label="Saved in"
          action={
            form.writable.length > 1 ? (
              <AdaptiveMenu title="Save in" align="end" trigger={<FieldRowAction type="button">Change</FieldRowAction>}>
                <AdaptiveMenuRadioGroup value={form.bookId} onValueChange={form.setBook}>
                  {form.writable.map((b) => (
                    <AdaptiveMenuRadioItem key={b.id} value={b.id}>
                      {form.bookLabel(b.id)}
                    </AdaptiveMenuRadioItem>
                  ))}
                </AdaptiveMenuRadioGroup>
              </AdaptiveMenu>
            ) : undefined
          }
        >
          {form.bookLabel(form.bookId)}
        </FieldRow>
      )}
    </div>
  )
}

/** EMAILS or PHONE NUMBERS: a row per value (the field, its label in a menu inside the box, remove), then ADD EMAIL or ADD PHONE. */
/**
 * BIRTHDAY (Mobile / 13, Desktop / 10): the day, as the app writes dates ("Mar 04"), picked with the
 * shared DatePicker (ADR-0088), and an optional YEAR beside it. A birthday with no year is saved
 * without one, as other apps save it ("--03-04").
 */
function BirthdayField({ form }: { form: Form }) {
  const [open, setOpen] = useState(false)
  const day = form.birthdayDay
  const shown = day ? birthdayLabel(`--${day}`) : ""
  // The picker opens on the birthday in the year typed, or this year.
  const [thisYear] = useState(() => String(new Date().getFullYear()))
  const year = /^\d{4}$/.test(form.birthdayYear.trim()) ? form.birthdayYear.trim() : thisYear
  const spoken = day ? `Birthday, ${shown}` : "Pick a birthday"
  return (
    <div className="flex items-start gap-4" role="group" aria-label="Birthday">
      <div className="min-w-0 flex-1">
        <TextField
          label="Birthday"
          readOnly
          tabIndex={-1}
          placeholder="Not set"
          value={shown}
          onClick={() => setOpen(true)}
          trailing={
            <>
              {day && <IconButton type="button" label="Remove birthday" icon="close" size="icon-sm" onClick={() => (form.setBirthdayDay(""), form.setBirthdayYear(""))} />}
              <DatePicker
                title="Birthday"
                value={day ? `${year}-${day}` : ""}
                onPick={(d) => form.setBirthdayDay(d.slice(5))}
                open={open}
                onOpenChange={setOpen}
                align="end"
                trigger={<IconButton type="button" label={spoken} icon="calendar" size="icon-sm" />}
              />
            </>
          }
        />
      </div>
      {/* The year joins once there is a day to give it to. */}
      {day && (
        <div className="w-32 shrink-0">
          <TextField
            label="Year"
            inputMode="numeric"
            autoComplete="bday-year"
            placeholder="Optional"
            maxLength={4}
            value={form.birthdayYear}
            onChange={(e) => form.setBirthdayYear(e.target.value)}
            error={form.yearError}
          />
        </div>
      )}
    </div>
  )
}

function FieldList({ kind, form }: { kind: "email" | "phone"; form: Form }) {
  const email = kind === "email"
  const rows = email ? form.emails : form.phones
  const onChange = email ? form.setEmails : form.setPhones
  const labels = email ? EMAIL_LABELS : PHONE_LABELS
  const noun = email ? "Email" : "Phone"
  const set = (i: number, patch: Partial<ContactField>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  return (
    <div className="flex flex-col gap-4" role="group" aria-label={email ? "Emails" : "Phone numbers"}>
      {rows.map((f, i) => (
        <TextField
          key={i}
          label={i === 0 ? (email ? "Emails" : "Phone numbers") : undefined}
          aria-label={`${noun} ${i + 1}`}
          type={email ? "email" : "tel"}
          inputMode={email ? "email" : "tel"}
          autoComplete={email ? "email" : "tel"}
          value={f.value}
          onChange={(e) => set(i, { value: e.target.value })}
          onBlur={() => !email && form.checkPhone(i)}
          error={email ? undefined : form.phoneError(i)}
          trailing={
            <>
              <AdaptiveMenu
                title={`${noun} ${i + 1} label`}
                align="end"
                trigger={
                  <Button type="button" variant="ghost" size="sm" aria-label={`${noun} ${i + 1} label, ${fieldLabel(f.label, "None")}`}>
                    {fieldLabel(f.label, noun)} <Icon name="chevron--down" data-icon="inline-end" />
                  </Button>
                }
              >
                <AdaptiveMenuRadioGroup value={f.label ?? ""} onValueChange={(v) => set(i, { label: v || null })}>
                  {[...new Set([...labels, ...(f.label ? [f.label] : [])])].map((l) => (
                    <AdaptiveMenuRadioItem key={l} value={l}>
                      {fieldLabel(l, noun)}
                    </AdaptiveMenuRadioItem>
                  ))}
                </AdaptiveMenuRadioGroup>
              </AdaptiveMenu>
              {rows.length > 1 && (
                <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${noun.toLowerCase()} ${i + 1}`} onClick={() => onChange(rows.filter((_, j) => j !== i))}>
                  <Icon name="subtract--alt" />
                </Button>
              )}
            </>
          }
        />
      ))}
      <div>
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange([...rows, { label: labels[0]!, value: "" }])}>
          <Icon name="add" data-icon="inline-start" /> {email ? "Add email" : "Add phone"}
        </Button>
      </div>
    </div>
  )
}
