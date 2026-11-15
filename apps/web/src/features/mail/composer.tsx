import { useEditorState } from "@tiptap/react"
import { useDeferredValue, useEffect, useId, useMemo, useRef, useState, type DragEvent, type ReactElement } from "react"

import { useUi, type ComposerDraft } from "@/app/ui-store"
import { FormLayer, FormLayerForm } from "@/components/editor-frame"
import { useFormLayerClose } from "@/components/form-layer-context"
import { FormatBar } from "@/components/format-bar"
import { RecipientField } from "@/components/recipient-field"
import { hasWrongAddress, recipientProblemId } from "@/components/recipients"
import { RichEditor } from "@/components/rich-editor"
import { useRichEditor } from "@/components/use-rich-editor"
import {
  AdaptiveMenu,
  AdaptiveMenuCheckboxItem,
  AdaptiveMenuItem,
  AdaptiveMenuRadioGroup,
  AdaptiveMenuRadioItem,
  AdaptiveMenuSeparator,
  Banner,
  Button,
  Chip,
  ChipRemove,
  FieldRow,
  FieldRowAction,
  FileChip,
  FloatButton,
  Icon,
  SplitButton,
  TextField,
  Toolbar,
  ToolbarButton,
  ToolbarToggle,
  toast,
  useAppFrame,
  type BannerTone,
} from "@unicron/ui"
import { getCoreClient } from "@/core/client"
import { useAccounts, useCore, useLocalTimes, useMailPrefs, useSignatures, useTemplates } from "@/core/queries"
import type { Account, Draft, LocalTime, OutgoingAttachment, Template } from "@/core/types"
import { useSettingsSections } from "@/features/settings/sections"
import { useNowSecs } from "@/hooks/use-now"
import { useLeaveGuard } from "@/lib/leave-guard"
import { FOLLOW_UP_OPTIONS, longTime, nextLocalHour, partOfDay, timeThere } from "@/lib/time"

import { UNDO_SECONDS, formatRecipients, formatSize, parseRecipients } from "./format"
import { rowTime } from "./row-time"
import { backToOutbox } from "./outbox"
import { SendLaterItems, SendLaterMenu, SendLaterPicker } from "./send-later"
import { signatureBlock, withSignature } from "./signature"
import { htmlToText, textToHtml } from "./rich-text"

/**
 * Writing a message (ADR-0094; brief M6; Desktop / 02 and Mobile / 03), in the
 * form layer (ADR-0087): the compose dialog (720) from medium width up, the
 * whole screen in the phone's shells.
 *
 * - Fields: FROM (a Field Row, with CHANGE for two or more accounts), TO with
 *   a CC text button, CC, SUBJECT, then the message, six lines at least,
 *   with the signature in it.
 * - One notice at a time between the fields and the message: a server error,
 *   a send time, or the hour where the first recipient lives.
 * - Desktop footer: a Toolbar (Attach, Formatting, Templates, Remind me if no
 *   reply, More) and SEND with its Send later half, the layer's one primary.
 *   No Cancel: the close button asks before it drops writing.
 * - Phone: Send in the top row (held: Send later), Attach and More at the
 *   foot. With Formatting on and the keyboard up, the format bar takes the
 *   foot's place.
 * - Send is off with a visible reason, and stays in the tab order, while an
 *   address is wrong, too much is attached or there is no account.
 */

/** Most providers reject messages over 25 MB; base64 adds about a third. */
const MAX_ATTACHMENTS = 25 * 1024 * 1024

/** The file's own size: base64 holds three bytes in four characters, and its `=` padding holds none. */
const bytesOf = (a: OutgoingAttachment) => Math.floor((a.dataBase64.length * 3) / 4) - (a.dataBase64.endsWith("==") ? 2 : a.dataBase64.endsWith("=") ? 1 : 0)

function readFile(file: File): Promise<OutgoingAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error(`couldn't read ${file.name}`))
    reader.onload = () => {
      const url = String(reader.result)
      resolve({ filename: file.name, mimeType: file.type || "application/octet-stream", dataBase64: url.slice(url.indexOf(",") + 1) })
    }
    reader.readAsDataURL(file)
  })
}

