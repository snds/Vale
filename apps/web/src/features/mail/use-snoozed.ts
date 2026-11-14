import { useMessagePages } from "@/core/queries"

/** The snoozed lane's first page, in its own order: what comes back first is first (ADR-0090). */
export function useSnoozed(accountId: string | null) {
  const { data } = useMessagePages({ lane: "snoozed", accountId, search: null })
  return data?.pages.flat() ?? []
}
