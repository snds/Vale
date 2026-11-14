import { useQuery } from "@tanstack/react-query"
import { useDeferredValue, useEffect, useId, useRef, useState, type KeyboardEvent } from "react"

import { Chip, ChipField, ChipRemove, InitialTile, Popover, PopoverContent, PopoverTrigger, Tooltip, TooltipContent, TooltipTrigger } from "@unicron/ui"
import { getCoreClient } from "@/core/client"
import type { Address } from "@/core/types"

import { RECIPIENT_PROBLEM, isAddress, pieces, read, write } from "./recipients"

/**
 * The recipient field (ADR-0089; briefs M6, C3 and 1.4): people as chips in
 * the Text Field box, with suggestions from Contacts under it. One part for
 * the composer's To and Cc and the event form's Guests.
 *
 * - Each address is a chip with the person's name (the address in a tooltip)
 *   and a remove button.
 * - Typing lists up to six people. Enter, Tab or a comma takes the
 *   highlighted one; Escape closes the list, not the form.
 * - Backspace in the empty input removes the last chip. A pasted list splits
 *   on commas and semicolons.
 * - Text that is not an address becomes a critical chip. The field says why
 *   in a line under its box and through `onProblem`, so the form's primary
 *   can go off and point at that line as its reason.
 *
 * The value is the string the old field had ("Ana <ana@x.com>, sam@y.com"),
 * read with `parseRecipients`. What is being typed is its last part, so a
 * form sent from the keyboard still carries it. `recipients.ts` holds the
 * reading of that string, and `hasWrongAddress` for the form's own check.
 */

const initialsOf = (a: Address) =>
  (a.name?.trim() || a.email)
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0]!.toUpperCase())
    .slice(0, 2)
    .join("")

