import { toast } from "@unicron/ui"

import { useUi } from "@/app/ui-store"

import type { ShareLink } from "./share-link"
import { guestShares } from "./shared-docs"

/** Adds a link's note (or finds the one it already made) and opens it. Says why, when it can't. */
export function useAddShared() {
  const jumpTo = useUi((s) => s.jumpTo)
  return async (link: ShareLink): Promise<boolean> => {
    const g = guestShares()
    if (!g) return false
    try {
      const { id, ready } = await g.add(link)
      // Toasts name the thing, with no full stop (brief N6; decisions §12).
      const title = link.title.trim() || "the shared note"
      if (ready === "timeout") toast(`Added ${title} to your notes`, { description: "Its text arrives once the owner's relay can be reached" })
      else toast(`Added ${title} to your notes`)
      jumpTo({ kind: "note", id })
      return true
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
      return false
    }
  }
}
