import type { UpdateWords } from "@unicron/ui"

import type { UpdateStatus } from "./update-client"

/**
 * The words About shows (brief T12; ADR-0076, ADR-0112): the update kit's
 * (snds/app-updates; cross-app decisions §3) with Vale's name and the
 * brief's short state lines. Unicron's `UpdateStatusRow` and
 * `AutoCheckSwitch` take them as `words`.
 */

/** The one state line under the version: "Up to date.", "Checking…", "{version} is ready." */
export function updateLine(s: UpdateStatus): string {
  if (!s.enabled) return s.off ?? "Updates are off in this build."
  const offered = s.offered ?? "The update"
  switch (s.state) {
    case "idle":
      return s.auto_check ? "Vale checks for updates when it opens and every six hours." : "Automatic checks are off. Check whenever you like."
    case "checking":
      return "Checking…"
    case "up_to_date":
      return "Up to date."
    case "downloading":
      return `Downloading ${offered}…`
    case "ready":
      return `${offered} is ready.`
    case "available":
      return `${offered} is out. ${s.link_why ?? ""}`.trim()
    case "failed":
      return s.error ?? "The update didn't work."
  }
}

/** The channel as Settings names it. */
export function channelName(channel: UpdateStatus["channel"]): string {
  if (channel === "main") return "main channel (every merged change)"
  if (channel === "local") return "local channel (this Mac's own builds)"
  return "stable channel"
}

/** About › This app: the desktop app's updater. */
export const APP_WORDS: Partial<UpdateWords> = {
  label: "Version",
  check: "Check for updates",
  restart: "Restart to update",
  reload: "Reload app",
  release: "Release notes",
  autoCheck: "Check for updates automatically",
  channel: channelName,
  version: (app, version, channel) => `${app} ${version} · ${channel}`,
  line: (s) => updateLine(s),
  autoCheckWhen: (channel) => (channel === "local" ? "When Vale opens and every five minutes." : "When Vale opens and every six hours."),
}

/** About › Server: the gateway's own check, which only looks (ADR-0077). */
export const SERVER_AUTO_WORDS: Partial<Pick<UpdateWords, "autoCheck" | "autoCheckWhen">> = {
  autoCheck: "Check for updates automatically",
  autoCheckWhen: () => "At start and every six hours. It only looks.",
}
