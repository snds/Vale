# ADR-0103 · Editing a contact in the pane, Duplicates, Recently deleted and Restore contacts

- **Status:** Accepted for the build. It records **DC13** (merging duplicates asks first) as a **proposal** for Sean, with its question in the set of Q13; the brief's pick stands until he answers. It answers the app spec's question 11 (edit a contact in the pane or in a dialog) and cites DC4 (forms are dialogs on a desktop, recorded in ADR-0087), which this slice narrows for Contacts.
- **Date:** 2026-11-15
- **Builds on:** [ADR-0020](0020-contacts-depth.md) (the contact form, duplicates), [ADR-0023](0023-contacts-that-keep-themselves.md) (fill from a signature, Recently deleted, Restore contacts), [ADR-0027](0027-faces-and-sources.md) (address books and photos), [ADR-0084](0084-places.md) (Duplicates and Recently deleted as places, `openRestoreContacts()`), [ADR-0087](0087-forms-and-questions.md) (the form layer, the leave guard, `useConfirm`), [ADR-0102](0102-contacts.md) (the list and the person).
- **Design:** briefs P3, P4 and P5 of the undrawn-areas design; Figma's Desktop / 10 and Mobile / 13.

The contact form was a dialog on every screen, of bare inputs, a native select per field and two plain buttons. Duplicates merged at once from a rounded card of plain radios. Recently deleted was a rounded box of plain rows, and Restore contacts a small dialog with a grey box of sentences. The briefs move each onto unicron's parts, put the desktop form where Desktop / 10 draws it, and make the merge ask.

## Decisions

### Where the contact form stands (question 11)

