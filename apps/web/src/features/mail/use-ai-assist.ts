import { useMutation } from "@tanstack/react-query"

import { getCoreClient } from "@/core/client"

const ask = <T,>(fn: (c: Awaited<ReturnType<typeof getCoreClient>>) => Promise<T>) => getCoreClient().then(fn)

/** A conversation's summary, asked for once (ADR-0059). Nothing is sent until `run`. */
export function useThreadSummary(threadId: string) {
  return useMutation({ mutationKey: ["ai", "summary", threadId], mutationFn: () => ask((c) => c.summarizeThread(threadId)) })
}

export function useSuggestedReplies(threadId: string) {
  return useMutation({ mutationKey: ["ai", "replies", threadId], mutationFn: () => ask((c) => c.suggestReplies(threadId)) })
}

/** Both asks for one conversation: its summary and its suggested replies. */
export function useAiAssist(threadId: string) {
  return { summary: useThreadSummary(threadId), replies: useSuggestedReplies(threadId) }
}