const firstName = (t: LocalTime) => t.name?.trim().split(/\s+/)[0] || t.email

/** "Night there", "Weekend there", …, or null in their working hours. */
const dayThere = (t: LocalTime, now: number) => {
  const there = new Date((now + t.offset * 60) * 1000)
  return partOfDay(there.getUTCHours(), there.getUTCDay())
}

/** A time to send at, for someone who lives elsewhere. */
interface TheirMorning {
  offset: number
  at: number
  /** "9:00 AM for Priya". */
  label: string
}

/** 9:00 AM on each recipient's next workday, for those in another zone than
 * yours: one per offset, at most two, so the menu stays short (ADR-0041). */
function theirMornings(times: LocalTime[], now: number): TheirMorning[] {
  const mine = -new Date(now * 1000).getTimezoneOffset()
  const seen = new Set<number>()
  const out: TheirMorning[] = []
  for (const t of times) {
    if (t.offset === mine || seen.has(t.offset) || out.length === 2) continue
    seen.add(t.offset)
    const at = nextLocalHour(t.offset, now)
    out.push({
      offset: t.offset,
      at,
      label: `${timeThere(t.offset, at)} for ${firstName(t)}`,
    })
  }
  return out
}

/** "31 MB": whole megabytes, rounded up, so a total just over the limit never reads as the limit. */
const megabytes = (bytes: number) => `${Math.ceil(bytes / 1024 / 1024)} MB`

/** "Remind in 3 days": the reminder's chip. */
const remindLabel = (after: number) => `Remind in ${FOLLOW_UP_OPTIONS.find((o) => o.after === after)?.label ?? "a while"}`

/** Formatting stays as the writer left it, for the rest of the session. */
let formattingOn = false

/** Undo can reopen the composer while its close is still finishing; don't hand focus back to the page then. */
const returnFocus = () => useUi.getState().composer === null

/** A menu that another menu opens stands by an anchor of its own: it takes no press and no focus. */
const anchor = <span aria-hidden="true" tabIndex={-1} className="pointer-events-none absolute top-full right-0 size-0" />

/**
 * Mounted once at the app root; opens whenever `useUi().composer` is set.
 * Save as template is a form of its own, beside the message, so it dims the
 * message behind it.
 */
export function ComposeMail() {
  const draft = useUi((s) => s.composer)
  const close = useUi((s) => s.closeComposer)
  const [template, setTemplate] = useState<{ subject: string; html: string } | null>(null)
  // Loaded while closed, so a new message opens with its signature in place.
  useSignatures()
  useTemplates()
  return (
    <>
      {/* Closed without sending: a message EDIT took out of the Outbox goes back at its time (brief M7). */}
      <FormLayer open={draft !== null} onClose={() => (draft?.outbox && void backToOutbox(draft.outbox), close())} size="compose" finalFocus={returnFocus}>
        {draft !== null && <WritingForm key={JSON.stringify(draft)} initial={draft} onDone={close} onSaveTemplate={setTemplate} />}
      </FormLayer>
      <FormLayer open={template !== null} onClose={() => setTemplate(null)}>
        {template !== null && <SaveTemplateForm subject={template.subject} html={template.html} onDone={() => setTemplate(null)} />}
      </FormLayer>
    </>
  )
}

