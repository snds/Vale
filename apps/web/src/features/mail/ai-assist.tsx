import { useUi } from "@/app/ui-store"
import { Button, ListRow, SummaryBlock, formatListCount } from "@unicron/ui"
import { useCopy } from "@/lib/copy"

import type { useSuggestedReplies, useThreadSummary } from "./use-ai-assist"

/** Opens AI settings, where a failed answer can be fixed. */
const openSettings = () => useUi.getState().openSettings("ai")

/** A failed answer's two ways on (brief M5): ask again, or fix the settings. */
function Retry({ retry }: { retry: () => void }) {
  return (
    <>
      <Button variant="ghost" size="sm" onClick={retry}>
        Try again
      </Button>
      <Button variant="ghost" size="sm" onClick={openSettings}>
        Open settings
      </Button>
    </>
  )
}

/**
 * The summary under the title (ADR-0092; brief M5; Mobile / 02, Desktop / 01): unicron's
 * SummaryBlock, the one mark for what a model wrote. `Summary // 03 points`, the points,
 * then where they came from (`Newest 12 of 30 messages // {model}`, the count only when the
 * model read part of the thread) and the line that it can be wrong. COPY and close. It shows
 * only once asked for (ADR-0059): nothing is sent until then.
 */
export function SummaryCard({ summary, onClose }: { summary: ReturnType<typeof useThreadSummary>; onClose: () => void }) {
  const { copied, copy } = useCopy({ what: "summary" })
  if (summary.isIdle) return null
  const data = summary.data
  const close = (
    <Button variant="ghost" size="sm" onClick={onClose}>
      Close
    </Button>
  )
  if (summary.isError)
    return <SummaryBlock state="error" overline="Summary" error={summary.error.message} actions={<><Retry retry={() => summary.mutate()} />{close}</>} />
  if (!data) return <SummaryBlock state="loading" overline="Summary" aria-label="Summarizing" />
  return (
    <SummaryBlock
      overline={`Summary // ${formatListCount(data.points.length)} ${data.points.length === 1 ? "point" : "points"}`}
      lines={data.points}
      footer={[data.used < data.total ? `Newest ${data.used} of ${data.total} messages` : null, data.model].filter(Boolean).join(" // ")}
      caption="It can be wrong. Check what matters."
      actions={
        <>
          <Button variant="ghost" size="sm" onClick={() => void copy(data.points.join("\n"))}>
            {copied ? "Copied" : "Copy"}
          </Button>
          {close}
        </>
      }
    />
  )
}

/**
 * Suggested replies under the last message (brief M5): `Replies // 03`, each a row to press.
 * Picking one puts its words in the reply field; nothing is ever sent from here.
 */
export function SuggestedRepliesRow({ replies, onPick }: { replies: ReturnType<typeof useSuggestedReplies>; onPick: (text: string) => void }) {
  if (replies.isIdle) return null
  const data = replies.data
  const close = (
    <Button variant="ghost" size="sm" onClick={() => replies.reset()}>
      Close
    </Button>
  )
  if (replies.isError)
    return <SummaryBlock state="error" overline="Replies" error={replies.error.message} actions={<><Retry retry={() => replies.mutate()} />{close}</>} />
  if (!data) return <SummaryBlock state="loading" overline="Replies" aria-label="Thinking of replies" />
  return (
    <SummaryBlock overline={`Replies // ${formatListCount(data.replies.length)}`} footer={data.model} caption="Pick one to put it in the reply. Nothing is sent." actions={close}>
      <div role="list" aria-label="Suggested replies">
        {data.replies.map((r) => (
          <ListRow key={r} render={<div role="listitem" />} size="compact" title={r} onClick={() => onPick(r)} />
        ))}
      </div>
    </SummaryBlock>
  )
}
