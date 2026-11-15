import { useQuery } from "@tanstack/react-query"
import { useId, useState } from "react"

import { AdaptiveDialog, AdaptiveMenu, AdaptiveMenuRadioGroup, AdaptiveMenuRadioItem, Button, FieldRow, FieldRowAction, Icon, SectionHeader, Skeleton, toast, useAppFrame } from "@unicron/ui"
import { getCoreClient } from "@/core/client"
import { usePimAction } from "@/core/queries"

const fail = (e: unknown) => toast.error(e instanceof Error ? e.message : String(e))

const POINTS = [
  { label: "10 minutes ago", secs: 600 },
  { label: "An hour ago", secs: 3600 },
  { label: "Yesterday", secs: 86_400 },
  { label: "A week ago", secs: 7 * 86_400 },
  { label: "30 days ago", secs: 30 * 86_400 },
] as const
/** The brief's pick (P5): RESTORE TO starts at Yesterday. */
const FIRST = 2

/** A short list of names: "Ana, Sam and 3 more". */
const few = (names: string[]) => {
  if (names.length <= 2) return names.join(" and ")
  if (names.length === 3) return `${names[0]}, ${names[1]} and ${names[2]}`
  return `${names.slice(0, 2).join(", ")} and ${names.length - 2} more`
}

const NOTHING = "No contacts changed since then."

/**
 * Restore contacts (brief P5): every contact back the way it was at a point
 * in time, undoing edits, deletes and additions from here or from a sync
 * (Google Contacts' "Undo changes"). A form-size layer (a sheet on a phone),
 * opened by its intent (`openRestoreContacts`). It shows what it will do,
 * by name, first; the restore itself can be undone.
 */
export function RestoreContactsLayer({ openedAt, onClose }: { openedAt: number | null; onClose: () => void }) {
  const [shown, setShown] = useState(openedAt)
  // The last moment stays while the layer closes, so its words don't blank out as it fades.
  if (openedAt !== null && openedAt !== shown) setShown(openedAt)
  const at = openedAt ?? shown
  return at === null ? null : <RestoreForm key={at} open={openedAt !== null} openedAt={at} onDone={onClose} />
}

/** `openedAt`: Unix seconds when it opened, so "an hour ago" means an hour before that. */
function RestoreForm({ open, openedAt, onDone }: { open: boolean; openedAt: number; onDone: () => void }) {
  const phone = useAppFrame().phone
  const [pick, setPick] = useState<number>(FIRST)
  // Fixed when chosen, so the preview and the restore agree.
  const since = openedAt - POINTS[pick]!.secs
  const { data: plan, isPending } = useQuery({
    queryKey: ["pim", "restore-preview", since],
    queryFn: async () => (await getCoreClient()).contactsRestorePreview({ since }),
  })
  const restore = usePimAction((c, point: { since?: number; after?: number }) => c.restoreContacts(point))
  const total = plan ? plan.added.length + plan.edited.length + plan.deleted.length : 0
  const when = POINTS[pick]!.label

  const run = async () => {
    try {
      const done = await restore.mutateAsync({ since })
      onDone()
      toast(`Restored ${done.changed} ${done.changed === 1 ? "contact" : "contacts"} to ${when.toLowerCase()}`, {
        // The layer is gone by now; the core's pim:changed refreshes the lists.
        action: { label: "Undo", onClick: () => void getCoreClient().then((c) => c.restoreContacts({ after: done.mark })).catch(fail) },
      })
    } catch (e) {
      fail(e)
    }
  }

  // Nothing changed: the line under WHAT CHANGES is RESTORE's visible reason (decisions §14).
  const nothing = !isPending && !!plan && total === 0
  const reasonId = useId()
  const rows = [
    { label: "Puts back", names: plan?.edited ?? [] },
    { label: "Brings back", names: plan?.deleted ?? [] },
    { label: "Removes", names: plan?.added ?? [], description: "They go to Recently deleted." },
  ].filter((r) => r.names.length > 0)
  const size = phone ? "stacked" : "default"

  return (
    <AdaptiveDialog
      open={open}
      onOpenChange={(o) => !o && onDone()}
      size="form"
      overline="Contacts"
      title="Restore contacts"
      description="Puts every contact back the way it was then."
      footer={
        <>
          <Button variant="secondary" onClick={onDone}>
            Cancel
          </Button>
          <Button disabled={total === 0 || isPending} focusableWhenDisabled aria-describedby={nothing ? reasonId : undefined} loading={restore.isPending} onClick={() => void run()}>
            Restore
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-8">
        <FieldRow
          size={size}
          label="Restore to"
          action={
            <AdaptiveMenu title="Restore to" align="end" trigger={<FieldRowAction>Change</FieldRowAction>}>
              <AdaptiveMenuRadioGroup value={String(pick)} onValueChange={(v) => setPick(Number(v))}>
                {POINTS.map((p, i) => (
                  <AdaptiveMenuRadioItem key={p.label} value={String(i)}>
                    {p.label}
                  </AdaptiveMenuRadioItem>
                ))}
              </AdaptiveMenuRadioGroup>
            </AdaptiveMenu>
          }
        >
          {when}
        </FieldRow>
        <section className="flex flex-col" aria-label="What changes" aria-busy={isPending}>
          <SectionHeader title="What changes" level={3} />
          {isPending ? (
            <div aria-hidden data-slot="restore-checking">
              <Skeleton variant="row" />
              <Skeleton variant="row" />
              <Skeleton variant="row" />
            </div>
          ) : total === 0 ? (
            <p id={reasonId} className="pt-4 type-body text-muted-foreground">
              {NOTHING}
            </p>
          ) : (
            rows.map((r) => (
              <FieldRow key={r.label} size={size} label={r.label} description={r.description}>
                {few(r.names)}
              </FieldRow>
            ))
          )}
          {plan && plan.readOnly > 0 && (
            <p className="flex items-center gap-2 pt-4 type-caption text-muted-foreground">
              <Icon name="locked" size="sm" aria-hidden />
              {plan.readOnly} {plan.readOnly === 1 ? "change is" : "changes are"} in an address book you can't edit, so {plan.readOnly === 1 ? "it stays as it is" : "they stay as they are"}.
            </p>
          )}
        </section>
      </div>
    </AdaptiveDialog>
  )
}