- **In the detail column** on a desktop (the expanded width, where the list and the detail stand side by side), when the form is opened from Contacts: EDIT on a person, or NEW CONTACT in Contacts' sidebar. The list stays beside it, with the person's row still selected. This answers question 11: **the pane**, as Desktop / 10 draws it.
- **In the form layer** everywhere else (ADR-0087): the whole screen on a phone (Mobile / 13: close, "Edit contact" or "New contact", the checkmark), a 640 dialog at medium width (where the person is itself a pushed screen), and a dialog over the section you are in when another section opens it (the sender panel's Add, quick create from Mail, a signature suggestion in a message). Moving you to Contacts for those would drop the message you were reading.
- Where it stands is decided once, when it opens (`contact-pane.ts`): Contacts says it can hold the form while it shows list and detail side by side. `App.tsx` still mounts `ContactEditor`, which now draws nothing while the form stands in the pane. `useUi`'s `openContactEditor` and `ContactEditorState` are unchanged, so every caller works as before.
- **In the pane:** the head is EDIT CONTACT or NEW CONTACT over the name as typed, with PASTE A SIGNATURE at its right. The desktop's top line reads `CONTACTS // {NAME} // EDIT` or `CONTACTS // NEW`, and `UNSAVED CHANGES` once a value differs from when it opened. The footer is CANCEL and SAVE (the primary, with the checkmark). ⌘ or Ctrl+Enter saves; Esc and CANCEL close.
- **Leaving asks** (brief X6): every move away with changes asks "Discard changes?" with focus on KEEP EDITING: another row (through `leaveThen`), a sidebar item, another section, Search, Settings, a jump, Esc, CANCEL. DISCARD makes the move. A form in the layer asks as ADR-0087 says. When Contacts goes away with the form untouched (another section, a narrower window), the form closes.
- Saved: "Saved {name}" or "Added {name}", and the card opens in the detail column.

### The fields (brief P3)

| Field | Part | Notes |
|---|---|---|
| Photo | `InitialTile` L with ADD PHOTO or CHANGE PHOTO, and REMOVE PHOTO when there is one | The same 256 px JPEG as before |
| NAME | `TextField` | One field, `fullName`. Desktop / 10 draws FIRST NAME and LAST NAME; the core has one field (W5) |
| COMPANY · JOB TITLE | `TextField`s | Side by side on a desktop and in the dialog, stacked on a phone |
| EMAILS, PHONE NUMBERS | A `TextField` per value; its label (Home, Work, Cell, Other) as a ghost button opening an `AdaptiveMenu` inside the box, then remove; ADD EMAIL, ADD PHONE | A phone number's error looks as drawn, with a rule that is always true: "Use digits, spaces and +." It is checked when the field is left and on SAVE, and never on a number the card already had, so a synced number in another shape never blocks a save. The drawn "Phone numbers need 10 digits." is a US rule and is not used |
| BIRTHDAY | `TextField type="date"` | The platform's date field in the Text Field box, as the TIME field in ADR-0088's picker. A yearless birthday from another app stays unless replaced, and says so in the helper |
| LABELS | `ChipField` | Its helper lists the labels in use; a typed label takes an existing label's spelling |
| NOTE | `TextField multiline`, 4 lines | |
| SAVED IN | `FieldRow` with CHANGE (a menu of the books you can write to) | New contacts only |

**PASTE A SIGNATURE** is a ghost button at the form's top right that opens an `AdaptivePopover` (a sheet on a phone): SIGNATURE, a multi-line field with a helper, and FILL IN. It fills what it finds and keeps what you typed otherwise, and toasts "Filled in name, title, company, phone, email". Text with nothing in it stays in the popover with the field's error, "Couldn't find a name, phone or email in that text" (decisions §9: a failed action is a line beside its control; the brief's toast for this case is replaced). It is offered when editing too, not only for a new card.

Gone: the native selects (two className overrides), the plain "Add email" and "Paste a signature" buttons (two raw buttons), the bare inputs.

### Duplicates (brief P4)

- A place under CLEAN UP and from a person's REVIEW, with the list's room and no detail column; its content is one column up to 720.
- Head `DUPLICATES // 01 SET` and "Duplicates". Per set: a `SectionHeader` with the fullest name in the set and the number of cards; a `RadioGroup` "Keep which?" of `ListRow`s, each with a leading radio, the name, a mono line of that card's real addresses and numbers (cut with an ellipsis) and its address book at the right; the caption "Keeps 1 email, 1 phone." (every address and number in the set, each once, as the core merges them); a secondary MERGE. Each row is the radio's label, so a press anywhere on it picks that card.
- The card with the fullest name is picked first (the kept card keeps its name); before, it was the card with the most details, which picked "Ana D." over "Ana Duarte".
- **DC13 (proposal):** MERGE **asks** through `useConfirm`: "Merge 2 cards into Ana Duarte?" · "The other cards go to Recently deleted. Merged details can't be split again." · MERGE, focus on Cancel. Before, it merged at once. Merged details cannot be taken apart, so decisions §10 asks. Then the toast "Merged into {name}" with OPEN.
- Loading: three skeleton rows. None left: `DUPLICATES // 00` · "No duplicates left."

### Recently deleted (brief P5)

- Head `RECENTLY DELETED // 30 DAYS` and "Recently deleted". Rows are `ListRow`s: the name, a mono line `Deleted Thu 11.12`, and a trailing RESTORE. A card whose address book is gone says it comes back on this device. RESTORE toasts "Restored {name}" and opens the card among everyone.
- Loading: three skeleton rows. Empty (copy 5.2): `RECENTLY DELETED // 00` · "Nothing deleted." · "Deleted contacts stay here for 30 days."

### Restore contacts (brief P5)

- Opened by `openRestoreContacts()`, as before. An `AdaptiveDialog` of the form size (a sheet on a phone): overline CONTACTS, title "Restore contacts", the line "Puts every contact back the way it was then." It holds no writing, so it has no leave guard, and so it is not on `FormLayer`: its RESTORE must name its reason when disabled, which `FormLayerForm`'s phone primary cannot.
- Field Row RESTORE TO, starting at Yesterday (the brief's pick; it was An hour ago), with CHANGE: 10 minutes ago, An hour ago, Yesterday, A week ago, 30 days ago.
- `SectionHeader` WHAT CHANGES, then Field Rows from the core's preview (`ContactsRestore`), each only when it names someone: PUTS BACK (cards edited since), BRINGS BACK (deleted since), REMOVES (added since; "They go to Recently deleted."). Values are names: "Jonah Brandt, Noor Haddad and 2 more". Cards in a read-only book: one caption with the lock icon. Three skeleton rows while it checks.
- Nothing changed: "No contacts changed since then." under WHAT CHANGES, and RESTORE disabled, in the tab order, described by that line.
- RESTORE toasts "Restored 7 contacts to yesterday" with UNDO, which restores to the mark the restore made.

### Demo scenarios (`core/demo-scenarios/contacts.ts`)

`contacts-deleted` (two cards deleted today) and `contacts-changed` (two deleted, one edited, four added), each made through the demo client's own calls. No sample data changed.

## Verification

- `tsc -b`, `oxlint` (no warnings), `build:demo`, `build`, the notes-relay tests: pass (the lane's check). The ratchet, counted by reading: className **86 → 83**, raw buttons **9 → 7**, style 1, spread 0; `.dsa/baseline.json` lowered. Look-alikes by the estimator: 0.
- Scenes (phone and desktop, graphite and stone; some at medium): kept names `contacts-edit` (now also at medium), `contacts-new`, `contacts-duplicates`, `contacts-restore`, `places-duplicates`, `places-recently-deleted`, `form-layer-contact`; new `contacts-edit-error`, `contacts-leave-guard`, `contacts-leave-discard`, `contacts-paste-signature`, `contacts-merge-confirm`, `contacts-merge`, `contacts-restore-undo`, `contacts-restore-nothing`, `places-recently-deleted-restore`, `places-recently-deleted-empty`.
- Asserted: the form in the pane beside the list with the row selected, the breadcrumb `CONTACTS // PRIYA RAMAN // EDIT` and the footer CANCEL, SAVE; a phone's top row "Edit contact"; REMOVE PHOTO; a wrong number's inline error and `aria-invalid`, SAVE keeping the form, UNSAVED CHANGES, and a number the card already had never questioned; `CONTACTS // NEW` and SAVED IN with CHANGE; leaving by another row, another section, Esc (desktop) and Close (phone) each asks with focus on KEEP EDITING, which keeps the typing; DISCARD opens the row pressed; PASTE A SIGNATURE's error stays in the popover, and a signature fills five fields with its toast; the form in the pane closes untouched on Esc, asks with writing, and saves on Ctrl+Enter, and the layer's checks at phone and medium; Duplicates' radios, row presses, caption and number; MERGE asks with focus on Cancel and the merged card holds the other card's phone; Restore names cards in each row, RESTORE and UNDO change the list and back; the disabled RESTORE keeps focus and is described by its reason; Recently deleted's rows, RESTORE bringing Sam back, and the empty state. `shell-quick-create`, `mail-sender`, `discard-question` and the search scenes still pass.
- Looked at beside Desktop / 10 and Mobile / 13. The one NAME field (W5), the photo row, LABELS, NOTE and PASTE A SIGNATURE are the planned departures and additions.

## Consequences

- DC4 now reads "forms are dialogs on a desktop, except a contact edited from Contacts at the expanded width". A task's plan (ADR-0100) and the contact form are the two forms in a pane.
- An Esc in a form in the pane is acted on after the key is done. Asked at once, the question opened in time to take the same Escape and close itself. A task's plan (ADR-0100) asks at once and may show the same fault.
- Opening another contact form while one stands in the pane (quick create while editing) replaces it without asking; the store's `openContactEditor` is not guarded. Rare, and noted.
- `PersonAvatar` keeps its `className` prop for nothing now: the form uses `InitialTile` directly.
