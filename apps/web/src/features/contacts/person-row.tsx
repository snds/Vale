import type { ReactElement } from "react"

import { Highlight, InitialTile, ListRow } from "@unicron/ui"
import type { ContactSummary } from "@/core/types"

import { contactInitials } from "./contact-format"

export interface PersonRowProps {
  contact: ContactSummary
  onOpen: () => void
  /** The card open beside the list. */
  selected?: boolean
  /** Where the card lives, when more than one address book shows (ADR-0027). */
  source?: string
  /** The words a search matched: marked in the name and the line under it. */
  query?: string
  /**
   * As the contacts list draws it (ADR-0102; brief P1, Mobile / 11, Q8): the
   * full height, no photo, the first email (else the first phone, else the
   * company) in mono, `// {book}` after it, and the first label at the right.
   */
  list?: boolean
  /** With `list`: the address book after the detail line, when more than one shows. */
  book?: string
  /** The row as another element: `<li />` in a list. */
  render?: ReactElement
}

/**
 * A person as a row (ADR-0085): the core's `ContactSummary` on unicron's
 * inline row. Search lists it compact, with the photo or initials, the name,
 * then the first email (the company or a phone number when there is none).
 * The contacts list adds `list` (ADR-0102).
 */
export function PersonRow({ contact: c, onOpen, selected, source, query, list, book, render }: PersonRowProps) {
  const mark = (text: string) => (query ? <Highlight text={text} query={query} /> : text)
  if (list) {
    const line = c.emails[0]?.value ?? c.phones[0]?.value ?? c.org
    const meta = [line, book].filter(Boolean).join(" // ")
    return (
      <ListRow
        render={render}
        layout="inline"
        selected={selected}
        onClick={onOpen}
        title={mark(c.fullName)}
        meta={meta ? mark(meta) : undefined}
        metaStyle="plain"
        status={c.labels[0]}
      />
    )
  }
  const line = c.emails[0]?.value ?? c.org ?? c.phones[0]?.value
  return (
    <ListRow
      render={render}
      size="compact"
      selected={selected}
      onClick={onOpen}
      leading={<InitialTile size="s" initials={contactInitials(c.fullName)} src={c.photo ?? undefined} />}
      title={mark(c.fullName)}
      meta={line ? mark(line) : undefined}
      metaStyle="plain"
      status={source}
    />
  )
}
