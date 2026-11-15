import { InitialTile } from "@unicron/ui"
import type { ContactSummary } from "@/core/types"

import { contactInitials } from "./contact-format"

const SIZE = { sm: "s", default: "m", lg: "l" } as const

/**
 * A contact's photo (embedded data only), or initials, on unicron's Initial
 * Tile (ADR-0102): `sm` 24, `default` 40, `lg` 64.
 *
 * `className` is kept for the callers that still size it that way (the
 * contact form): any class asks for the large tile. Nothing is passed on to
 * the tile itself.
 */
export function PersonAvatar({ contact, className, size }: { contact: Pick<ContactSummary, "fullName" | "photo">; className?: string; size?: "sm" | "default" | "lg" }) {
  return <InitialTile size={SIZE[size ?? (className ? "lg" : "default")]} initials={contactInitials(contact.fullName)} src={contact.photo ?? undefined} />
}
