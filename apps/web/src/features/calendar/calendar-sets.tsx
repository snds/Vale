import { useState } from "react"

import { FormLayer, FormLayerForm } from "@/components/editor-frame"
import { TextField, toast } from "@unicron/ui"
import { usePimAction } from "@/core/queries"
import { useLeaveGuard } from "@/lib/leave-guard"

import { useSavingSet } from "./use-sets"

/**
 * "Save as set…": the form that names what is showing (ADR-0021; brief C5),
 * in the form layer (ADR-0087): SET NAME, then SAVE SET. The calendar view
 * mounts it; the calendars list's row opens it (`use-sets.ts`).
 */
export function SaveSetLayer() {
  const open = useSavingSet((s) => s.open)
  const close = () => useSavingSet.setState({ open: false })
  return (
    <FormLayer open={open} onClose={close}>
      {open && <SetNameFields onDone={close} />}
    </FormLayer>
  )
}

function SetNameFields({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("")
  const [error, setError] = useState<string | null>(null)
  const save = usePimAction((c, name: string) => c.saveCalendarSet(name))
  useLeaveGuard(name.trim() !== "")
  const submit = () => {
    const set = name.trim()
    if (!set) return
    setError(null)
    save.mutate(set, {
      onSuccess: () => {
        toast(`Saved ${set}`)
        onDone()
      },
      // A failed save keeps the form open, with the server's words above the actions (brief 4.0).
      onError: (e) => setError(e instanceof Error ? e.message : String(e)),
    })
  }
  return (
    <FormLayerForm overline="New set" title={name.trim() || "New set"} primary={{ label: "Save set", disabled: !name.trim(), loading: save.isPending }} error={error} onSubmit={submit}>
      <p className="type-body text-text-secondary">The calendars showing now, under one name. Picking the set shows exactly those again.</p>
      <TextField label="Set name" value={name} onChange={(e) => setName(e.target.value)} data-form-focus="" autoComplete="off" />
    </FormLayerForm>
  )
}
