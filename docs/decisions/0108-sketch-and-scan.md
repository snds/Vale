# ADR-0108 · Sketches, scans and images in a note on unicron

- **Status:** Accepted
- **Date:** 2026-11-15
- **Builds on:** [ADR-0044](0044-images-in-notes.md) (images in notes), [ADR-0045](0045-scans-and-text-in-images.md) (scanning, text read on the device), [ADR-0046](0046-sketches.md) (sketches), [ADR-0067](0067-note-image-viewer.md) (the viewer), [ADR-0087](0087-forms-and-questions.md) ("Discard changes?", `useConfirm`), [ADR-0086](0086-status.md) (`useCopy`), [ADR-0106](0106-note.md) (the note and its format bar).
- **Design:** briefs N3 and N4 of the undrawn-areas design (no Figma frame); cross-app decisions §10 (questions, focus on the no), §12 (words), §13 (counts), §14 (viewer 960, full).

A sketch and a scan opened in a wide side sheet drawn with the old parts (round color dots, rounded tiles, a pulsing box), an image's actions sat in a row of outline buttons under it with its description as a bare input, and the viewer was a sheet with its own header. The briefs give each one the language of the rest of the app: viewer layers, unicron's `Toolbar`, square marks, one primary.

## Decisions

### Sketches (`features/notes/sketch-sheet.tsx`, brief N3)

- **A viewer layer:** `AdaptiveDialog` at `viewer` (960; the window less its margins below that), the whole screen on a phone. Header: overline SKETCH, title "Sketch" or "Edit sketch", close.
- **The canvas on its paper** (`--c-sketch-paper`, unchanged): the paper area carries the `light` class, so the one caption on it ("Draw with a mouse, a finger or a pen.") is in the stone ground's ink in both themes. It scrolls inside what the layer leaves, so the actions never leave the screen.
- **One `Toolbar`, "Drawing tools"** (one Tab stop), above the canvas on a desktop and below it on a phone, where it scrolls sideways: Pen · Marker · Eraser (`ToolbarToggle`s, one pressed) | the inks | Thickness | Undo · Redo · Clear | More room · Full screen (desktop; a phone's layer is the screen already).
- **The inks** are `PEN_COLORS` and `MARKER_COLORS` as stored: content, not tokens (brief 1.3). Each is a 12 px square on 20 px of paper inside a `ToggleGroupItem`, so it reads as it will on the page in either theme. Thickness keeps its three steps (Fine, Medium, Bold), drawn as square bars. Both groups are unicron `ToggleGroup`s inside the toolbar, so they share its arrow keys; they stay in place, disabled, while the eraser is on, so the row does not jump.
- **Clear asks nothing:** Undo brings the strokes back (history holds whole sketches). ⌘/Ctrl+Z and ⌘/Ctrl+Shift+Z still work.
- **More room** keeps its job (the page grows by 350 to 2800). The brief's "More room (full screen)" also asked for full screen, so a desktop gets a **Full screen** toggle beside it (`size="full"`).
- **One primary:** ADD TO NOTE, or SAVE SKETCH when editing; CANCEL beside it. Closing with new strokes asks "Discard changes?" (DISCARD, KEEP EDITING, focus on KEEP EDITING).
- **A new phone sketch is upright** (1000 × 1600) so it fills the screen it is drawn on; a desktop's stays 1000 × 700. Both are the stored format as it was (ADR-0046 already lets a sketch's height vary); `lib/sketch.ts` is unchanged.
- **A sketch this device can't edit** (an SVG without Vale's strokes) opens as its picture with "This sketch can't be edited here." and CLOSE, where it used to raise an error toast. `useSketchSheet.show` takes the picture as an optional third argument.

### Scans (`features/notes/scan-sheet.tsx`, brief N4)

