import { useInboxHere } from "@/core/queries"

import { usePresence } from "../notes/presence"

// One empty list, so the stores' answers stay the same object while nobody's here.
const NOBODY: { name: string }[] = []

const unique = (people: { name: string }[]) => [...new Set(people.map((p) => p.name))]

/** Who else has a shared conversation open (ADR-0061): one name per person, however many windows. */
export function useShareHere(shareId: string | null): string[] {
  return unique(usePresence((s) => (shareId ? (s[shareId] ?? NOBODY) : NOBODY)))
}

/** Who else on the gateway's team has this conversation open (ADR-0063). */
export function useInboxHereNames(threadId: string | null): string[] {
  return unique(useInboxHere((s) => (threadId ? (s[threadId] ?? NOBODY) : NOBODY)))
}
