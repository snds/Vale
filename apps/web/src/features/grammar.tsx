import { useState, type KeyboardEvent, type ReactNode } from "react"

import { AdaptiveMenu, AdaptiveMenuItem, AdaptiveMenuRadioGroup, AdaptiveMenuRadioItem, Button, FieldRow, FieldRowAction, FieldRowValue, Kbd, SwipeAction, type IconName, type SwipeActionTone, toast } from "@unicron/ui"
import { isMember } from "@/core/client"
import { useKeyBindings, useSetKeyBindings, useSetSwipeActions, useSwipeActions } from "@/core/queries"
import type { SwipeActionId, SwipeActions } from "@/core/types"
import { useRowSize } from "@/features/settings/row-size"
import { useSettingSave } from "@/features/settings/save"
import { SaveFailed } from "@/features/settings/save-failed"
import { SettingBlock } from "@/features/settings/setting-block"
import { DEFAULT_KEYS, KEY_COMMANDS, type KeyArea, keyLabel, keyProblem, rebind } from "@/lib/keys"

import { SWIPE_CHOICES } from "./mail/vocabulary"

/**
 * The four tiles of brief M1, from the content outwards, and the stored slot
 * each one shows (ADR-0025's four slots keep their names; DC2, Q4).
 */
const SLOTS: { key: keyof SwipeActions; label: string; description?: string }[] = [
  { key: "right", label: "Leading" },
  { key: "left", label: "Trailing, outer", description: "A full swipe runs it." },
  { key: "leftLong", label: "Trailing, middle" },
  { key: "rightLong", label: "Trailing, inner" },
]

/** What a tile shows for each choice, as a resting row's swipe shows it (`useMailVerbs`). "Nothing" shows no tile. */
const TILE: Record<Exclude<SwipeActionId, "none">, { icon: IconName; label: string }> = {
  read: { icon: "view", label: "Read" },
  archive: { icon: "archive", label: "Archive" },
  star: { icon: "star", label: "Star" },
  "snooze-tomorrow": { icon: "time", label: "Snooze" },
  "snooze-next-week": { icon: "time", label: "Snooze" },
  remind: { icon: "notification", label: "Remind" },
  newsletters: { icon: "blog", label: "Newsletters" },
}

const AREAS: { area: KeyArea; heading: string }[] = [
  { area: "mail", heading: "Keys in Mail" },
  { area: "calendar", heading: "Keys in Calendar" },
]

const MOD = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl+"

/** Keys that never change (brief T6, X7), as facts. Quick note is the owner's: a team member has no notes. */
const FIXED: { keys: string; does: string; notes?: boolean }[] = [
  { keys: "Esc", does: "Close the top layer" },
  { keys: "?", does: "This list of keys" },
  { keys: `${MOD}K`, does: "Commands and search" },
  { keys: "⌥N", does: "Quick note, linked to what's open", notes: true },
  { keys: `${MOD},`, does: "Settings" },
  { keys: `${MOD}\\`, does: "Collapse or show the sidebar" },
  { keys: `${MOD}Z`, does: "Take back a send, while its window is open" },
]

/** Keys that only modify another key; capture waits past them. */
const MODIFIERS = new Set(["Shift", "Control", "Alt", "Meta", "CapsLock", "Fn", "OS"])

const choiceLabel = (id: SwipeActionId) => SWIPE_CHOICES.find((c) => c.id === id)?.label ?? id

/**
 * Settings › Shortcuts and gestures (brief T6; ADR-0025, ADR-0032,
 * ADR-0111): one vocabulary, every way in. SWIPES IN THE MAIL LIST: a
 * picture of the four tiles as set, then a row per tile with CHANGE. KEYS IN
 * MAIL and KEYS IN CALENDAR: a row per command whose key is a button that
 * captures the next key. THESE DON'T CHANGE, then RESET KEYS. Swipes and
 * keys are the core's, so they follow you to every device; every change
 * saves at once and silently.
 */
