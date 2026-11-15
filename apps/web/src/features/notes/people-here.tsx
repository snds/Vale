import { Avatar, AvatarFallback, AvatarGroup, AvatarGroupCount, InitialTile } from "@unicron/ui"

import { initials } from "../mail/format"
import { type Person, peopleLine, usePresence } from "./presence"

// One empty list, so the store's answer stays the same object while nobody's here.
const NOBODY: Person[] = []

/**
 * Who else has this shared note or conversation open (ADR-0061): faces, and a line that says so.
 * `tiles` (the note's top line, brief N2): an Initial Tile S each, up to three, with the line said
 * to screen readers only.
 */
export function PeopleHere({ shareId, tiles = false }: { shareId: string | null; tiles?: boolean }) {
  const people = usePresence((s) => (shareId ? (s[shareId] ?? NOBODY) : NOBODY))
  // One face per name: two windows of one person are one person.
  const names = [...new Set(people.map((p) => p.name))]
  if (!shareId || names.length === 0) return null
  if (tiles) {
    return (
      <span role="status" className="inline-flex shrink-0 items-center gap-1" data-role="people-here">
        {names.slice(0, 3).map((n) => (
          <InitialTile key={n} size="s" initials={initials({ name: n, email: n })} />
        ))}
        {names.length > 3 && <span className="type-meta text-muted-foreground">+{names.length - 3}</span>}
        <span className="sr-only">{peopleLine(people)}</span>
      </span>
    )
  }
  return (
    <span role="status" className="inline-flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground" data-role="people-here">
      <AvatarGroup aria-hidden>
        {names.slice(0, 3).map((n) => (
          <Avatar key={n} size="sm">
            <AvatarFallback>{initials({ name: n, email: n })}</AvatarFallback>
          </Avatar>
        ))}
        {names.length > 3 && <AvatarGroupCount>+{names.length - 3}</AvatarGroupCount>}
      </AvatarGroup>
      {peopleLine(people)}
    </span>
  )
}
