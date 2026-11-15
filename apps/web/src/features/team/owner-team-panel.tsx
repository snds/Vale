import { Skeleton } from "@unicron/ui"
import type { TeamThread } from "@/core/types"

import { OwnerFiles } from "./team-files"
import { TeamTabs } from "./team-panel"
import { useTeamLive } from "./team-sync"
import { useHereIn, useTeamDoc } from "./use-team-doc"

/**
 * The owner's own copy, in the Inbox (ADR-0060; brief M9): COMMENTS, REPLY and FILES under TEAM // NOT SENT,
 * after the messages. The conversation's pinned reply field stays its only Composer.
 */
export function OwnerTeamPanel({ share, onUseReply }: { share: TeamThread; onUseReply: (html: string) => void }) {
  const { doc, data } = useTeamDoc(share.id)
  useHereIn(share.id, useTeamLive((s) => !!s[share.id]))
  // Sized by its wrapper: the library owns Skeleton's look.
  if (!doc || !data)
    return (
      <div role="status" aria-busy="true" aria-label="Opening the team's side" className="h-40 w-full [&>*]:size-full">
        <Skeleton />
      </div>
    )
  return (
    <TeamTabs
      doc={doc}
      comments={data.comments}
      owner
      from={share.from}
      readOnly={false}
      onUseReply={onUseReply}
      files={share.threadId ? <OwnerFiles shareId={share.id} threadId={share.threadId} /> : null}
    />
  )
}
