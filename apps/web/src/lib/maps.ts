/**
 * Where MAP opens a place (Vale 48): the system's maps app on Apple devices (macOS, iOS, iPadOS),
 * as Apple Calendar and Fantastical do; OpenStreetMap's search elsewhere, the neutral web fallback.
 */

/** What the platform says about itself; `navigator` in the app, a stand-in in tests. */
export interface PlatformHint {
  platform?: string
  userAgent?: string
  userAgentData?: { platform?: string }
  maxTouchPoints?: number
}

/** Whether this is a Mac, an iPhone or an iPad (an iPad says "MacIntel" with touch points). */
export function isApplePlatform(p: PlatformHint): boolean {
  const name = `${p.userAgentData?.platform ?? ""} ${p.platform ?? ""}`
  if (/mac|iphone|ipad|ipod|ios/i.test(name)) return true
  return /iPhone|iPad|iPod|Macintosh/.test(p.userAgent ?? "")
}

/** The link MAP follows for a place. */
export function mapLink(place: string, p: PlatformHint = typeof navigator === "undefined" ? {} : navigator): string {
  const q = encodeURIComponent(place)
  return isApplePlatform(p) ? `maps://?q=${q}` : `https://www.openstreetmap.org/search?query=${q}`
}