function WritingForm({ initial, onDone, onSaveTemplate }: { initial: ComposerDraft; onDone: () => void; onSaveTemplate: (t: { subject: string; html: string }) => void }) {
  const { data: accounts = [] } = useAccounts()
  const { data: core } = useCore()
  const { data: signatures } = useSignatures()
  const { data: templates = [] } = useTemplates()
  const openComposer = useUi((s) => s.openComposer)
  const openSettings = useUi((s) => s.openSettings)
  const closeLayer = useFormLayerClose()
  const sections = useSettingsSections()
  const { phone, keyboardOpen } = useAppFrame()
  const ids = useId()
  const [chosenAccount, setAccountId] = useState(initial.accountId ?? "")
  // Default to the first account without an effect (accounts may load after open).
  const accountId = chosenAccount || accounts[0]?.id || ""
  const account = accounts.find((a) => a.id === accountId)
  const [to, setTo] = useState(formatRecipients(initial.to))
  const [cc, setCc] = useState(formatRecipients(initial.cc))
  const [showCc, setShowCc] = useState((initial.cc?.length ?? 0) > 0)
  // A chip that is not an address (ADR-0089): its field says so under its box, and Send points at that line as its reason.
  const [toProblem, setToProblem] = useState<string | null>(null)
  const [ccProblem, setCcProblem] = useState<string | null>(null)
  const addressProblem = toProblem ?? (showCc ? ccProblem : null)
  const [subject, setSubject] = useState(initial.subject ?? "")
  const [sendAt, setSendAt] = useState<number | null>(initial.sendAt ?? null)
  const [followUp, setFollowUp] = useState<number | null>(initial.followUpAfter ?? null)
  // A read receipt (ADR-0055): Advanced settings' default, until changed here.
  const { data: mailPrefs } = useMailPrefs()
  const [receiptChoice, setReceipt] = useState<boolean | null>(initial.requestReceipt ?? null)
  const receipt = receiptChoice ?? mailPrefs?.requestReceipts ?? false
  const [formatting, setFormattingState] = useState(formattingOn)
  const setFormatting = (on: boolean) => {
    formattingOn = on
    setFormattingState(on)
  }
  // Their clocks (ADR-0041): who in To lives somewhere else, from their own mail.
  const toEmails = useDeferredValue(useMemo(() => parseRecipients(to).map((a) => a.email.toLowerCase()).slice(0, 10), [to]))
  const { data: localTimes = [] } = useLocalTimes(toEmails)
  const now = useNowSecs(30_000)
  const theirs = useMemo(() => theirMornings(localTimes, now), [localTimes, now])
  const late = localTimes.map((t) => ({ t, day: dayThere(t, now) })).find((x) => x.day)
  // Each account's signature, as the editor renders it.
  const blocks = useMemo(() => new Map((signatures ?? []).map((s) => [s.accountId, signatureBlock(s.html)])), [signatures])
  const baseHtml = initial.bodyHtml ?? textToHtml(initial.body ?? "")
  const firstBlock = blocks.get(initial.accountId || accounts[0]?.id || "") ?? ""
  const editor = useRichEditor({
    html: signatures ? withSignature(baseHtml, firstBlock) : baseHtml,
    placeholder: "Write your message",
    // Replies (and reopened drafts) start in the body, above any quote; new mail and forwards start in To.
    focusFirst: !!initial.to?.length,
  })
  const empty = useEditorState({ editor, selector: ({ editor: e }) => e.isEmpty })
  // The signature now in the body (null until signatures have loaded).
  const shownBlock = useRef<string | null>(signatures ? [...blocks.values()].find((b) => b && editor.getHTML().includes(b)) ?? "" : null)
  // Signatures that load late are added once; changing From swaps the signature.
  useEffect(() => {
    if (!signatures) return
    const next = blocks.get(accountId) ?? ""
    const html = editor.getHTML()
    const keepCursor = () => editor.isFocused && editor.commands.setTextSelection(1)
    if (shownBlock.current === null) {
      const present = [...blocks.values()].find((b) => b && html.includes(b))
      shownBlock.current = present ?? ""
      if (present) return
      const signed = withSignature(html, next)
      if (signed !== html) {
        editor.commands.setContent(signed, { emitUpdate: false })
        keepCursor()
        shownBlock.current = next
      }
      return
    }
    if (next === shownBlock.current || !shownBlock.current || !html.includes(shownBlock.current)) return
    editor.commands.setContent(html.replace(shownBlock.current, next), { emitUpdate: false })
    shownBlock.current = next
  }, [signatures, blocks, accountId, editor])
  /** The message without its signature: what a template keeps. */
  const unsigned = () => (shownBlock.current ? editor.getHTML().replace(shownBlock.current, "") : editor.getHTML())

  const insertTemplate = (t: Template) => {
    editor.chain().focus().insertContent(t.html).run()
    if (!subject.trim() && t.subject) setSubject(t.subject)
  }
  const [files, setFiles] = useState<OutgoingAttachment[]>(initial.attachments ?? [])
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const picker = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLFormElement>(null)

  // Opened from a toast action (Undo, Edit), the composer races Sonner, which
  // hands focus back to whatever had it before the toast as the toast goes
  // away. The dialog is modal, so for its first second any focus landing
  // outside it is that hand-back: take it back.
  useEffect(() => {
    const first = () => formRef.current?.closest("[role=dialog]")?.querySelector<HTMLElement>("[data-composer-focus]")
    // Focus on the dialog's own container (its fallback when the field wasn't
    // in the DOM yet) or outside it is a miss: move it to the first field.
    const missed = (el: Element | null) => {
      const dialog = formRef.current?.closest("[role=dialog]")
      // Menus and dialogs the composer opens (send later, templates) sit outside it too, on purpose.
      return !!dialog && (!el || el === dialog || el === document.body || (!dialog.contains(el) && !el.closest("[data-sonner-toaster], [role=menu], [role=dialog]")))
    }
    const onFocusIn = (e: FocusEvent) => {
      if (missed(e.target instanceof Element ? e.target : null)) first()?.focus()
    }
    document.addEventListener("focusin", onFocusIn)
    // The editor mounts its DOM after the dialog opens; check once it has.
    // A reply written below the quote starts there (ADR-0055).
    const afterQuote = () => {
      if (!initial.cursorAfterQuote) return
      let pos = -1
      let seenQuote = false
      editor.state.doc.forEach((node, offset) => {
        if (node.type.name === "blockquote") seenQuote = true
        else if (seenQuote && pos < 0 && node.type.name === "paragraph" && node.content.size === 0) pos = offset + 1
      })
      if (pos > 0) editor.commands.setTextSelection(pos)
    }
    const frame = requestAnimationFrame(() => {
      if (missed(document.activeElement)) first()?.focus()
      afterQuote()
    })
    const stop = setTimeout(() => document.removeEventListener("focusin", onFocusIn), 1000)
    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(stop)
      document.removeEventListener("focusin", onFocusIn)
    }
    // Once, when the composer opens: the editor and its first draft are fixed by then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const totalBytes = files.reduce((n, f) => n + bytesOf(f), 0)
  const tooBig = totalBytes > MAX_ATTACHMENTS

  const addFiles = async (list: FileList | null) => {
    if (!list?.length) return
    try {
      const read = await Promise.all([...list].map(readFile))
      setFiles((prev) => [...prev, ...read])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  // Files dragged over the layer: a 2 px primary edge inside it and "Drop to attach". Counted, because
  // the drag enters and leaves every field on its way.
  const [dragDepth, setDragDepth] = useState(0)
  const carriesFiles = (e: DragEvent) => e.dataTransfer.types.includes("Files")
  const drop = {
    onDragEnter: (e: DragEvent<HTMLFormElement>) => carriesFiles(e) && setDragDepth((d) => d + 1),
    onDragLeave: (e: DragEvent<HTMLFormElement>) => carriesFiles(e) && setDragDepth((d) => Math.max(0, d - 1)),
    onDragOver: (e: DragEvent<HTMLFormElement>) => carriesFiles(e) && e.preventDefault(),
    onDrop: (e: DragEvent<HTMLFormElement>) => {
      setDragDepth(0)
      if (!e.dataTransfer.files.length) return
      e.preventDefault()
      void addFiles(e.dataTransfer.files)
    },
  }

  const send = async () => {
    // Sent from the keyboard with a wrong address still being typed: the field turns it red and Send says why.
    if (hasWrongAddress(to) || (showCc && hasWrongAddress(cc))) return
    setError(null)
    setSending(true)
    const html = editor.isEmpty ? null : editor.getHTML()
    const draft: Draft = {
      accountId,
      to: parseRecipients(to),
      cc: showCc ? parseRecipients(cc) : [],
      subject: subject.trim(),
      body: html ? htmlToText(html) : "",
      bodyHtml: html,
      inReplyTo: initial.inReplyTo ?? null,
      references: initial.references ?? [],
      attachments: files,
      followUpAfter: followUp,
      requestReceipt: receipt,
    }
    try {
      const client = await getCoreClient()
      const item = await client.queueSend(draft, UNDO_SECONDS, sendAt)
      onDone()
      if (sendAt !== null) {
        // Toasts name the thing and say the time as rows do (brief M7): "Scheduled Saturday ferry for Fri 08:00".
        toast(`Scheduled ${draft.subject || "message"} for ${rowTime(item.sendAt)}`, {
          action: {
            label: "Undo",
            onClick: async () => {
              try {
                openComposer({ ...(await client.cancelSend(item.id)), sendAt: item.sendAt })
              } catch (e) {
                toast.error(e instanceof Error ? e.message : String(e))
              }
            },
          },
        })
        return
      }
      // In its undo window the send is live: the status strip and the status line show it, with UNDO (ADR-0086).
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setSending(false)
    }
  }

  // Closing asks whenever the message holds a recipient, a subject, text or a file (brief X6): a reply
  // and a message reopened by Undo send always do. The signature alone is not writing.
  // A message EDIT took out of the Outbox asks only when it was changed: closed as it was, it goes back (brief X6).
  const written = () => JSON.stringify([to, showCc ? cc : "", subject, files.length, htmlToText(editor.getHTML()), followUp, receipt, sendAt])
  const asOpened = useRef<string | null>(null)
  useEffect(() => {
    if (initial.outbox && asOpened.current === null && signatures) asOpened.current = written()
  })
  useLeaveGuard(() => {
    if (initial.outbox) return asOpened.current !== null && written() !== asOpened.current
    if (to.trim() || (showCc && cc.trim()) || subject.trim() || files.length) return true
    const html = editor.isEmpty ? "" : editor.getHTML()
    return htmlToText(shownBlock.current ? html.replace(shownBlock.current, "") : html).trim() !== ""
  })

  // Why Send is off: the line under a recipient field, the attachments' line, or the no-account notice.
  const tooBigId = `${ids}-too-big`
  const noticeId = `${ids}-notice`
  const noAccount = accounts.length === 0
  const reasonId = addressProblem ? recipientProblemId(toProblem ? "composer-to" : "composer-cc") : tooBig ? tooBigId : noAccount ? noticeId : undefined
  const cannotSend = reasonId !== undefined

  // One notice at a time, the first that applies (brief M6).
  const notice: { tone: BannerTone; body: string; action?: { label: string; run: () => void } } | null = error
    ? { tone: "critical", body: error }
    : noAccount
      ? { tone: "info", body: "Add an account to send.", action: { label: "Open accounts", run: () => (openSettings("accounts"), closeLayer()) } }
      : sendAt !== null
        ? { tone: "info", body: `Sends ${longTime(sendAt)}.`, action: { label: "Send now instead", run: () => setSendAt(null) } }
        : late
          ? {
              tone: "info",
              body: `It's ${timeThere(late.t.offset, now)} for ${firstName(late.t)}. ${late.day}.`,
              // Their morning, when it is this person's (ADR-0041).
              action: theirs[0] && theirs[0].offset === late.t.offset ? { label: `Send ${theirs[0].label}`, run: () => setSendAt(theirs[0]!.at) } : undefined,
            }
          : null

  // The layers the tools open: a menu from its own button on a desktop; from More, by an anchor, on a phone.
  const [laterOpen, setLaterOpen] = useState(false)
  const [picking, setPicking] = useState(false)
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [remindOpen, setRemindOpen] = useState(false)
  const canSaveTemplate = !empty && unsigned().replace(/<p><\/p>/g, "").trim() !== ""
  const saveTemplate = () => onSaveTemplate({ subject: subject.trim(), html: unsigned() })
  const writingSettings = sections.some((s) => s.id === "writing")
  const openWritingSettings = () => (openSettings("writing"), closeLayer())

  const kind = initial.inReplyTo ? "Reply" : /^fwd?:/i.test(initial.subject ?? "") ? "Forward" : "New message"
  const overline = account ? `${kind} // ${account.displayName}` : kind
  const sendWord = sendAt === null ? "Send" : "Schedule"
  const demo = core?.kind === "demo" ? <span className="shrink-0 type-caption text-muted-foreground">Demo. Nothing leaves.</span> : null

  const laterPicker = picking && <SendLaterPicker value={sendAt} onClose={() => setPicking(false)} onPick={setSendAt} />

  const templatesMenu = (trigger: ReactElement<Record<string, unknown>>, controlled: boolean) => (
    <AdaptiveMenu title="Templates" align="start" trigger={trigger} open={controlled ? templatesOpen : undefined} onOpenChange={controlled ? setTemplatesOpen : undefined}>
      {templates.map((t) => (
        <AdaptiveMenuItem key={t.id} icon="document" onSelect={() => insertTemplate(t)}>
          {t.name}
        </AdaptiveMenuItem>
      ))}
      {templates.length > 0 && <AdaptiveMenuSeparator />}
      <AdaptiveMenuItem icon="save" disabled={!canSaveTemplate} onSelect={saveTemplate}>
        Save as template…
      </AdaptiveMenuItem>
      {writingSettings && (
        <AdaptiveMenuItem icon="edit" onSelect={openWritingSettings}>
          Signatures and templates…
        </AdaptiveMenuItem>
      )}
    </AdaptiveMenu>
  )

  // A delay after the message goes out (brief M8): the composer's list is delays, not times.
  const remindMenu = (trigger: ReactElement<Record<string, unknown>>, controlled: boolean) => (
    <AdaptiveMenu title="Remind me if no reply" align="start" trigger={trigger} open={controlled ? remindOpen : undefined} onOpenChange={controlled ? setRemindOpen : undefined}>
      <AdaptiveMenuRadioGroup value={followUp === null ? undefined : String(followUp)} onValueChange={(v) => setFollowUp(Number(v))}>
        {FOLLOW_UP_OPTIONS.map((o) => (
          <AdaptiveMenuRadioItem key={o.after} value={String(o.after)}>
            In {o.label}
          </AdaptiveMenuRadioItem>
        ))}
      </AdaptiveMenuRadioGroup>
      {followUp !== null && (
        <>
          <AdaptiveMenuSeparator />
          <AdaptiveMenuItem icon="notification--off" onSelect={() => setFollowUp(null)}>
            No reminder
          </AdaptiveMenuItem>
        </>
      )}
    </AdaptiveMenu>
  )

  const reminderChip = followUp !== null && (
    <Chip variant="outline">
      <span>{remindLabel(followUp)}</span>
      <ChipRemove label="Remove reminder" onClick={() => setFollowUp(null)} />
    </Chip>
  )
  const filePicker = <input ref={picker} type="file" multiple hidden onChange={(e) => (void addFiles(e.target.files), (e.target.value = ""))} />
  const attach = () => picker.current?.click()

  // ── Desktop and medium: the footer's tools, and SEND with its Send later half ──
  const desktopTools = (
    <>
      {filePicker}
      <Toolbar aria-label="Message tools">
        <ToolbarButton icon="attachment" label="Attach files" onClick={attach} />
        <ToolbarToggle icon="text--scale" label="Formatting" pressed={formatting} onPressedChange={setFormatting} />
        {templatesMenu(<ToolbarButton icon="document" label="Templates" />, false)}
        {remindMenu(<ToolbarButton icon={followUp === null ? "notification" : "notification--filled"} label="Remind me if no reply" />, false)}
        <AdaptiveMenu title="More" align="start" trigger={<ToolbarButton icon="overflow-menu--horizontal" label="More" />}>
          <AdaptiveMenuCheckboxItem icon="email" checked={receipt} onCheckedChange={setReceipt}>
            Ask for a read receipt
          </AdaptiveMenuCheckboxItem>
        </AdaptiveMenu>
      </Toolbar>
      {reminderChip}
    </>
  )
  const desktopSend = (
    <div className="relative flex min-w-0 items-center gap-4">
      {demo}
      <SplitButton
        type="submit"
        menuLabel="Send later"
        disabled={cannotSend}
        // Off with a reason: still a Tab stop, and it says the reason with its name (brief 4.0).
        focusableWhenDisabled={cannotSend || undefined}
        loading={sending}
        aria-describedby={reasonId}
        aria-keyshortcuts="Control+Enter Meta+Enter"
        menuProps={{ width: "auto" }}
        menu={<SendLaterItems theirs={theirs} onPick={setSendAt} onCustom={() => setPicking(true)} />}
      >
        <Icon name={sendAt === null ? "send--alt" : "time"} data-icon="inline-start" /> {sendWord}
      </SplitButton>
      {anchor}
      {laterPicker}
    </div>
  )

  // ── Phone: Attach and More at the foot; Send later held on Send, or from More ──
  const phoneTools = (
    <div className="relative flex min-w-0 flex-1 flex-col gap-2">
      {filePicker}
      {/* Above the keyboard, the format bar takes the foot's place; without it, it stands over the foot. */}
      {formatting && <FormatBar editor={editor} mode="keyboard" />}
      {!(formatting && keyboardOpen) && (
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <FloatButton type="button" size="l" icon="attachment" label="Attach files" onClick={attach} />
          <AdaptiveMenu title="More" trigger={<FloatButton type="button" size="l" icon="overflow-menu--horizontal" label="More" />}>
            <AdaptiveMenuItem icon="time" disabled={noAccount} onSelect={() => setLaterOpen(true)}>
              Send later…
            </AdaptiveMenuItem>
            <AdaptiveMenuItem icon="document" onSelect={() => setTemplatesOpen(true)}>
              Templates…
            </AdaptiveMenuItem>
            <AdaptiveMenuItem icon="notification" onSelect={() => setRemindOpen(true)}>
              Remind me if no reply…
            </AdaptiveMenuItem>
            <AdaptiveMenuCheckboxItem icon="email" checked={receipt} onCheckedChange={setReceipt}>
              Ask for a read receipt
            </AdaptiveMenuCheckboxItem>
            <AdaptiveMenuCheckboxItem icon="text--scale" checked={formatting} onCheckedChange={setFormatting}>
              Formatting
            </AdaptiveMenuCheckboxItem>
          </AdaptiveMenu>
          {reminderChip}
          {demo}
        </div>
      )}
      <SendLaterMenu open={laterOpen} onOpenChange={setLaterOpen} theirs={theirs} value={sendAt} onPick={setSendAt} />
      {templatesMenu(anchor, true)}
      {remindMenu(anchor, true)}
    </div>
  )

  const fromRow = account && (phone || accounts.length > 1) && (
    <FieldRow
      label="From"
      size={phone ? "stacked" : "default"}
      rule="none"
      action={
        accounts.length > 1 ? (
          <AdaptiveMenu title="From" align="end" trigger={<FieldRowAction>Change</FieldRowAction>}>
            <AdaptiveMenuRadioGroup value={accountId} onValueChange={setAccountId}>
              {accounts.map((a: Account) => (
                <AdaptiveMenuRadioItem key={a.id} value={a.id}>
                  {a.displayName} // {a.address}
                </AdaptiveMenuRadioItem>
              ))}
            </AdaptiveMenuRadioGroup>
          </AdaptiveMenu>
        ) : undefined
      }
    >
      {`${account.displayName} // ${account.address}`}
    </FieldRow>
  )

  return (
    <FormLayerForm
      ref={formRef}
      overline={overline}
      title={subject.trim() || kind}
      primary={{
        label: sendWord,
        icon: sendAt === null ? "send--alt" : "time",
        disabled: cannotSend,
        loading: sending,
        describedBy: reasonId,
        onLongPress: noAccount ? undefined : () => setLaterOpen(true),
        longPressLabel: "Send later",
      }}
      primaryControl={desktopSend}
      cancel={false}
      onSubmit={() => void send()}
      {...drop}
      footerStart={phone ? phoneTools : desktopTools}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        {fromRow}
        {/* The shared recipient field (ADR-0089): people as chips, suggestions from Contacts. */}
        <div className="flex items-start gap-2">
          <RecipientField id="composer-to" label="To" value={to} onChange={setTo} onProblem={setToProblem} focusFirst={!initial.to?.length} />
          {!showCc && (
            // Level with the field's box: below its overline (16) and the gap under it (4), and as tall as the box.
            <div className="shrink-0 pt-5">
              <Button type="button" variant="ghost" size="lg" onClick={() => setShowCc(true)}>
                Cc
              </Button>
            </div>
          )}
        </div>
        {showCc && (
          // In a row as To is: the field grows across, never down the column a phone's body fills.
          <div className="flex items-start">
            <RecipientField id="composer-cc" label="Cc" value={cc} onChange={setCc} onProblem={setCcProblem} />
          </div>
        )}
        <TextField id="composer-subject" label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
        {notice && (
          <Banner
            id={noticeId}
            size="compact"
            tone={notice.tone}
            body={notice.body}
            action={
              notice.action && (
                <Button type="button" variant="secondary" size="sm" onClick={notice.action.run}>
                  {notice.action.label}
                </Button>
              )
            }
          />
        )}
        {/* The shared rich-text field. On a desktop Formatting shows its bar on the box's bottom edge; a phone's body has no box. */}
        <RichEditor editor={editor} label="Message" fill bare={phone} bar={formatting && !phone ? <FormatBar editor={editor} /> : undefined} />
        {files.length > 0 && (
          <ul className="flex flex-wrap gap-2" aria-label="Attachments">
            {files.map((f, i) => (
              <li key={`${f.filename}-${i}`} className="min-w-0 max-w-full">
                <FileChip
                  name={f.filename}
                  size={formatSize(bytesOf(f))}
                  action={
                    <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${f.filename}`} onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}>
                      <Icon name="close" />
                    </Button>
                  }
                />
              </li>
            ))}
          </ul>
        )}
        {tooBig && (
          <p id={tooBigId} role="alert" className="type-caption text-destructive">
            {megabytes(totalBytes)} attached. Most servers take 25 MB.
          </p>
        )}
      </div>
      {dragDepth > 0 && (
        <div data-slot="composer-drop" className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rule-box-emphasis">
          <span className="bg-surface-raised px-4 py-2 type-ui text-foreground rule-box">Drop to attach</span>
        </div>
      )}
    </FormLayerForm>
  )
}

/** Save as template (brief M6), in the form layer: NAME, then SAVE TEMPLATE. The message itself, without the signature. */
function SaveTemplateForm({ subject, html, onDone }: { subject: string; html: string; onDone: () => void }) {
  const [name, setName] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  useLeaveGuard(() => name.trim() !== "")
  const save = async () => {
    const named = name.trim()
    setError(null)
    setSaving(true)
    try {
      await (await getCoreClient()).saveTemplate({ name: named, subject, html })
      onDone()
      toast.success(`Saved ${named}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setSaving(false)
    }
  }
  return (
    <FormLayerForm
      overline="Save as template"
      title={name.trim() || "Save as template"}
      primary={{ label: "Save template", disabled: !name.trim(), loading: saving }}
      error={error}
      onSubmit={() => void save()}
    >
      <TextField id="template-name" data-form-focus="" label="Name" required value={name} onChange={(e) => setName(e.target.value)} helper="Insert it into any message from Templates." />
    </FormLayerForm>
  )
}
