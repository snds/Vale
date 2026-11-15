import {
  AdaptiveMenu,
  AdaptiveMenuRadioGroup,
  AdaptiveMenuRadioItem,
  FieldRow,
  FieldRowAction,
  FilterChip,
  FilterChipGroup,
  RadioGroup,
  RadioRow,
  ToggleRow,
} from "@unicron/ui"
import { useMailPrefs, useSetMailPrefs } from "@/core/queries"
import type { MailPrefs } from "@/core/types"
import { UNDO_SECONDS } from "@/features/mail/format"
import { useSettingSave } from "@/features/settings/save"
import { SaveFailed } from "@/features/settings/save-failed"
import { useRowSize } from "@/features/settings/row-size"
import { SettingBlock } from "@/features/settings/setting-block"

const IMAGES: { value: MailPrefs["images"]; label: string; hint: string }[] = [
  { value: "ask", label: "Ask", hint: "Blocked until you load them, message by message. Images can tell a sender you opened their mail, and when." },
  { value: "contacts", label: "From contacts", hint: "Loaded for people in your contacts; asked for everyone else." },
  { value: "always", label: "Always", hint: "Every message loads its images. Senders can see when you open their mail." },
]

const MARK_READ: { value: MailPrefs["markRead"]; label: string; hint: string }[] = [
  { value: "open", label: "On open", hint: "Opening a conversation marks it read." },
  { value: "delay", label: "After 3 s", hint: "A glance doesn't count." },
  { value: "manual", label: "Manually", hint: "Only Mark read, its swipe or its key marks it read." },
]

/** The intervals the core snaps to (ADR-0055). */
const CHECK = [2, 5, 15, 30, 60]
const every = (m: number) => (m === 60 ? "Every hour" : `Every ${m} minutes`)

/**
 * Settings › Mail, the rows before the Screener (brief T2; ADR-0110):
 * READING, REPLYING, SENDING and CHECKING. Every row saves at once and
 * silently; a failed save leaves the control on its stored value with the
 * server's words under the row (ADR-0104).
 */
export function AdvancedMail() {
  const { data: prefs } = useMailPrefs()
  const set = useSetMailPrefs()
  const save = useSettingSave()
  const size = useRowSize()
  if (!prefs) return null
  const change = (p: Partial<MailPrefs>) => save.run(Object.keys(p)[0]!, set.mutateAsync({ ...prefs, ...p }))
  const markRead = MARK_READ.find((o) => o.value === prefs.markRead)

  return (
    <>
      <SettingBlock title="Reading">
        <FieldRow size="stacked" label="Remote images">
          <RadioGroup aria-label="Remote images" value={prefs.images} onValueChange={(images) => change({ images: images as MailPrefs["images"] })}>
            {IMAGES.map((o, i) => (
              <RadioRow key={o.value} value={o.value} label={o.label} description={o.hint} rule={i === 0 ? "none" : "top"} />
            ))}
          </RadioGroup>
        </FieldRow>
        <SaveFailed message={save.failed("images")} />
        <FieldRow size={size} label="Mark as read" description={markRead?.hint}>
          <FilterChipGroup label="Mark as read" value={prefs.markRead} onValueChange={(markRead) => change({ markRead: markRead as MailPrefs["markRead"] })}>
            {MARK_READ.map((o) => (
              <FilterChip key={o.value} value={o.value}>
                {o.label}
              </FilterChip>
            ))}
          </FilterChipGroup>
        </FieldRow>
        <SaveFailed message={save.failed("markRead")} />
      </SettingBlock>

      <SettingBlock title="Replying">
        <ToggleRow label="Quote the message" description="Under an “On … wrote:” line." checked={prefs.quote} onCheckedChange={(quote) => change({ quote })} />
        <SaveFailed message={save.failed("quote")} />
        <ToggleRow
          label="Write below the quote"
          description="The way mailing lists prefer."
          checked={prefs.quote && prefs.replyBelow}
          disabledReason={prefs.quote ? undefined : "Needs Quote the message."}
          onCheckedChange={(replyBelow) => change({ replyBelow })}
        />
        <SaveFailed message={save.failed("replyBelow")} />
        <ToggleRow
          label="Ask for read receipts"
          description="On everything you send. You can change it per message."
          checked={prefs.requestReceipts}
          onCheckedChange={(requestReceipts) => change({ requestReceipts })}
        />
        <SaveFailed message={save.failed("requestReceipts")} />
      </SettingBlock>

      {/* A fact: the core has no setting for it (W4). */}
      <SettingBlock title="Sending">
        <FieldRow size={size} label="Undo send">
          {`${UNDO_SECONDS} seconds`}
        </FieldRow>
      </SettingBlock>

      <SettingBlock title="Checking">
        <FieldRow
          size={size}
          label="Check for new mail"
          description="For accounts without push. With push, new mail arrives within seconds either way."
          action={
            <AdaptiveMenu title="Check for new mail" trigger={<FieldRowAction>Change</FieldRowAction>}>
              <AdaptiveMenuRadioGroup value={String(prefs.checkMinutes)} onValueChange={(v) => change({ checkMinutes: Number(v) })}>
                {CHECK.map((m) => (
                  <AdaptiveMenuRadioItem key={m} value={String(m)}>
                    {every(m)}
                  </AdaptiveMenuRadioItem>
                ))}
              </AdaptiveMenuRadioGroup>
            </AdaptiveMenu>
          }
        >
          {every(prefs.checkMinutes)}
        </FieldRow>
        <SaveFailed message={save.failed("checkMinutes")} />
      </SettingBlock>
    </>
  )
}
