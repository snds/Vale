import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"

import { type QuickContext, useUi } from "@/app/ui-store"
import { AdaptiveDialog, Button, SectionHeader, toast } from "@unicron/ui"
import { getCoreClient, isMember } from "@/core/client"
import { useLinkedNotes } from "@/core/queries"

import { NoteRow } from "./note-row"

/** A draft: the words, and whether it stays linked to what is open. */
interface Draft {
  text: string
  linked: boolean
}

/**
 * Quick Note (ADR-0037; brief N7): jot something about what is open, without
 * leaving it. An `AdaptiveDialog` (form 640), a sheet on a phone.
 *
 * - Header: `QUICK NOTE // {WHAT IS OPEN}` with UNLINK beside it, the title
 *   "Quick note", and close.
 * - Free text with no box: the first line is the title.
 * - HERE ALREADY: the notes that link to what is open, as rows.
 * - One primary, DONE. Closing any other way saves too; an empty note is
 *   just dropped. The toast "Saved to Notes" has OPEN.
 *
 * Reached by ⌥N, quick create, ⌘K, and QUICK NOTE in a conversation, an
 * event or a person. Never for a team member: notes are the owner's.
 */
export function QuickNote() {
  const state = useUi((s) => s.quickNote)
  const close = useUi((s) => s.closeQuickNote)
  const target = state?.target ?? null
  const [draft, setDraft] = useState<Draft>({ text: "", linked: true })
  const save = useSaveQuickNote()
  const opened = !!state

  const linkedTo = target && draft.linked ? target : null
  const finish = () => {
    if (!state) return
    if (draft.text.trim()) void save(draft.text, linkedTo)
    // The next opening starts fresh, linked to what is open then.
    setDraft({ text: "", linked: true })
    close()
  }

  // ⌥N, from anywhere but a text field (where it may be typing a character).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "KeyN" || !e.altKey || e.metaKey || e.ctrlKey || e.shiftKey) return
      const t = e.target as HTMLElement
      if (t.closest("input, textarea, select, [contenteditable=true]")) return
      if (isMember()) return
      e.preventDefault()
      if (!useUi.getState().quickNote) useUi.getState().openQuickNote()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  return (
    <AdaptiveDialog
      open={opened}
      onOpenChange={(o) => !o && finish()}
      size="form"
      // A press outside saves, as closing does; it never loses the words.
      overline={
        <QuickOverline
          target={target}
          linked={draft.linked}
          onToggle={() => {
            setDraft((d) => ({ ...d, linked: !d.linked }))
            // Back to the words: UNLINK is a side step, not where the writing goes on.
            document.querySelector<HTMLElement>("[data-quick-note-text]")?.focus()
          }}
        />
      }
      title="Quick note"
      initialFocus={() => document.querySelector<HTMLElement>("[data-quick-note-text]") ?? true}
      footer={<Button onClick={finish}>Done</Button>}
    >
      {state && <QuickNoteBody target={target} linked={draft.linked} text={draft.text} onText={(text) => setDraft((d) => ({ ...d, text }))} onDone={finish} />}
    </AdaptiveDialog>
  )
}

/** The name the saved link will carry (a conversation's first subject, say), so the overline matches it. */
function useLinkLabel(target: QuickContext | null) {
  const { data: link } = useQuery({
    queryKey: ["notes", "link", target?.kind, target?.id],
    queryFn: async () => (await getCoreClient()).noteLinkFor({ kind: target!.kind, id: target!.id }),
    enabled: !!target,
  })
  return link?.label || target?.label || ""
}

/** `QUICK NOTE // {WHAT IS OPEN}`, and UNLINK beside it (LINK again once unlinked). */
function QuickOverline({ target, linked, onToggle }: { target: QuickContext | null; linked: boolean; onToggle: () => void }) {
  const label = useLinkLabel(target)
  if (!target) return <>Quick note</>
  return (
    <span className="quick-note-overline">
      <span className="min-w-0 truncate" data-role="quick-note-about">
        {linked && label ? `Quick note // ${label}` : "Quick note"}
      </span>
      <Button type="button" variant="ghost" size="xs" onClick={onToggle} aria-label={linked ? `Unlink ${label || "this"}` : `Link to ${label || "this"}`}>
        {linked ? "Unlink" : "Link"}
      </Button>
    </span>
  )
}

/** How many linked notes the quick note lists before MORE (Vale 68). */
const HERE_SHOWN = 3

function QuickNoteBody({ target, linked, text, onText, onDone }: { target: QuickContext | null; linked: boolean; text: string; onText: (t: string) => void; onDone: () => void }) {
  const { data: here = [] } = useLinkedNotes(target ? { kind: target.kind, id: target.id } : null)
  const jumpTo = useUi((s) => s.jumpTo)
  return (
    <>
      <textarea
        data-quick-note-text
        aria-label="Quick note"
        placeholder="The first line is the title."
        className="quick-note-text"
        value={text}
        onChange={(e) => onText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            onDone()
          }
        }}
      />
      {target && linked && here.length > 0 && (
        <section aria-label="Here already" className="flex flex-col">
          <SectionHeader title="Here already" count={here.length} level={3} />
          <div role="list" aria-label="Notes here already" className="flex flex-col">
            {/* Three at most (Vale 68): a quick note's dialog should not grow with every linked note. */}
            {here.slice(0, HERE_SHOWN).map((n) => (
              <div role="listitem" key={n.id}>
                <NoteRow
                  note={n}
                  onOpen={() => {
                    // Opening one saves what was typed here first, as closing does.
                    onDone()
                    jumpTo({ kind: "note", id: n.id })
                  }}
                />
              </div>
            ))}
          </div>
          {here.length > HERE_SHOWN && (
            <div className="pt-2">
              {/* MORE opens the full list, which lives on the item itself, saving what was typed first. */}
              <Button
                type="button"
                variant="link"
                size="inline"
                aria-label={`More notes here: open ${target.label}`}
                onClick={() => {
                  onDone()
                  jumpTo({ kind: target.kind, id: target.id })
                }}
              >
                More
              </Button>
            </div>
          )}
        </section>
      )}
    </>
  )
}

function useSaveQuickNote() {
  const qc = useQueryClient()
  const jumpTo = useUi((s) => s.jumpTo)
  return async (text: string, target: QuickContext | null) => {
    try {
      const core = await getCoreClient()
      const link = target ? await core.noteLinkFor({ kind: target.kind, id: target.id }) : null
      const n = await core.createNote({ markdown: text.trim(), links: link ? [link] : [] })
      await qc.invalidateQueries({ queryKey: ["notes"] })
      toast("Saved to Notes", { action: { label: "Open", onClick: () => jumpTo({ kind: "note", id: n.id }) } })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    }
  }
}
