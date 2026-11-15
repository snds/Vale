import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"

import { AutoCheckSwitch, Button, EmptyState, FieldRow, FieldRowAction, FieldRowValue, Skeleton } from "@unicron/ui"
import { setServerUpdating } from "@/app/live-status"
import { type GatewayUpdates, SIGNED_OUT } from "@/core/client"
import { useCopy } from "@/lib/copy"
import { SaveFailed } from "@/features/settings/save-failed"
import { SettingBlock } from "@/features/settings/setting-block"
import { useRowSize } from "@/features/settings/row-size"
import { gateway } from "@/features/updates/gateway-client"
import { SERVER_AUTO_WORDS, channelName } from "@/features/updates/update-model"

const KEY = ["gateway-updates"]

/** How often About looks while the gateway restarts, and for how long. */
const FOLLOW_EVERY_MS = 2_000
const FOLLOW_TRIES = 450

const said = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** An Update or Reload About is waiting on: the version it started from, and where it stands. */
interface Following {
  from: string
  line: string
  /** Stopped: the last line stays as the row's description. */
  ended: boolean
}

/** "Thu 09:16", as the frames write a time; the date once it is a week old. */
function checkedLine(secs: number, now = new Date()) {
  const at = new Date(secs * 1000)
  if (now.getTime() - at.getTime() > 6 * 86_400_000) return at.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
  const day = at.toLocaleDateString(undefined, { weekday: "short" })
  return `${day} ${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`
}

/**
 * Settings › About › SERVER (brief T12; ADR-0077, ADR-0078, ADR-0112), for
 * the gateway's owner: VERSION with "{version} is out." when a newer image
 * exists; UPDATE TO {version} (the one primary, only with the host helper),
 * RELOAD SERVER and CHECK FOR UPDATES; LAST CHECKED; the automatic check,
 * which only looks. With no host helper, the UPDATE COMMAND to run by hand.
 * While the helper restarts the gateway, the shell's live status says
 * UPDATING SERVER on every screen (ADR-0086), and when the gateway is back
 * and asks for a sign-in, the door shows (brief X9). No toasts: the row says
 * what happened (DC12).
 */
