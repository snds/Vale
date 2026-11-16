# ADR-0117 · Vale's own theme and its own calendar event

- **Status:** Accepted (Sean's rulings on Unicron 1 and Unicron 2, 2026-11-16).
- **Date:** 2026-11-16
- **Builds on:** [ADR-0116](0116-unicron-1-1.md) (Unicron 1.1), [ADR-0082](0082-unicron-1-0.md) (`data-theme="vale"`, the `dark` class for graphite), [ADR-0098](0098-calendar-views.md) (the calendar's cards and their emphasis).
- **Design:** Unicron's `docs/05-consuming.md` → *Declare your app's theme* and `docs/08-migrating-to-1.1.md` → *CalendarEvent moves to Vale*; Figma's `vale / graphite` and `vale / stone` modes; Calendar Event (32:116).

Unicron 1.1 keeps no app's theme and no calendar part. Vale holds both now, so nothing on screen changes but the selected event.

## Decisions

### The theme (Unicron 1)

- `apps/web/src/styles/theme.css` declares Vale's 28 theme slots (14 per ground) under `[data-theme="vale"]`, after the core and before the area files. The values are the ones `@unicron/tokens` 1.0.0-pre.2 shipped for Vale, copied exactly (and the same as Unicron's playground copy of Figma's modes).
- It is the one place in Vale's layer with raw colours: the slots are what a theme is. Everything else still aliases a role.
- `index.html` keeps `data-theme="vale"`; the `dark` class still picks graphite.
- **Measured in CI:** `pnpm --filter web contrast` runs Unicron's `unicron-contrast` on `theme.css` with `styles/contrast-exceptions.json`: 826 gated measures clear their floor on both grounds; 50 named exceptions, each with why (the Figma values with no room for a surface, the lighter 1.1 washes, Vale graphite's running wash at Lc 59.6, stone's body and secondary under Lc 10 apart). The tool fails on a new miss and on an exception that starts to pass.
- **Nothing looks different:** the full screenshot set taken on Unicron 1.0.0-pre.2 and again with this layer differ only where Unicron 1.1 itself changed something (listed in the hand-off).

### The calendar event (Unicron 2)

- `components/calendar-event.tsx` is Vale's `CalendarEvent`, built from core parts only: a button (Base UI's `useRender`, a link with `href`), `bg-surface-raised` or `bg-primary-soft` for the next event, the hover and press washes over the fill, the 2px bar inside the padding (`bg-line-rule`, `bg-primary-fill` for the next event, or the calendar's swatch through Tile's `swatchFillClasses`), the time in `type-meta`, the title in `type-ui-emphasis`, the place in `type-caption`; compact is one line, 24 tall, with `hit-area`. It is named by its text in reading order; `OccurrenceCard` passes the spoken name.
- **The selected event has its own look (Unicron 89).** In 1.0 it took the next event's look exactly. Now it is drawn as a selected row is: the soft fill and `edge-l`, the 2px edge in `--primary-mark` the full height, in place of the bar, with `aria-current="true"`. Vale's emphasis rule (ADR-0098) stays: while an event is open, the next one is neutral with its NEXT line.
- Tests: the `calendar-event` scene asserts one selected card with the edge in `--primary-mark` and its bar hidden, and no other card with an edge; the views' scenes keep asserting one emphasis at most.

## Consequences

- A change to Vale's colours is a change to `theme.css` (and Figma), measured by the contrast tool; it no longer waits for a Unicron release.
- Figma's Calendar Event (32:116) belongs on a Vale page, with a Selected state using the 2px edge (a redraw for Sean).
