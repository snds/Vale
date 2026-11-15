import { useQueryClient } from "@tanstack/react-query"

import { getCoreClient } from "@/core/client"
import type { RelayConfig } from "@/core/types"
import type { useConfirm } from "@/lib/confirm"

import { newKey } from "./sealed"

/** Saves where notes sync (or `null`: no sync), and reads it back everywhere. */
export function useSaveRelay() {
  const qc = useQueryClient()
  return async (value: RelayConfig | null) => {
    await (await getCoreClient()).setNotesRelay(value)
    await qc.invalidateQueries({ queryKey: ["notes", "relay"] })
  }
}

/**
 * Turning on end-to-end encryption (ADR-0062; brief T5): what changes,
 * before it does, as one question with its three consequences. The yes
 * unshares what was shared without a key (the relay could read it), then
 * saves the new key, so notes upload sealed and the relay drops its readable
 * copies. Focus starts on Cancel.
 */
export function useTurnOnEncryption(confirm: ReturnType<typeof useConfirm>) {
  const qc = useQueryClient()
  const saveRelay = useSaveRelay()
  const ask = (relay: RelayConfig) =>
    confirm.ask({
      title: "Turn on end-to-end encryption?",
      description: "Only your devices will be able to read your notes. The relay keeps them, but can't open them.",
      confirmLabel: "Turn on",
      tone: "default",
      run: async () => {
        const c = await getCoreClient()
        for (const r of await c.noteRecords()) if (!r.deleted && r.share?.role === "owner" && !r.share.revoked && !r.share.key) await c.unshareNote(r.id)
        for (const t of await c.teamThreads()) if (t.role === "owner" && !t.revoked && !t.key) await c.stopTeamThread(t.id)
        // An open note that was shared moves off its old document now, not on its next refresh.
        await qc.invalidateQueries({ queryKey: ["notes"] })
        await saveRelay({ ...relay, key: newKey() })
      },
    })
  return ask
}

