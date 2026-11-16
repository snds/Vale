import { registerIcons } from "@unicron/ui"

/**
 * Glyphs Unicron's icon set does not carry, so Vale registers its own (ADR-0082, ADR-0116). The
 * curated Carbon set in @unicron/ui is the home for an icon; a name lands here
 * only when Carbon has no honest match. Each value is the inner markup of a
 * 32 px drawing, filled with the current text color.
 */
registerIcons({
  // Forward a message: Carbon's `reply` arrow, mirrored. Carbon has `reply`
  // and `reply--all` and no forward arrow.
  "vale--forward":
    '<path transform="matrix(-1 0 0 1 32 0)" d="M28.88,30a1,1,0,0,1-.88-.5A15.19,15.19,0,0,0,15,22v6a1,1,0,0,1-.62.92,1,1,0,0,1-1.09-.21l-12-12a1,1,0,0,1,0-1.42l12-12a1,1,0,0,1,1.09-.21A1,1,0,0,1,15,4v6.11a17.19,17.19,0,0,1,15,17,16.34,16.34,0,0,1-.13,2,1,1,0,0,1-.79.86ZM14.5,20A17.62,17.62,0,0,1,28,26,15.31,15.31,0,0,0,13.91,12,1,1,0,0,1,13,11V6.41L3.41,16,13,25.59V21a1,1,0,0,1,1-1h.54Z"/>',
  // Carbon drawings Vale uses that left Unicron's curated set in 1.1 (Unicron 98, docs/08 → Icons),
  // copied from @carbon/icons 11.92.0 (Apache-2.0, © IBM Corp.) as Unicron 1.0 drew them.
  "star--filled":
    '<path d="M16,2l-4.55,9.22L1.28,12.69l7.36,7.18L6.9,30,16,25.22,25.1,30,23.36,19.87l7.36-7.17L20.55,11.22Z"/>',
  "zoom--in":
    '<path d="M18 12 14 12 14 8 12 8 12 12 8 12 8 14 12 14 12 18 14 18 14 14 18 14 18 12z"/><path d="M21.4479,20A10.856,10.856,0,0,0,24,13,11,11,0,1,0,13,24a10.856,10.856,0,0,0,7-2.5521L27.5859,29,29,27.5859ZM13,22a9,9,0,1,1,9-9A9.01,9.01,0,0,1,13,22Z"/>',
  "zoom--out":
    '<path d="M8 12H18V14H8z"/><path d="M21.4479,20A10.856,10.856,0,0,0,24,13,11,11,0,1,0,13,24a10.856,10.856,0,0,0,7-2.5521L27.5859,29,29,27.5859ZM13,22a9,9,0,1,1,9-9A9.01,9.01,0,0,1,13,22Z"/>',
  "chart--network":
    '<path d="M26,14a2,2,0,0,0,2-2V6a2,2,0,0,0-2-2H20a2,2,0,0,0-2,2v6a2,2,0,0,0,2,2h2v4.1A5,5,0,0,0,18.1,22H14V20a2,2,0,0,0-2-2H10V13.9a5,5,0,1,0-2,0V18H6a2,2,0,0,0-2,2v6a2,2,0,0,0,2,2h6a2,2,0,0,0,2-2V24h4.1A5,5,0,1,0,24,18.1V14ZM6,9a3,3,0,1,1,3,3A3,3,0,0,1,6,9Zm6,17H6V20h6Zm14-3a3,3,0,1,1-3-3A3,3,0,0,1,26,23ZM20,6h6v6H20Z"/>',
  "minimize":
    '<path d="M4 18 4 20 10.586 20 2 28.582 3.414 30 12 21.414 12 28 14 28 14 18 4 18z"/><path d="M30 3.416 28.592 2 20 10.586 20 4 18 4 18 14 28 14 28 12 21.414 12 30 3.416z"/>',
})

declare module "@unicron/ui" {
  interface UnicronIconRegistry {
    "vale--forward": true
    "star--filled": true
    "zoom--in": true
    "zoom--out": true
    "chart--network": true
    "minimize": true
  }
}
