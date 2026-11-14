import type { Address } from "@/core/types"

/**
 * How the recipient field reads its value (ADR-0089): the string the composer
 * and the event form already held, "Ana <ana@x.com>, sam@y.com".
 */

/** The reason a form's primary gives while a chip is wrong. */
export const RECIPIENT_PROBLEM = "Fix or remove the address in red."
/** The id of the line under a recipient field that says so (the chip field's own help line), for the primary's `aria-describedby`. */
export const recipientProblemId = (fieldId: string) => `${fieldId}-help`

const SEPARATORS = /[,;\n]/
export const pieces = (text: string) => text.split(SEPARATORS).map((p) => p.trim()).filter(Boolean)

/** One part of the value: "Ana <ana@x.com>" or a bare address. */
export const read = (piece: string): Address => {
  const m = piece.match(/^"?([^"<]*?)"?\s*<([^>]+)>$/)
  return m ? { name: m[1]!.trim() || null, email: m[2]!.trim() } : { name: null, email: piece }
}
export const write = (a: Address) => (a.name ? `${a.name} <${a.email}>` : a.email)
export const isAddress = (piece: string) => /^[^\s@<>]+@[^\s@<>]+$/.test(read(piece).email)

/** True when any part of the value is not an address: the form must not go out. */
export const hasWrongAddress = (value: string) => pieces(value).some((p) => !isAddress(p))