export function GatewayUpdatesSection() {
  const qc = useQueryClient()
  const { data: status, error: loadError, refetch, isRefetching } = useQuery({ queryKey: KEY, queryFn: () => gateway().updates(), staleTime: 60_000 })
  const [busy, setBusy] = useState<"check" | "update" | "reload" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [autoFailed, setAutoFailed] = useState<string | null>(null)
  const [savingAuto, setSavingAuto] = useState(false)
  const [following, setFollowing] = useState<Following | null>(null)
  const size = useRowSize()
  const followFrom = following && !following.ended ? following.from : null

  // While the gateway restarts, the shell's live status says so on every screen (ADR-0086).
  useEffect(() => {
    setServerUpdating(followFrom !== null)
    return () => setServerUpdating(false)
  }, [followFrom])

  // While an Update or Reload runs, look every two seconds. The gateway goes away (a failed
  // request), then comes back asking for a sign-in (sign-ins live in its memory), or on a new
  // version, or with the helper's refusal.
  useEffect(() => {
    if (!followFrom) return
    let tries = 0
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const say = (line: string, ended = false) => setFollowing({ from: followFrom, line, ended })
    const tick = async () => {
      if (stopped) return
      if (++tries > FOLLOW_TRIES) {
        say("This is taking longer than it should. Look at the host helper's log on the host (docker compose logs, in its folder).", true)
        return
      }
      const peek = await gateway().peek()
      if (stopped) return
      if (peek.kind === "signed-out") {
        // Back, and every session is gone: the gateway's door (brief X9).
        say("The gateway restarted.", true)
        window.dispatchEvent(new Event(SIGNED_OUT))
        return
      }
      if (peek.kind === "away") {
        say("Reconnecting… the gateway is restarting.")
      } else {
        const now = peek.status
        qc.setQueryData(KEY, now)
        if (now.version !== followFrom) {
          say(`${now.version} is running.`, true)
          return
        }
        if (now.action && now.action.state !== "working") {
          say(now.action.line, true)
          return
        }
        if (now.action) say(now.action.line)
      }
      timer = setTimeout(() => void tick(), FOLLOW_EVERY_MS)
    }
    timer = setTimeout(() => void tick(), FOLLOW_EVERY_MS)
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [followFrom, qc])

  if (loadError && !status) {
    return (
      <EmptyState
        tone="critical"
        size="sm"
        overline="Server"
        title="Can't load the server's updates."
        body={said(loadError)}
        action={
          <Button variant="secondary" loading={isRefetching} onClick={() => void refetch()}>
            Try again
          </Button>
        }
      />
    )
  }
  if (!status) {
    return (
      <div className="flex flex-col gap-5" aria-busy="true" aria-label="Loading the server's updates">
        <Skeleton variant="row" />
        <Skeleton variant="row" />
        <Skeleton variant="row" />
      </div>
    )
  }

  const run = async (kind: "check" | "update" | "reload", work: () => Promise<GatewayUpdates>) => {
    setError(null)
    setBusy(kind)
    try {
      qc.setQueryData(KEY, await work())
      return true
    } catch (e) {
      setError(said(e))
      return false
    } finally {
      setBusy(null)
    }
  }

  /** Asks the host helper, then waits for the gateway to come back. */
  const restart = async (kind: "update" | "reload", work: () => Promise<GatewayUpdates>) => {
    const from = status.version
    setFollowing(null)
    if (await run(kind, work)) {
      const now = qc.getQueryData<GatewayUpdates>(KEY)
      setFollowing({ from, line: now?.action?.line ?? "Asking the host helper…", ended: false })
    }
  }

  const waiting = !!following && !following.ended
  const newer = status.state === "available" && status.offered ? status.offered : null
  const lastAction = !following && status.action && status.action.state !== "working" ? status.action : null
  // The row's one line: what is happening now, else what the last restart did, else the check's state.
  const line = following ? (
    following.line
  ) : lastAction?.state === "failed" ? (
    <span className="text-critical-text">{lastAction.line}</span>
  ) : status.state === "failed" ? (
    <span className="text-critical-text">{status.error ?? status.line}</span>
  ) : status.state === "checking" ? (
    "Checking…"
  ) : newer ? (
    `${newer} is out.`
  ) : (
    (lastAction?.line ?? status.line)
  )
  const canUpdate = status.canUpdate && !!status.offered

  return (
    <SettingBlock title="Server">
      <FieldRow size={size} label="Version" description={<span role="status">{line}</span>}>
        {`${status.version} · ${channelName(status.channel)}`}
      </FieldRow>
      {(status.enabled || status.canReload) && (
        <div className="flex flex-col gap-2 pt-3 pb-4">
          <div className="flex flex-wrap items-center gap-2">
            {canUpdate && (
              <Button disabled={busy !== null || waiting} loading={busy === "update"} onClick={() => void restart("update", () => gateway().update(status.offered as string))}>
                Update to {status.offered}
              </Button>
            )}
            {status.canReload && (
              <Button variant="secondary" disabled={busy !== null || waiting} loading={busy === "reload"} onClick={() => void restart("reload", () => gateway().reload())}>
                Reload server
              </Button>
            )}
            {status.enabled && (
              <Button variant="secondary" disabled={busy !== null || waiting || status.state === "checking"} loading={busy === "check"} onClick={() => void run("check", () => gateway().check())}>
                Check for updates
              </Button>
            )}
          </div>
          <SaveFailed message={error} />
          {waiting ? (
            <p className="type-caption text-text-secondary">The gateway goes away for a moment. Everyone signs in again.</p>
          ) : (
            canUpdate && (
              <p className="type-caption text-text-secondary">
                It takes {status.image}:{status.offered}, checked against the build its release names, on the same data and settings. Back up the data volume first.
              </p>
            )
          )}
        </div>
      )}
      {status.checkedAt && (
        <FieldRow size={size} label="Last checked">
          {checkedLine(status.checkedAt)}
        </FieldRow>
      )}
      {!status.helper.ready && newer && status.command && <UpdateCommand status={status} command={status.command} size={size} />}
      <AutoCheckSwitch
        status={{ enabled: status.enabled, auto_check: status.autoCheck, channel: status.channel }}
        words={SERVER_AUTO_WORDS}
        disabled={savingAuto}
        onCheckedChange={(on) => {
          setSavingAuto(true)
          setAutoFailed(null)
          gateway()
            .setAutoCheck(on)
            .then((s) => qc.setQueryData(KEY, s))
            .catch((e: unknown) => setAutoFailed(said(e)))
            .finally(() => setSavingAuto(false))
        }}
      />
      <SaveFailed message={autoFailed} />
      {!status.helper.ready && (
        <p className="type-caption pt-4 text-text-secondary">
          {status.helper.problem && <span className="text-critical-text">The host helper's settings aren't usable: {status.helper.problem} </span>}
          Update and Reload from here need the host helper beside the gateway.{" "}
          <Button variant="link" size="inline" render={<a href={status.helper.install} target="_blank" rel="noopener noreferrer" />}>
            Its install steps
          </Button>
        </p>
      )}
    </SettingBlock>
  )
}

/** With no host helper (brief T12): the command that takes the newer image, to run beside the gateway's compose.yaml. */
function UpdateCommand({ status, command, size }: { status: GatewayUpdates; command: string; size: "stacked" | "default" }) {
  const { copied, copy } = useCopy({ what: "command", label: "Update command" })
  return (
    <FieldRow
      size={size}
      label="Update command"
      description={`Run it on the gateway's server, beside its compose.yaml. It pulls ${status.image}:main, the same build as ${status.offered}, on the same data and settings. Back up the data volume first.`}
      action={
        <>
          <FieldRowAction onClick={() => void copy(command)}>{copied ? "Copied" : "Copy"}</FieldRowAction>
          <FieldRowAction href={status.page} target="_blank" rel="noopener noreferrer">
            Release notes
          </FieldRowAction>
        </>
      }
    >
      <FieldRowValue truncate="wrap">{command}</FieldRowValue>
    </FieldRow>
  )
}