- **A viewer layer** titled "Scan a document", overline `SCAN // PAGE 01`, the whole screen on a phone. Two steps where there were three.
- **Capture:** "The text in it becomes searchable. It is read on this device." Primary TAKE A PHOTO (the camera on a phone), secondary CHOOSE A FILE; with pages already taken, a text button ADD N PAGES TO NOTE. A photo that cannot be opened shows the reason in a compact critical `Banner` instead of a toast.
- **Adjust:** the photo as it was taken, with its outline and four corner handles; beside it on a desktop, and small beside it on a phone, **the page as it will be added**, squared and in the look chosen. (Drawing the look over the whole photo turned the desk into noise.) Each handle is a plain button (a 44 px target around a 16 px square on the corner), named "Top left: 12% across, 8% down"; arrow keys move it by 1%, Shift by 5%. LOOK is a `FilterChipGroup`: DOCUMENT · GRAYSCALE · COLOR; WHOLE PHOTO stays as a text button.
- **The pages so far** as `FileChip`s ("Page 1", JPG, its size, its thumbnail as an object URL) under `PAGES // 02`, each with Remove.
- **Buttons:** RETAKE · NEXT PAGE (secondary) · primary ADD TO NOTE or ADD N PAGES TO NOTE. Closing with a page taken asks "Discard changes?".
- The props `{ open, onOpenChange, onScanned }` are unchanged; the export is now `ScanDocument` and the sketch's `SketchPad` (a name ending in "Sheet" over a one-element root reads as a look-alike of unicron's `Sheet`). `note-editor.tsx` imports the new names.

### An image in a note (`features/notes/note-image.tsx`, brief N4)

- **On hover or focus** (always on a touch screen) a small `Toolbar` "Image" at the image's top end: View · Edit sketch (a sketch) · Text in image · Describe. It shows only what the image can do here. A press on it never moves the note's selection (it used to scroll the note under the finger on a phone).
- **Text in image:** an `AdaptivePopover` (a sheet on a phone), overline READ ON THIS DEVICE, the words, COPY (`useCopy`: "Copied" for 2 s, no toast) and ADD TO NOTE (each line a paragraph after the image). COPY also works in a note shared for reading.
- **Describe:** a popover with one `TextField`, DESCRIPTION, "Describe this image for people who can't see it". It is kept on Enter or when the popover closes, and Escape drops it, so one edit is still one change in the note's history.
- **Stand-ins:** a skeleton while loading; "Unlock notes to see this image." (locked); "This image isn't on this device yet."; a web image not loaded yet as a labelled placeholder with its description and SHOW FROM {host}. Square, on the raised surface with a hairline.

### The viewer (`features/notes/image-viewer.tsx`, brief N4)

- **The whole screen at every width:** overline `IMAGE 02 // 05`, the description as title ("No description yet" without one), then Actual size (a pressed toggle; Fit is it off), Save image and Close as float buttons in the sheet's header row.
- **Previous and next:** neutral float buttons at the sides on a desktop and medium width; on a phone at the start of a bottom row drawn as the detail row draws it. A swipe across and ← → do the same.

### Demo scenario (`core/demo-scenarios/notes.ts`)

- `notes-images`: "Icon axis ideas" holds a sketch, the hue ramps picture and a scanned page whose four lines were read already.

## Verification

- `tsc -b`, `oxlint` (no warnings), `vite build` (the app and the demo) and the notes relay's tests pass.
- **Ratchet, counted by reading:** className 92 → 87, style 0, spread 0, plain buttons 12 → 11 (the ink dots are `ToggleGroupItem`s; the corner handles stay plain buttons). The look-alike estimate finds none.
- **In the browser** (`pnpm shots`, desktop 1440 × 900, phone 390 × 844 and medium 768 × 1024, graphite and stone): `notes-sketch`, `notes-sketch-empty`, `notes-scan-capture`, `notes-scan-adjust`, `notes-image-toolbar`, `notes-image-text` and `notes-image-viewer`. Asserting scenes: draw, clear (no question), undo, redo, the discard question with focus on KEEP EDITING, add, edit again with the strokes back and save replacing the image (`notes-sketch-edit`); two pages from files added in order (`notes-scan-pages`); a corner moved by arrow keys saying its new place and keeping focus (`notes-scan-corners`); the viewer stepped by button on a phone and by ← → on a desktop. Every notes, shell, search and status scene still passes (276 of 276).

## Consequences

- Sketches and scans look and behave like the app's other layers; the canvas is still the app's own (brief 1.4).
- Not verified here: a real camera, a pen's pressure, a real swipe, and the reader on a real scan (the scenario sets the text).