export function ShortcutSettings() {
  const { data: swipes } = useSwipeActions()
  const saveSwipes = useSetSwipeActions()
  const { data: keys } = useKeyBindings()
  const saveKeys = useSetKeyBindings()
  const save = useSettingSave()
  const size = useRowSize()
  const [capturing, setCapturing] = useState<string | null>(null)

  const setSwipe = (key: keyof SwipeActions, id: SwipeActionId) => swipes && swipes[key] !== id && save.run(`swipe.${key}`, saveSwipes.mutateAsync({ ...swipes, [key]: id }))
  const assign = (id: string, key: string) => {
    if (!keys) return
    const { next, swapped } = rebind(keys, id, key)
    save.run(
      id,
      saveKeys.mutateAsync(next).then(() => {
        // Silent, as every setting is, unless another command lost its key to this one.
        if (swapped) toast(`Swapped with ${swapped.does}`)
      }),
    )
  }
  const changed = !!keys && KEY_COMMANDS.some((c) => keys[c.id] !== DEFAULT_KEYS[c.id])
  const reset = () => {
    if (!keys) return
    const before = keys
    save.run(
      "reset",
      saveKeys.mutateAsync({}).then(() => toast("Keys reset to the defaults", { action: { label: "Undo", onClick: () => save.run("reset", saveKeys.mutateAsync(before)) } })),
    )
  }
  const member = isMember()

  return (
    <div className="flex flex-col gap-8">
      <SettingBlock title="Swipes in the mail list">
        {swipes && <SwipePicture swipes={swipes} />}
        {SLOTS.map((slot) => (
          <div key={slot.key}>
            <FieldRow
              size={size}
              label={slot.label}
              description={slot.description}
              action={
                <AdaptiveMenu title={slot.label} trigger={<FieldRowAction disabled={!swipes}>Change</FieldRowAction>}>
                  <AdaptiveMenuRadioGroup value={swipes?.[slot.key]} onValueChange={(v) => setSwipe(slot.key, v as SwipeActionId)}>
                    {SWIPE_CHOICES.map((c) => (
                      <AdaptiveMenuRadioItem key={c.id} value={c.id}>
                        {c.label}
                      </AdaptiveMenuRadioItem>
                    ))}
                  </AdaptiveMenuRadioGroup>
                </AdaptiveMenu>
              }
            >
              {swipes ? choiceLabel(swipes[slot.key]) : ""}
            </FieldRow>
            <SaveFailed message={save.failed(`swipe.${slot.key}`)} />
          </div>
        ))}
        <p className="type-caption pt-4 text-text-secondary">The Screener keeps its own: right lets a sender in, left screens them out.</p>
      </SettingBlock>

      {AREAS.map(({ area, heading }) => (
        <SettingBlock key={area} title={heading}>
          <div className="vale-key-rows">
            {KEY_COMMANDS.filter((c) => c.area === area).map((c) => (
              <div key={c.id}>
                <CommandKey
                  size={size}
                  does={c.does}
                  description={c.everywhere ? "Works in every section." : undefined}
                  current={keys?.[c.id] ?? ""}
                  disabled={!keys}
                  capturing={capturing === c.id}
                  onCapture={(on) => setCapturing(on ? c.id : null)}
                  onKey={(k) => assign(c.id, k)}
                />
                <SaveFailed message={save.failed(c.id)} />
              </div>
            ))}
          </div>
        </SettingBlock>
      ))}

      <SettingBlock title="These don't change">
        <div className="vale-key-rows">
          {FIXED.filter((f) => !(f.notes && member)).map((f) => (
            <FieldRow key={f.does} size={size} label={<Kbd>{f.keys}</Kbd>}>
              <FieldRowValue truncate="wrap">{f.does}</FieldRowValue>
            </FieldRow>
          ))}
        </div>
      </SettingBlock>

      <div className="flex flex-col items-start gap-4">
        <Button variant="secondary" disabled={!changed} disabledReason={changed ? undefined : "Nothing differs from the defaults."} onClick={reset}>
          Reset keys
        </Button>
        <SaveFailed message={save.failed("reset")} />
        <p className="type-caption text-text-secondary">Keys follow you to every device on your account.</p>
      </div>
    </div>
  )
}

