import { useState } from "react"

import { useUi } from "@/app/ui-store"
import { FormLayer, FormLayerForm } from "@/components/editor-frame"
import { Button, ChipField, TextField, ToggleRow, toast } from "@unicron/ui"
import { useContactLabels, usePimAction } from "@/core/queries"
import type { SmartGroup, SmartGroupInput } from "@/core/types"
import { getCoreClient } from "@/core/client"
import { useLeaveGuard } from "@/lib/leave-guard"

import { useSmartGroupEditor } from "./open-smart-group"

const fail = (e: unknown) => toast.error(e instanceof Error ? e.message : String(e))

/** A list of names as a sentence: "Clay club, Family and Work". */
const listed = (names: string[]) => (names.length < 2 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`)

/**
 * Smart groups keep their own members by rule (ADR-0023). Contacts mounts
 * this; a saved group becomes the place, a deleted one gives way to everyone.
 */
export function SmartGroupEditor() {
  const editing = useSmartGroupEditor((s) => s.editing)
  const close = () => useSmartGroupEditor.setState({ editing: null })
  return (
    <FormLayer open={editing !== null} onClose={close}>
      {editing && (
        <SmartGroupForm
          key={editing.group?.id ?? "new"}
          group={editing.group}
          onDone={(id) => {
            close()
            if (id !== undefined) useUi.getState().setContactsPlace(id ? { kind: "group", id } : { kind: "all" })
          }}
        />
      )}
    </FormLayer>
  )
}

/**
 * Deleting a group changes no card, and the code can make it again from its
 * rule, so it does not ask (decisions §10): the toast's UNDO saves the same
 * rule as a new group and opens it.
 */
async function deleteGroup(group: SmartGroup) {
  const core = await getCoreClient()
  await core.deleteSmartGroup(group.id)
  const { id: _id, count: _count, ...rule } = group
  toast(`Deleted ${group.name}`, {
    description: "Nobody in it was changed",
    action: {
      label: "Undo",
      onClick: () =>
        void core
          .saveSmartGroup(null, rule)
          .then((back) => useUi.getState().setContactsPlace({ kind: "group", id: back.id }))
          .catch(fail),
    },
  })
}

/**
 * The smart group form (ADR-0102; brief P1), in the form layer: a name, then
 * what a card must match. Every field filled in must match; an empty one is
 * left out.
 */
function SmartGroupForm({ group, onDone }: { group?: SmartGroup; onDone: (picked?: string | null) => void }) {
  const { data: labels = [] } = useContactLabels()
  const [name, setName] = useState(group?.name ?? "")
  const [picked, setPicked] = useState<string[]>(group?.labels ?? [])
  const [company, setCompany] = useState(group?.company ?? "")
  const [domain, setDomain] = useState(group?.domain ?? "")
  const [hasPhone, setHasPhone] = useState(group?.hasPhone ?? false)
  const [hasBirthday, setHasBirthday] = useState(group?.hasBirthday ?? false)
  const [days, setDays] = useState<number | null>(group?.inTouchDays ?? null)
  const save = usePimAction((c, input: SmartGroupInput) => c.saveSmartGroup(group?.id ?? null, input))
  const remove = usePimAction((_c, g: SmartGroup) => deleteGroup(g))
  // Closing asks first once a value differs from when the form opened (ADR-0087).
  const values = JSON.stringify([name, picked, company, domain, hasPhone, hasBirthday, days])
  const [opened] = useState(values)
  useLeaveGuard(values !== opened)
  const inUse = labels.map((l) => l.name)

  const [error, setError] = useState<string | null>(null)
  const submit = async () => {
    setError(null)
    try {
      const g = await save.mutateAsync({
        name,
        labels: picked,
        company: company.trim() || null,
        domain: domain.trim() || null,
        hasPhone,
        hasBirthday,
        inTouchDays: days && days > 0 ? days : null,
      })
      // Saved, the group opens: its head says what it holds, so no toast.
      onDone(g.id)
    } catch (e) {
      // The form stays open with the server's words above its actions.
      setError(e instanceof Error ? e.message : String(e))
    }
  }
  const del = async () => {
    try {
      await remove.mutateAsync(group!)
      onDone(null)
    } catch (e) {
      fail(e)
    }
  }
  return (
    <FormLayerForm
      overline={group ? "Smart group" : "New smart group"}
      title={name.trim() || (group ? "Smart group" : "New smart group")}
      primary={{ label: group ? "Save" : "Create group", loading: save.isPending }}
      error={error}
      onSubmit={() => void submit()}
      footerStart={
        group && (
          <Button type="button" variant="ghost" onClick={() => void del()} loading={remove.isPending}>
            Delete
          </Button>
        )
      }
    >
      <p className="type-body text-text-secondary">People join and leave as their cards change. They must match everything you fill in.</p>
      <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} data-form-focus="" autoComplete="off" />
      <ChipField
        label="Has any of these labels"
        value={picked}
        onValueChange={setPicked}
        helper={inUse.length ? `In use: ${listed(inUse)}.` : "No card has a label yet."}
      />
      <TextField label="Company" value={company} onChange={(e) => setCompany(e.target.value)} autoComplete="off" />
      <TextField label="Email domain" value={domain} onChange={(e) => setDomain(e.target.value)} helper="Subdomains count too." autoComplete="off" spellCheck={false} />
      <div className="flex flex-col">
        <ToggleRow label="Has a phone number" checked={hasPhone} onCheckedChange={setHasPhone} />
        <ToggleRow label="Has a birthday" checked={hasBirthday} onCheckedChange={setHasBirthday} rule="both" />
      </div>
      <TextField type="number" label="In touch within" value={days} onValueChange={setDays} min={1} max={3650} helper="Days with mail either way. Leave it empty for any time." />
    </FormLayerForm>
  )
}
