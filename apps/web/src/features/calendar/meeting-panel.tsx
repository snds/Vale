import { FieldRow, FieldRowAction, buttonVariants, useAppFrame } from "@unicron/ui"
import { useCore } from "@/core/queries"
import type { ManageLink, MeetingInfo } from "@/core/types"
import { useCopy } from "@/lib/copy"

import { JoinButton } from "./join-button"
import { useJoin } from "./meeting"

/** "+16699006833" → "+1 669 900 6833" for North American numbers; others as written. */
const pretty = (n: string) => (/^\+1\d{10}$/.test(n) ? `+1 ${n.slice(2, 5)} ${n.slice(5, 8)} ${n.slice(8)}` : n)

const ACTION: Record<string, string> = { reschedule: "Reschedule", cancel: "Cancel booking", manage: "Change booking" }

/** A value to read out or paste, with COPY: "Copied" in place of its word for 2 s, and no toast (brief 4.0). */
function CopyRow({ label, value, copy, size }: { label: string; value: string; copy: string; size: "default" | "stacked" }) {
  const { copied, copy: run } = useCopy({ what: label.toLowerCase(), label })
  return (
    <FieldRow
      size={size}
      label={label}
      action={
        <FieldRowAction onClick={() => void run(copy)} aria-live="polite">
          {copied ? "Copied" : "Copy"}
        </FieldRowAction>
      }
    >
      {value}
    </FieldRow>
  )
}

/**
 * The call, as its invitation describes it (ADR-0030; brief C2): JOIN (in
 * the app or the browser) with OPEN IN BROWSER beside it when Join opens an
 * app, then Field Rows for the service, the meeting ID and passcode to read
 * out or paste, the numbers to call in on, and a booking tool's own
 * reschedule and cancel pages.
 *
 * `join={false}` leaves JOIN out where the screen has it elsewhere (a phone's
 * float button). `compact` is the invitation card's (mail).
 */
export function MeetingPanel({ meeting, manage, compact = false, join = true }: { meeting: MeetingInfo | null | undefined; manage?: ManageLink[]; compact?: boolean; join?: boolean }) {
  const frame = useAppFrame()
  const { data: core } = useCore()
  const native = core?.kind === "native" && !core.remote
  if (!meeting && !manage?.length) return null
  const size = frame.phone ? "stacked" : "default"
  // Booking tools' pages open in the browser (desktop: through the system).
  const open = (url: string) => (e: React.MouseEvent) => {
    if (native && core) {
      e.preventDefault()
      void core.openMeeting(url)
    }
  }
  return (
    <section aria-label="Video call" className="flex flex-col" data-slot="meeting">
      {meeting && <JoinRow meeting={meeting} compact={compact} join={join} />}
      {meeting && (
        <div className="flex flex-col">
          {meeting.service && (
            <FieldRow size={size} label="Video call">
              {serviceName(meeting.service)}
            </FieldRow>
          )}
          {meeting.meetingId && <CopyRow size={size} label="Meeting ID" value={meeting.meetingId} copy={meeting.meetingId.replace(/\s/g, "")} />}
          {meeting.passcode && <CopyRow size={size} label="Passcode" value={meeting.passcode} copy={meeting.passcode} />}
          {meeting.dialIn.slice(0, compact ? 1 : 2).map((d) => (
            <FieldRow
              key={d.tel}
              size={size}
              label="Call in"
              description={d.label ?? undefined}
              action={
                <FieldRowAction href={d.tel} aria-label={`Call in on ${pretty(d.number)}${d.label ? `, ${d.label}` : ""}`}>
                  Call
                </FieldRowAction>
              }
            >
              {pretty(d.number)}
            </FieldRow>
          ))}
        </div>
      )}
      {manage && manage.length > 0 && (
        <FieldRow
          size={size}
          label="Booking"
          action={manage.map((m) => (
            <FieldRowAction key={m.url} href={m.url} target="_blank" rel="noreferrer" onClick={open(m.url)}>
              {ACTION[m.action] ?? "Change booking"}
            </FieldRowAction>
          ))}
        >
          {`Booked with ${manage[0]!.tool}`}
        </FieldRow>
      )}
    </section>
  )
}

/** The service as its rows name it: "Zoom", "Google Meet". */
const SERVICE: Record<string, string> = { zoom: "Zoom", meet: "Google Meet", teams: "Teams", webex: "Webex", jitsi: "Jitsi", whereby: "Whereby", facetime: "FaceTime", goto: "GoTo", chime: "Chime" }
const serviceName = (s: string) => SERVICE[s] ?? s

/**
 * JOIN, the screen's one primary, and the text action OPEN IN BROWSER when Join opens the service's app.
 * Where JOIN stands elsewhere (`join` false), OPEN IN BROWSER stays: it is the one way to the web call.
 */
function JoinRow({ meeting, compact, join: withJoin }: { meeting: MeetingInfo; compact: boolean; join: boolean }) {
  const join = useJoin(meeting.url, meeting.appUrl)
  if (!withJoin && !join.inApp) return null
  return (
    <div className="flex flex-wrap items-center gap-2 pb-4">
      {withJoin && <JoinButton url={meeting.url} appUrl={meeting.appUrl} size={compact ? "sm" : "default"} long />}
      {join.inApp && (
        <a
          href={meeting.url}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => {
            if (join.native) {
              e.preventDefault()
              join.open(meeting.url)
            }
          }}
          className={buttonVariants({ variant: "ghost", size: compact ? "xs" : "sm" })}
        >
          Open in browser
        </a>
      )}
    </div>
  )
}
