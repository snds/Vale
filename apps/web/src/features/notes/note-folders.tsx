import { useState } from "react"

import { useUi } from "@/app/ui-store"
import { FormLayer, FormLayerForm } from "@/components/editor-frame"
import { AdaptiveMenu, AdaptiveMenuRadioGroup, AdaptiveMenuRadioItem, Button, ChipField, FieldRow, FieldRowAction, TextField, ToggleRow, toast, useAppFrame } from "@unicron/ui"
import { useNoteAction, useNoteTags } from "@/core/queries"
import type { NoteFolder, NoteFolderInput } from "@/core/types"
import { useLeaveGuard } from "@/lib/leave-guard"

import { useNoteFolderEditor } from "./open-note-folder"
import { SwatchChoice } from "./swatch-picker"

const fail = (e: unknown) => toast.error(e instanceof Error ? e.message : String(e))

type Linked = NoteFolderInput["linked"]
const NO_LINK = "none"
/** LINKED TO's choices, in the order the brief gives them (N1). */
const LINKED: [Exclude<Linked, null> | typeof NO_LINK, string][] = [
  [NO_LINK, "It doesn't matter"],
  ["any", "Anything"],
  ["event", "An event"],
  ["contact", "A person"],
  ["thread", "A conversation"],
]
const linkedLabel = (l: Linked) => LINKED.find(([v]) => v === (l ?? NO_LINK))![1]

/** A tag as typed: without its #, and with nothing left it is no tag. */
const parseTag = (text: string) => text.trim().replace(/^#+/, "").trim() || null

/**
 * Smart folders are saved searches that fill themselves (ADR-0042; brief N1,
 * ADR-0105). Notes mounts this; a saved folder becomes the place, a deleted
 * one gives way to all notes, and UNDO brings it back.
 */
export function NoteFolderEditor() {
  const editing = useNoteFolderEditor((s) => s.editing)
  const close = () => useNoteFolderEditor.setState({ editing: null })
  return (
    <FormLayer open={editing !== null} onClose={close}>
      {editing && (
        <NoteFolderForm
          key={editing.folder?.id ?? "new"}
          folder={editing.folder}
          onDone={(id) => {
            close()
            if (id !== undefined) useUi.getState().setNotesFolder(id ? { kind: "folder", id } : { kind: "all" })
          }}
        />
      )}
    </FormLayer>
  )
}

function NoteFolderForm({ folder, onDone }: { folder?: NoteFolder; onDone: (picked?: string | null) => void }) {
  const { data: tags = [] } = useNoteTags()
  const phone = useAppFrame().phone
  const [name, setName] = useState(folder?.name ?? "")
  const [picked, setPicked] = useState<string[]>(folder?.tags ?? [])
  const [words, setWords] = useState(folder?.words ?? "")
  const [linked, setLinked] = useState<Linked>(folder?.linked ?? null)
  const [color, setColor] = useState<NoteFolderInput["color"]>(folder?.color ?? null)
  const [hasReminder, setHasReminder] = useState(folder?.hasReminder ?? false)
  const [hasOpenTasks, setHasOpenTasks] = useState(folder?.hasOpenTasks ?? false)
  const save = useNoteAction((c, args: { id: string | null; input: NoteFolderInput }) => c.saveNoteFolder(args.id, args.input))
  const remove = useNoteAction<void>((c) => c.deleteNoteFolder(folder!.id))
  // Closing asks first once a value differs from when the form opened (ADR-0087).
  const values = JSON.stringify([name, picked, words, linked, color, hasReminder, hasOpenTasks])
  const [opened] = useState(values)
  useLeaveGuard(values !== opened)
  // The tags in use, as the line under the field: what can be typed and match something now.
  const inUse = tags.map((t) => `#${t.tag}`).join(", ")

  const [error, setError] = useState<string | null>(null)
  const submit = async () => {
    setError(null)
    try {
      const f = await save.mutateAsync({ id: folder?.id ?? null, input: { name, tags: picked, words: words.trim() || null, linked, color, hasReminder, hasOpenTasks } })
      // Toasts name the thing, with no full stop (cross-app decisions §12).
      toast.success(folder ? `Saved ${f.name}` : `Created ${f.name}`, { duration: 4000 })
      onDone(f.id)
    } catch (e) {
      // The form stays open with the server's words above its actions.
      setError(e instanceof Error ? e.message : String(e))
    }
  }
  const del = async () => {
    const gone = folder!
    const wasOpen = (() => {
      const f = useUi.getState().notesPlace.folder
      return f.kind === "folder" && f.id === gone.id
    })()
    try {
      await remove.mutateAsync()
      onDone(null)
      // The core has no undelete: UNDO saves the same rules again, as a folder of the same name.
      const input: NoteFolderInput = { name: gone.name, tags: gone.tags, words: gone.words, linked: gone.linked, color: gone.color, hasReminder: gone.hasReminder, hasOpenTasks: gone.hasOpenTasks }
      toast(`Deleted ${gone.name}`, {
        description: "Its notes are still in Notes",
        duration: 6000,
        action: {
          label: "Undo",
          onClick: () =>
            void save
              .mutateAsync({ id: null, input })
              .then((f) => {
                if (wasOpen) useUi.getState().setNotesFolder({ kind: "folder", id: f.id })
              })
              .catch(fail),
        },
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }
  return (
    <FormLayerForm
      overline={folder ? "Smart folder" : "New smart folder"}
      title={name.trim() || (folder ? "Smart folder" : "New smart folder")}
      primary={{ label: folder ? "Save" : "Create folder", loading: save.isPending }}
      error={error}
      onSubmit={() => void submit()}
      footerStart={
        folder && (
          <Button type="button" variant="ghost-destructive" loading={remove.isPending} onClick={() => void del()}>
            Delete
          </Button>
        )
      }
    >
      <p className="type-caption text-support-foreground">Notes join and leave as you write. They must match everything you fill in.</p>
      <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} data-form-focus="" />
      <ChipField
        label="Has any of these tags"
        value={picked}
        onValueChange={setPicked}
        parse={parseTag}
        removeLabel={(t) => `Remove #${t}`}
        helper={inUse ? `In use: ${inUse}` : undefined}
      />
      <TextField label="Has the words" value={words} onChange={(e) => setWords(e.target.value)} />
      <FieldRow
        label="Linked to"
        size={phone ? "stacked" : "default"}
        rule="none"
        action={
          <AdaptiveMenu title="Linked to" trigger={<FieldRowAction>Change</FieldRowAction>}>
            <AdaptiveMenuRadioGroup value={linked ?? NO_LINK} onValueChange={(v) => setLinked(v === NO_LINK ? null : (v as Linked))}>
              {LINKED.map(([v, label]) => (
                <AdaptiveMenuRadioItem key={v} value={v}>
                  {label}
                </AdaptiveMenuRadioItem>
              ))}
            </AdaptiveMenuRadioGroup>
          </AdaptiveMenu>
        }
      >
        {linkedLabel(linked)}
      </FieldRow>
      <SwatchChoice label="Color" value={color} onValueChange={setColor} />
      <div className="flex flex-col">
        <ToggleRow label="Has a reminder" checked={hasReminder} onCheckedChange={setHasReminder} />
        <ToggleRow label="Has to-dos left" checked={hasOpenTasks} onCheckedChange={setHasOpenTasks} rule="both" />
      </div>
    </FormLayerForm>
  )
}
