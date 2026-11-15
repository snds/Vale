import { InitialTile } from "@unicron/ui"

import { initials } from "../mail/format"

/**
 * HERE's value in a MetaList (brief M9): an Initial Tile S per person, each named, so a screen reader hears who.
 * A polite status, so a teammate arriving is said when the reader is free.
 */
export function HereTiles({ names }: { names: string[] }) {
  return (
    <span role="status" aria-label={`Here: ${names.join(", ")}`} className="flex flex-wrap gap-1" data-role="people-here">
      {names.map((n) => (
        <InitialTile key={n} size="s" name={n} initials={initials({ name: n, email: n })} />
      ))}
    </span>
  )
}
