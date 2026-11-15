import { useEffect, useRef } from "react"

import { useUi } from "@/app/ui-store"
import { AdaptiveDialog, Button, Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogOverline, DialogTitle, FieldRow, Kbd, SectionHeader, useAdaptiveSheet, useViewport } from "@unicron/ui"
import { isMember } from "@/core/client"
import { useKeyBindings } from "@/core/queries"
import { FIXED_KEYS, KEY_COMMANDS, type KeyArea, keyLabel, listedUnder } from "@/lib/keys"

const MOD = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl+"
const ALT = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌥" : "Alt+"

type Group = KeyArea | "everywhere"
const GROUPS: { area: Group; heading: string }[] = [
  { area: "everywhere", heading: "Everywhere" },
  { area: "mail", heading: "Mail" },
  { area: "calendar", heading: "Calendar" },
]

/**
 * Every key, read-only (ADR-0075, ADR-0096; brief X7): an adaptive dialog of
 * the form size (a sheet on a phone), KEYS over "Keyboard shortcuts", then
 * EVERYWHERE, MAIL and CALENDAR, each key a Field Row with the key in its
 * label and what it does as its value. MAIL and CALENDAR are the person's
 * own keys; EVERYWHERE is their search key and the keys that never change.
 * Two columns from the medium width up. `?` opens it from anywhere outside a
 * text field; changing a key is in Settings › Shortcuts and gestures.
 */
export function KeyboardShortcuts() {
  const open = useUi((s) => s.shortcutsOpen)
  const setOpen = useUi((s) => s.setShortcutsOpen)
  const { data: keys } = useKeyBindings()
  // Two columns where the frame is wider than a phone (the dialog's own 640 holds two).
  const wide = useViewport().widthClass !== "compact"
  // A team member has mail alone: no calendar keys, and nothing about notes (brief X10).
  const member = isMember()
  const sheet = useAdaptiveSheet()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "?" || e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return
      const t = e.target as HTMLElement
      if (t.closest("input, textarea, select, [contenteditable=true], [role=dialog]")) return
      e.preventDefault()
      useUi.getState().setShortcutsOpen(true)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  // The person's own first (the search key leads Everywhere), then the fixed ones.
  const rows = (area: Group) => [
    ...KEY_COMMANDS.filter((c) => listedUnder(c) === area && keys?.[c.id]).map((c) => ({ does: c.does, keys: [keyLabel(keys![c.id]!)] })),
    ...FIXED_KEYS.filter((f) => f.area === area && !(member && f.notes)).map((f) => ({ does: f.does, keys: f.keys.map((k) => k.replace("⌘", MOD).replace("⌥", ALT)) })),
  ]
  const groups = GROUPS.filter((g) => !(member && g.area === "calendar"))
  // Focus starts at the top of the list, not on its one button at the foot, so the list opens at its start.
  const top = useRef<HTMLDivElement>(null)

  // Focus without scrolling: the dialog's header scrolls with its body, and must stay in view.
  const initialFocus = () => {
    top.current?.focus({ preventScroll: true })
    return top.current ? false : true
  }
  const change = (
    <Button variant="secondary" onClick={() => (setOpen(false), useUi.getState().openSettings("shortcuts"))}>
      Change keys and swipes
    </Button>
  )
  const list = (
    <>
      {/* The key column holds a key or two, so it takes the scale's 96, not a label's 140 (unicron's knob). */}
      <div ref={top} tabIndex={-1} className={`outline-none [--c-field-row-label-width:--spacing(24)] ${wide && groups.length > 2 ? "grid grid-cols-2 gap-x-6 gap-y-6" : "flex flex-col gap-6"}`}>
        {groups.map(({ area, heading }) => (
          // Two columns: Everywhere over Calendar on the left, Mail down the right.
          <section key={area} aria-label={heading} className={wide && groups.length > 2 && area === "mail" ? "col-start-2 row-span-2 row-start-1" : undefined}>
            <SectionHeader title={heading} level={3} />
            <div className="flex flex-col">
              {rows(area).map((r) => (
                <FieldRow
                  key={r.does}
                  label={
                    <span className="flex gap-1">
                      {r.keys.map((k) => (
                        <Kbd key={k}>{k}</Kbd>
                      ))}
                    </span>
                  }
                >
                  {/* What it does reads as words, not as a value. */}
                  <span className="type-ui text-foreground">{r.does}</span>
                </FieldRow>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  )
  // On a phone the sheet pins its footer. On a desktop the dialog's footer is pinned too (sticky), so
  // CHANGE KEYS AND SWIPES stays in sight while the list scrolls (brief X7); AdaptiveDialog's own footer
  // scrolls with the body there (a unicron gap, ADR-0115).
  if (sheet) {
    return (
      <AdaptiveDialog open={open} onOpenChange={setOpen} size="form" height="full" overline="Keys" title="Keyboard shortcuts" initialFocus={initialFocus} footer={change}>
        {list}
      </AdaptiveDialog>
    )
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent size="form" initialFocus={initialFocus}>
        <DialogHeader>
          <DialogOverline>Keys</DialogOverline>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
        </DialogHeader>
        <DialogBody>{list}</DialogBody>
        <DialogFooter sticky>{change}</DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