/**
 * The four tiles as they are set (brief T6): a row of bars swiped
 * right to its leading tile, and one swiped left to its trailing tiles, as
 * States / 01 draws them. A picture only: hidden from screen readers and out
 * of reach, since the rows below are where each tile is chosen.
 */
function SwipePicture({ swipes }: { swipes: SwipeActions }) {
  const tile = (id: SwipeActionId, tone: SwipeActionTone) => (id === "none" ? null : <SwipeAction tabIndex={-1} tone={tone} icon={TILE[id].icon} label={TILE[id].label} />)
  const trailing = [swipes.rightLong, swipes.leftLong, swipes.left].filter((id) => id !== "none")
  // Two bars where a row's words would be. Plain shapes, not unicron's Skeleton: nothing here is loading.
  const bars = (
    <div className="flex min-w-0 flex-1 flex-col justify-center gap-3 px-4">
      <span className="block h-3 w-2/5 bg-surface-raised" />
      <span className="block h-3 w-4/5 bg-surface-raised" />
    </div>
  )
  return (
    <div aria-hidden="true" inert className="flex flex-col gap-2 pt-4 pb-6">
      <div className="flex h-22 overflow-hidden border-y">
        {tile(swipes.right, "primary")}
        {bars}
      </div>
      <div className="flex h-22 overflow-hidden border-y">
        {bars}
        {trailing.map((id, i) => (
          <span key={`${id}-${i}`} className="flex">
            {tile(id, i === trailing.length - 1 ? "primary" : "neutral")}
          </span>
        ))}
      </div>
    </div>
  )
}

/**
 * One command and its key (brief T6), built from FieldRow, Button and Kbd
 * (brief 1.4: key capture is Vale's own). The key is the button: press it,
 * then press the new key; Esc cancels and Tab leaves it as it was. A key in
 * use by another command swaps with it. REMOVE is in the row's menu.
 */
function CommandKey(props: {
  size: "default" | "stacked"
  does: string
  description?: ReactNode
  current: string
  disabled: boolean
  capturing: boolean
  onCapture: (on: boolean) => void
  onKey: (key: string) => void
}) {
  const { size, does, description, current, disabled, capturing, onCapture, onKey } = props
  const [problem, setProblem] = useState<string | null>(null)

  const onKeyDown = (e: KeyboardEvent) => {
    if (!capturing || MODIFIERS.has(e.key)) return
    if (e.key === "Tab") return onCapture(false)
    e.preventDefault()
    e.stopPropagation()
    if (e.key === "Escape") return onCapture(false)
    if (e.metaKey || e.ctrlKey || e.altKey) return setProblem("Single keys only. Shift is fine.")
    const why = keyProblem(e.key)
    if (why) return setProblem(why)
    onCapture(false)
    if (e.key !== current) onKey(e.key)
  }

  return (
    <FieldRow
      size={size}
      label={does}
      description={capturing ? <span role="status">{problem ?? "Press the new key. Esc cancels."}</span> : description}
      menu={current ? <AdaptiveMenuItem onSelect={() => onKey("")}>Remove</AdaptiveMenuItem> : undefined}
    >
      {/* One button for every state, so focus stays put after a key is chosen. */}
      <span>
        <Button
          size="sm"
          // The Kbd is the key's box; a capture shows the button's own outline while it waits.
          variant={capturing ? "secondary" : "ghost"}
          aria-label={capturing ? `Press a key for ${does}` : current ? `Change the key for ${does}` : `Add a key for ${does}`}
          disabled={disabled}
          onKeyDown={onKeyDown}
          onBlur={() => capturing && onCapture(false)}
          onClick={() => (setProblem(null), onCapture(!capturing))}
        >
          {capturing ? "Press a key…" : current ? <Kbd>{keyLabel(current)}</Kbd> : "Add key"}
        </Button>
      </span>
    </FieldRow>
  )
}
