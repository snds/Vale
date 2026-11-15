import { useState } from "react"

import { Button, DropdownMenuItem, FieldRow, FieldRowAction, ListRow, TextField, toast } from "@unicron/ui"
import { FormLayer, FormLayerForm } from "@/components/editor-frame"
import { FormatBar } from "@/components/format-bar"
import { RichEditor } from "@/components/rich-editor"
import { useRichEditor } from "@/components/use-rich-editor"
import { getCoreClient } from "@/core/client"
import { useAccounts, useSignatures, useTemplates } from "@/core/queries"
import type { Account, Template } from "@/core/types"
import { htmlToText } from "@/features/mail/rich-text"
import { useRowSize } from "@/features/settings/row-size"
import { SettingBlock } from "@/features/settings/setting-block"
import { useLeaveGuard } from "@/lib/leave-guard"

const said = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** What a row shows of a signature: its first line, or that there is none. */
const firstLine = (html: string) => htmlToText(html).split("\n").find((l) => l.trim())?.trim() ?? ""

/**
 * Settings › Signatures and templates (brief T3; ADR-0017, ADR-0110).
 * SIGNATURES: a row per account with its first line and EDIT, which opens
 * the form layer with the shared rich-text field and format bar (ADR-0089).
 * TEMPLATES: a row per template; a press opens its form, the row's menu
 * deletes it, with UNDO.
 */
export function WritingSettings() {
  const { data: accounts = [] } = useAccounts()
  const { data: signatures = [] } = useSignatures()
  const { data: templates = [] } = useTemplates()
  const size = useRowSize()
  const [signing, setSigning] = useState<Account | null>(null)
  const [editing, setEditing] = useState<Template | "new" | null>(null)

  if (!accounts.length) return <p className="type-caption text-text-secondary">Add an account first.</p>
  const html = (a: Account) => signatures.find((s) => s.accountId === a.id)?.html ?? ""

  const remove = async (t: Template) => {
    const client = await getCoreClient()
    try {
      await client.deleteTemplate(t.id)
    } catch (e) {
      toast.error(said(e))
      return
    }
    toast(`Deleted ${t.name}`, { action: { label: "Undo", onClick: () => void client.saveTemplate({ id: null, name: t.name, subject: t.subject, html: t.html }).catch((e) => toast.error(said(e))) } })
  }

  return (
    <div className="flex flex-col gap-8">
      <SettingBlock title="Signatures">
        {accounts.map((a) => (
          <FieldRow key={a.id} size={size} label={a.displayName} action={<FieldRowAction onClick={() => setSigning(a)}>Edit</FieldRowAction>}>
            {firstLine(html(a)) || "No signature"}
          </FieldRow>
        ))}
      </SettingBlock>

      <SettingBlock
        title="Templates"
        count={templates.length}
        action={
          <Button variant="ghost" size="sm" onClick={() => setEditing("new")}>
            New template
          </Button>
        }
      >
        {templates.length ? (
          <ul aria-label="Templates" className="flex flex-col">
            {templates.map((t) => (
              <li key={t.id}>
                <ListRow
                  size="compact"
                  title={t.name}
                  meta={t.subject || undefined}
                  metaStyle="plain"
                  onClick={() => setEditing(t)}
                  menu={
                    <DropdownMenuItem variant="destructive" onClick={() => void remove(t)}>
                      Delete
                    </DropdownMenuItem>
                  }
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="type-caption pt-4 text-text-secondary">No templates yet. Save one from a message.</p>
        )}
      </SettingBlock>

      <FormLayer open={signing !== null} onClose={() => setSigning(null)}>
        {signing && <SignatureForm key={signing.id} account={signing} html={html(signing)} onDone={() => setSigning(null)} />}
      </FormLayer>
      <FormLayer open={editing !== null} onClose={() => setEditing(null)}>
        {editing !== null && <TemplateForm key={editing === "new" ? "new" : editing.id} template={editing === "new" ? null : editing} onDone={() => setEditing(null)} />}
      </FormLayer>
    </div>
  )
}

/** A signature, in the form layer: the rich-text field and its format bar; SAVE. Saved empty, the account has none. */
function SignatureForm({ account, html, onDone }: { account: Account; html: string; onDone: () => void }) {
  const editor = useRichEditor({ html, placeholder: "No signature", focusFirst: true, label: `Signature for ${account.address}`, compact: true })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const now = () => (editor.isEmpty ? "" : editor.getHTML())
  // The editor's own form of what it opened with, so an untouched signature never asks.
  const [opened] = useState(now)
  useLeaveGuard(() => now() !== opened)
  return (
    <FormLayerForm
      overline="Signature"
      title={account.displayName}
      primary={{ label: "Save", loading: saving }}
      error={error}
      onSubmit={async () => {
        setSaving(true)
        setError(null)
        try {
          await (await getCoreClient()).setSignature(account.id, now())
          onDone()
        } catch (e) {
          setError(said(e))
        } finally {
          setSaving(false)
        }
      }}
    >
      <RichEditor editor={editor} label={account.address} bar={<FormatBar editor={editor} />} />
    </FormLayerForm>
  )
}

/** A template, in the form layer: NAME, SUBJECT and the text; SAVE TEMPLATE. */
function TemplateForm({ template, onDone }: { template: Template | null; onDone: () => void }) {
  const [name, setName] = useState(template?.name ?? "")
  const [subject, setSubject] = useState(template?.subject ?? "")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const editor = useRichEditor({ html: template?.html ?? "", placeholder: "Write the template", focusFirst: false, label: "Template text", compact: true })
  const text = () => (editor.isEmpty ? "" : editor.getHTML())
  const [opened] = useState(text)
  useLeaveGuard(() => name !== (template?.name ?? "") || subject !== (template?.subject ?? "") || text() !== opened)
  return (
    <FormLayerForm
      overline={template ? "Template" : "New template"}
      title={name.trim() || (template ? "Template" : "New template")}
      primary={{ label: "Save template", disabled: !name.trim(), loading: saving }}
      error={error}
      onSubmit={async () => {
        setSaving(true)
        setError(null)
        try {
          await (await getCoreClient()).saveTemplate({ id: template?.id ?? null, name, subject, html: editor.getHTML() })
          onDone()
        } catch (e) {
          setError(said(e))
        } finally {
          setSaving(false)
        }
      }}
    >
      <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} data-form-focus="" />
      <TextField label="Subject" helper="Fills an empty subject." value={subject} onChange={(e) => setSubject(e.target.value)} />
      <RichEditor editor={editor} label="Text" bar={<FormatBar editor={editor} />} />
    </FormLayerForm>
  )
}
