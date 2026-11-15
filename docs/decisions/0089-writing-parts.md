# ADR-0089 · Writing parts, built once: the recipient field, the rich-text field and the format bar

- **Status:** Accepted for the build. **Two choices are proposals for Sean** (below): Code in the mail format bar, and where the composer's Cc button stands.
- **Date:** 2026-11-14
- **Builds on:** [ADR-0082](0082-unicron-1-0.md) (unicron 1.0: `ChipField`, `Chip` critical, `Toolbar`, `ToolbarToggle`, `AdaptivePopover`, `TextField`, `InitialTile`), [ADR-0087](0087-forms-and-questions.md) (the form layer the composer and the event form stand in).
- **Design:** sections 1.4, M6, C3, N2 and T3 of the undrawn-areas design. Unicron's contract names the recipient field and the format bar app-level, built on its parts.

Vale wrote in three ways. The composer and the event form had a recipient input of their own: plain text with suggestions under it, so a wrong address showed nothing until the server refused it. The composer, the signatures, the templates and the reply a team writes together each put a Tiptap editor in a box of their own. Notes and mail shared one format bar of icon toggles that was not a toolbar (every button a Tab stop) and that opened its link field inside the bar. This builds each part once, in `components/`, and moves every caller onto it.

## Decisions

### The recipient field (`components/recipient-field.tsx`, `components/recipients.ts`)

unicron's `ChipField` (the Text Field box holding chips), with suggestions from Contacts under it.

- **The value is unchanged:** the string the old input held, `Ana <ana@x.com>, sam@y.com`. What is being typed is its last part, so a form sent from the keyboard still carries it. `recipients.ts` reads and writes that string and has `hasWrongAddress` for a form's own check. `features/mail/recipient-input.tsx` is gone.
- **Each address is a `Chip`:** the person's name with the address in a tooltip, or the bare address, and a remove button named "Remove {name}". A screen reader hears the name, then the address.
- **Suggestions:** up to six people in a popover hung from the field's box, each an Initial Tile S, the name and the address in mono. People already in the field are left out. Arrow keys move the highlight; Enter, Tab, a comma or a semicolon takes it; Esc closes the list and not the form. An address typed out in full is kept as typed even while the list is open.
- **Backspace** in the empty input takes the last chip off. **A pasted list** splits on commas and semicolons.
- **Text that is not an address** becomes a critical chip, said in words too (", not an address"). The field writes "Fix or remove the address in red." under its box and tells the form through `onProblem`. The composer's Send then goes off, stays in the tab order and points at that line with `aria-describedby`; ⌘ or Ctrl + Enter does not send. The event form does not save while a guest is wrong.
- **Combobox semantics:** the input is a `combobox` with `aria-expanded`, `aria-controls` and `aria-activedescendant`; the list is a `listbox` of `option`s.
- **Callers:** the composer's To and Cc, and the event form's guests, now named INVITE as brief C3 names it.

### The rich-text field (`components/rich-editor.tsx`, `components/use-rich-editor.ts`)

- `use-rich-editor.ts` holds the mail schema (`MAIL_EXTENSIONS`, `SAFE_LINK`) and `useRichEditor`, moved from `features/mail/`. `signature.ts` and `team/team-panel.tsx` import the schema from here. `richTextClass` gives an editor that is not made by the hook (the team's shared draft) the same text and height.
- `RichEditor` is the field: an overline label, then the Text Field box holding the text and, on its bottom edge, the format bar. `fill` lets the message take the room the form leaves.
- **Callers:** the composer's message, each signature (named `{ACCOUNT} // {ADDRESS}`), a template's text, and "Reply together". Someone reading the shared draft gets no format bar.

### The format bar (`components/format-bar.tsx`, `styles/mail.css`)

unicron's `Toolbar` of `ToolbarToggle`s over a Tiptap editor: **Bold · Italic · Link · Bulleted list · Numbered list · Quote · Code**.

- **One Tab stop.** The arrow keys, Home and End move along it (the toolbar's roving focus). A press never takes focus, or the phone's keyboard, from the text.
- **Link** opens an `AdaptivePopover` (a sheet on a phone) titled "Link": LINK ADDRESS, then REMOVE and the primary APPLY. It opens on the link under the cursor. A bare address becomes `https://…`, a name with @ becomes `mailto:`, and any other scheme is refused in the field's error, "Only web and email links." The change goes to the words chosen when the layer opened, then focus goes back to the text.
- **Opt-ins for notes:** `heading` (first), `checklist` (after the lists) and `actions`, more `ToolbarButton`s at the end after a hairline. The note passes Link to a note, Add image, Scan a document and Sketch. Code is a code block where the schema has one (notes) and inline code in mail.
- **Modes:** `field` (default) on the bottom edge of a field's box; `docked` at the foot of a column that scrolls (the note on a desktop), sticky over the text; `keyboard` on a phone, held just above the on-screen keyboard (`--keyboard-inset`) with full-size buttons, scrolling sideways with no scroll bar.
- **Knobs** in `mail.css`: `--c-format-bar-padding-x`, `--c-format-bar-padding-y`, `--c-format-bar-rule`, `--c-format-bar-ground`. The note sets the ground to its own surface, so a tinted note keeps its tint under the bar.
- **Callers:** the composer, the signatures and templates, the note, and the team's shared draft. The note's column is now at least as tall as its pane, so the docked bar stands at the pane's foot.

## For Sean

1. **Code in the mail bar.** The brief lists Code for mail, and mail's schema has inline code, so the bar has it. Mail had no Code button before. Keep it?
2. **Cc.** The brief puts a text button CC in the field's trailing slot. `ChipField` has no trailing slot, so CC stands beside the box, level with it. Right, or ask unicron for the slot?

## Ratchet

Read from the source: className overrides 118 → 117 (the From select's border override went with the old row); 1 style, 0 spread, 14 plain buttons, 0 look-alikes by the estimator. `.dsa/baseline.json` is lowered.

## Consequences

- Recipients and formatting look and work the same in every place that writes.
- A wrong address is caught in the form, with its reason, before anything is sent or saved.
- The composer's Formatting toggle, its More menu and the phone's format bar above the keyboard (brief M6), and the Signatures and Templates rows with EDIT (brief T3), are the mail and settings lanes'. The parts here are ready for them; the composer keeps its bar on the message field until then.
- The note's color still tints the pane until the notes lane changes it (DC3).
