/** Words and values the contacts area shows, apart from its components (ADR-0102). */

/** One or two letters for a name: "Priya Raman" → "PR", "ana@example.com" → "AE". */
export const contactInitials = (name: string) =>
  name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .map((p) => p[0]!.toUpperCase())
    .slice(0, 2)
    .join("") || "?"

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

/** As the frames write a birthday (Mobile / 12): "1990-04-02" → "Apr 02, 1990"; "--04-02" → "Apr 02". */
export function birthdayLabel(b: string) {
  const m = /^(\d{4}|-)-?(\d{2})-(\d{2})$/.exec(b)
  if (!m || !MONTHS[+m[2]! - 1]) return b
  return `${MONTHS[+m[2]! - 1]} ${m[3]}${m[1] === "-" ? "" : `, ${m[1]}`}`
}

/** What a QR card carries, as the core's own QR does: name, company, title, phones and emails. No photo, note or birthday. */
const SCANNED = new Set(["BEGIN", "VERSION", "FN", "N", "ORG", "TITLE", "TEL", "EMAIL", "END"])

/**
 * The card a phone's camera reads, cut from the core's own vCard export so
 * the text is the core's (ADR-0102): long lines unfolded, then only the
 * properties the core's QR code carries.
 */
export function scanCard(vcf: string) {
  return vcf
    .replace(/\r?\n[ \t]/g, "")
    .split(/\r?\n/)
    .filter((line) => SCANNED.has(line.split(/[;:]/, 1)[0]!.replace(/^[^.]*\./, "").toUpperCase()))
    .join("\r\n")
}

/** A card's own label for an email or a phone ("work", "CELL") as a Field Row label wants it: sentence case. */
export const fieldLabel = (label: string | null, fallback: string) => (label ? label.charAt(0).toUpperCase() + label.slice(1).toLowerCase() : fallback)
