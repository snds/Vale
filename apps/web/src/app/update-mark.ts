import { useQuery } from "@tanstack/react-query"
import { create } from "zustand"

import { isMember } from "@/core/client"
import { useCore } from "@/core/queries"
import { gateway } from "@/features/updates/gateway-client"
import { useUpdates } from "@/features/updates/use-updates"

/**
 * A demo scenario's stand-in for the desktop updater (`update-ready`,
 * core/demo-scenarios/shell.ts): the version it says is ready. Only the
 * in-memory demo sets it; the desktop app's updater answers through
 * `useUpdates`.
 */
export const useDemoUpdate = create<{ offered: string | null }>(() => ({ offered: null }))

/**
 * The update mark on the way into Settings (ADR-0083, cross-app decisions §3):
 * a square on the sidebar's item, the rail's item and the phone's top-right
 * button, with its words in the control's name. Undefined when nothing waits.
 */
export function useUpdateMark() {
  const state = useUpdates()?.state
  const demo = useDemoUpdate((s) => s.offered)
  const server = useServerUpdate()
  if (state === "ready" || demo !== null) return { square: true, label: "Update ready" } as const
  if (state === "available") return { square: true, label: "Update available" } as const
  if (server) return { square: true, label: "Server update available" } as const
  return undefined
}

/**
 * A newer gateway image is out, for the gateway's owner only (Vale 20): the same one signal as the
 * app's own update (cross-app decisions §3), on the way into Settings and on About. A team member
 * cannot update the server, so the mark would only nag them. It reads what About › Server reads
 * (the gateway's own check, under the same cache key).
 */
function useServerUpdate() {
  const owner = !!useCore().data?.remote && !isMember()
  const { data } = useQuery({ queryKey: ["gateway-updates"], queryFn: () => gateway().updates(), staleTime: 60_000, enabled: owner })
  return owner && data?.state === "available" && !!data.offered
}
