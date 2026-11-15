import { Badge, Button, DropdownMenuItem, ListRow, ToggleRow } from "@unicron/ui"
import { useMailAction, useScreener, useSenders } from "@/core/queries"
import type { Category, Sender } from "@/core/types"
import { CATEGORIES } from "@/features/mail/lanes"
import { useSettingSave } from "@/features/settings/save"
import { SaveFailed } from "@/features/settings/save-failed"
import { SettingBlock } from "@/features/settings/setting-block"

type Undo = "decision" | "category"

/** A decision and the words that take it back (brief T2). */
interface Decided {
  undo: Undo
  /** The tag on the row. */
  tag: string
  /** The trailing action, or its item in the row's menu. */
  action: string
}

const categoryName = (c: Category) => CATEGORIES.find((x) => x.id === c)?.label ?? c

/** What was decided about a sender, the decision first: a sender with two has the second in the row's menu. */
function decided(s: Sender): Decided[] {
  const out: Decided[] = []
  if (s.decision === "blocked") out.push({ undo: "decision", tag: "Blocked", action: "Unblock" })
  if (s.decision === "screened_out") out.push({ undo: "decision", tag: "Screened out", action: "Let in again" })
  if (s.category) out.push({ undo: "category", tag: `Always in ${categoryName(s.category)}`, action: "Reset category" })
  return out
}

/**
 * Settings › Mail › SCREENER (brief T2; ADR-0018, ADR-0110): the switch,
 * then the senders you decided about, each with the way back. Saves at once
 * and silently; a failure shows its line under the row.
 */
export function ScreenerSettingsSection() {
  const { data: status } = useScreener()
  const { data: senders = [] } = useSenders()
  const toggle = useMailAction<boolean>((c, on) => c.setScreener(on))
  const forget = useMailAction<{ email: string; what: Undo }>((c, a) => (a.what === "decision" ? c.decideSender(a.email, null) : c.setSenderCategory(a.email, null)))
  const save = useSettingSave()
  if (!status) return null
  const listed = senders.filter((s) => decided(s).length)
  return (
    <>
      <SettingBlock title="Screener">
        <ToggleRow label="Screener" description="New senders wait for your yes." checked={status.enabled} onCheckedChange={(on) => save.run("screener", toggle.mutateAsync(on))} />
        <SaveFailed message={save.failed("screener")} />
      </SettingBlock>
      {listed.length > 0 && (
        <SettingBlock title="Senders you decided" count={listed.length}>
          <ul aria-label="Senders you decided" className="flex flex-col">
            {listed.map((s) => (
              <li key={s.email}>
                <SenderRow sender={s} onUndo={(what) => save.run(`sender:${s.email}`, forget.mutateAsync({ email: s.email, what }))} />
                <SaveFailed message={save.failed(`sender:${s.email}`)} />
              </li>
            ))}
          </ul>
        </SettingBlock>
      )}
    </>
  )
}

function SenderRow({ sender: s, onUndo }: { sender: Sender; onUndo: (what: Undo) => void }) {
  const [first, second] = decided(s)
  const name = s.name || s.email
  return (
    <ListRow
      size="compact"
      title={name}
      meta={s.name ? s.email : undefined}
      metaStyle="plain"
      badge={
        <span className="flex flex-wrap gap-2">
          {first && <Badge>{first.tag}</Badge>}
          {second && <Badge>{second.tag}</Badge>}
        </span>
      }
      action={
        first && (
          <Button variant="ghost" size="sm" aria-label={`${first.action}, ${name}`} onClick={() => onUndo(first.undo)}>
            {first.action}
          </Button>
        )
      }
      menu={second ? <DropdownMenuItem onClick={() => onUndo(second.undo)}>{second.action}</DropdownMenuItem> : undefined}
      menuLabel={second ? "More actions" : undefined}
    />
  )
}
