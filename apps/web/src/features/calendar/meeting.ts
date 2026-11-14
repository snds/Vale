import { useCore, useMeetingPrefs } from "@/core/queries"
import type { Occurrence } from "@/core/types"

/** "Zoom", "Google Meet" … from a meeting link, for labels. */
export function meetingService(url: string) {
  let host = ""
  try {
    host = new URL(url).hostname.toLowerCase()
  } catch {
    // Not a URL; fall through to the generic name.
  }
  const is = (h: string) => host === h || host.endsWith(`.${h}`)
  if (is("zoom.us") || is("zoomgov.com")) return "Zoom"
  if (is("meet.google.com")) return "Google Meet"
  if (is("teams.microsoft.com") || is("teams.live.com")) return "Teams"
  if (is("webex.com")) return "Webex"
  if (is("meet.jit.si")) return "Jitsi"
  if (is("whereby.com")) return "Whereby"
  if (is("facetime.apple.com")) return "FaceTime"
  if (is("meet.goto.com") || is("gotomeeting.com")) return "GoTo"
  if (is("chime.aws")) return "Chime"
  return "the call"
}

/** The location to show: a bare meeting link reads as its service ("Google Meet"), not a long URL. */
export function placeLabel(o: Pick<Occurrence, "location" | "meetingUrl">) {
  return o.meetingUrl && o.location?.trim() === o.meetingUrl ? meetingService(o.meetingUrl) : o.location
}

/**
 * Where Join goes (ADR-0030): the service's own app when there is a link for
 * it and Settings › Calendar says so, else the web. The desktop app (not a
 * gateway's browser) hands the link to the system, which knows which app
 * takes it. `open` follows the link from a control that is not a link (a
 * phone's float button).
 */
export function useJoin(url: string, appUrl?: string | null) {
  const { data: prefs } = useMeetingPrefs()
  const { data: core } = useCore()
  const inApp = !!appUrl && (prefs?.openInApps ?? true)
  const href = inApp ? appUrl! : url
  const native = core?.kind === "native" && !core.remote
  const open = (to = href) => {
    if (native && core) void core.openMeeting(to)
    // An app link opens the app; a new tab for it would stay blank.
    else if (to.startsWith("https:")) window.open(to, "_blank", "noopener,noreferrer")
    else window.location.assign(to)
  }
  return { href, inApp, native, service: meetingService(url), open }
}