export function RecipientField({
  id,
  label,
  value,
  onChange,
  onProblem,
  placeholder,
  focusFirst = false,
}: {
  id: string
  /** The field's name, above the box: "To", "Cc", "Invite". */
  label: string
  value: string
  onChange: (value: string) => void
  /** Told the reason while a chip is not an address, and null once none is. The field shows it under its box (`recipientProblemId`). */
  onProblem?: (problem: string | null) => void
  placeholder?: string
  /** The form's first focus (the composer's `data-composer-focus`). */
  focusFirst?: boolean
}) {
  const listId = useId()
  // What is being typed. The value's last part is this text, and the parts before it are the chips.
  const [text, setText] = useState("")
  const all = pieces(value)
  const typing = text.trim() !== "" && all.at(-1) === text.trim()
  const chips = typing ? all.slice(0, -1) : all
  // One event can change the chips and the text (a comma, a paste, a blur): each handler writes the
  // newest of both, so the second does not undo the first.
  const latest = useRef({ chips, text })
  useEffect(() => {
    latest.current = { chips, text }
  })
  const emit = (next: { chips?: string[]; text?: string }) => {
    latest.current = { ...latest.current, ...next }
    const now = latest.current
    setText(now.text)
    onChange([...now.chips, now.text.trim()].filter(Boolean).join(", "))
  }

  const wrong = chips.some((c) => !isAddress(c))
  const told = useRef(onProblem)
  useEffect(() => {
    told.current = onProblem
  })
  useEffect(() => {
    told.current?.(wrong ? RECIPIENT_PROBLEM : null)
  }, [wrong])

  const [active, setActive] = useState(0)
  const [dismissed, setDismissed] = useState<string | null>(null)
  const token = useDeferredValue(text.trim())
  const { data: suggestions = [] } = useQuery({
    queryKey: ["pim", "suggest", token],
    queryFn: async () => (await getCoreClient()).suggestRecipients(token),
    enabled: token.length >= 1,
    placeholderData: (prev) => prev,
  })
  // Don't suggest who is already in the field.
  const have = new Set(chips.map((c) => read(c).email.toLowerCase()))
  const fresh = token.length >= 1 ? suggestions.filter((s) => !have.has(s.email.toLowerCase())).slice(0, 6) : []
  const open = fresh.length > 0 && dismissed !== token
  const index = Math.min(active, fresh.length - 1)

  const pick = (a: Address) => {
    emit({ chips: [...latest.current.chips, write(a)], text: "" })
    setActive(0)
  }

  const keys = (e: KeyboardEvent<HTMLInputElement>) => {
    // ⌘ or Ctrl + Enter is the form's. The field keeps what is typed as a chip on its way, so a wrong one shows.
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) return
    if (!open) return
    const highlighted = fresh[index]!
    // A whole address typed out is taken as typed, unless it is the highlighted person's own.
    const asTyped = isAddress(text.trim()) && highlighted.email.toLowerCase() !== text.trim().toLowerCase()
    if (e.key === "ArrowDown") setActive((index + 1) % fresh.length)
    else if (e.key === "ArrowUp") setActive((index - 1 + fresh.length) % fresh.length)
    else if ((e.key === "Enter" || e.key === "Tab" || e.key === "," || e.key === ";") && !asTyped && !e.shiftKey) pick(highlighted)
    else if (e.key === "Escape") {
      // Close the list, not the form.
      e.stopPropagation()
      setDismissed(token)
    } else return
    e.preventDefault()
  }

  return (
    <div className="relative min-w-0 flex-1" data-slot="recipient-field">
      <Popover open={open} onOpenChange={(next) => !next && setDismissed(token)}>
        {/* The list hangs from the field's own box: this takes no press and no focus, it only says where. */}
        <PopoverTrigger nativeButton={false} disabled tabIndex={-1} render={<div aria-hidden className="pointer-events-none absolute inset-0" />} />
        <ChipField
          id={id}
          data-composer-focus={focusFirst ? "" : undefined}
          inputMode="email"
          label={label}
          value={chips}
          onValueChange={(next) => emit({ chips: next })}
          inputValue={text}
          onInputValueChange={(next) => {
            emit({ text: next })
            setActive(0)
            setDismissed(null)
          }}
          isInvalid={(v) => !isAddress(v)}
          invalid={wrong}
          error={wrong ? RECIPIENT_PROBLEM : undefined}
          placeholder={chips.length ? undefined : placeholder}
          renderChip={(v, chip) => <Person value={v} invalid={chip.invalid} onRemove={chip.locked ? undefined : chip.remove} />}
          role="combobox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={open ? `${listId}-${index}` : undefined}
          autoComplete="off"
          onKeyDown={keys}
          onBlur={() => setDismissed(text.trim())}
        />
        <PopoverContent
          align="start"
          initialFocus={false}
          finalFocus={false}
          aria-label="Suggestions"
          // A press in the list must not take focus from the input: the field keeps what is typed as a chip when it blurs.
          onMouseDown={(e) => e.preventDefault()}
        >
          <ul id={listId} role="listbox" aria-label="Suggestions" className="-m-2 flex flex-col">
            {fresh.map((s, i) => (
              <li
                key={s.email}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === index}
                onPointerMove={() => i !== index && setActive(i)}
                onClick={() => pick(s)}
                className="flex h-10 min-w-0 cursor-default items-center gap-2 px-2 aria-selected:bg-primary-soft pointer-coarse:h-12"
              >
                <InitialTile size="s" initials={initialsOf(s)} />
                {s.name && <span className="shrink-0 type-ui text-text-body">{s.name}</span>}
                <span className="min-w-0 truncate type-meta text-text-label">{s.email}</span>
              </li>
            ))}
          </ul>
        </PopoverContent>
      </Popover>
    </div>
  )
}

/** One person in the field: the name (the address in a tooltip), or the address, or the text that is not one. */
function Person({ value, invalid, onRemove }: { value: string; invalid: boolean; onRemove?: () => void }) {
  const a = read(value)
  const shown = a.name ?? a.email
  return (
    <Chip variant="outline" tone={invalid ? "critical" : "neutral"}>
      {a.name ? (
        <Tooltip>
          <TooltipTrigger render={<span />}>{a.name}</TooltipTrigger>
          <TooltipContent>{a.email}</TooltipContent>
        </Tooltip>
      ) : (
        <span>{a.email}</span>
      )}
      {/* Said after the name: the address, or that this is not one. Colour is never the only signal. */}
      <span className="sr-only">{invalid ? ", not an address" : a.name ? `, ${a.email}` : ""}</span>
      {onRemove && <ChipRemove label={`Remove ${shown}`} onClick={onRemove} />}
    </Chip>
  )
}
