import { useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"

import { AdaptiveMenu, AdaptiveMenuRadioGroup, AdaptiveMenuRadioItem, FieldRow, FieldRowAction } from "@unicron/ui"
import { getCoreClient, isMember, sayHere } from "@/core/client"
import { useMe, useTeamMembers, useThreadTeam } from "@/core/queries"
import type { ThreadTeam } from "@/core/types"

import { useRowSize } from "../mail/invite-words"
import { CommentThread } from "./comment"

/** While a conversation is open, the gateway hears so, and tells the team (ADR-0063). */
function useHere(threadId: string) {
  useEffect(() => {
    const say = (t: string | null) => void sayHere(t).catch(() => {})
    say(threadId)
    // The gateway forgets after 70 seconds without hearing again.
    const beat = setInterval(() => say(threadId), 30_000)
    return () => {
      clearInterval(beat)
      say(null)
    }
  }, [threadId])
}

/** "Me" and "Nobody" have values of their own; a member is chosen by id. */
const ME = "me"
const NOBODY = "nobody"

/**
 * A shared inbox's side of a conversation (ADR-0063; brief M9 B), under TEAM // NOT SENT: ASSIGNED TO with
 * a name or Nobody and ASSIGN (a menu of the members, Me, Nobody); then the team's notes, never sent to anyone
 * on the conversation. The gateway's owner can delete anyone's note; everyone else, their own. A failed
 * change says so beside its control, in the server's words (cross-app decisions §9).
 */
export function InboxTeamPanel({ threadId }: { threadId: string }) {
  useHere(threadId)
  const { data: team } = useThreadTeam(threadId)
  const { data: members = [] } = useTeamMembers()
  const me = useMe()
  const qc = useQueryClient()
  const size = useRowSize()
  const [assignError, setAssignError] = useState<string | null>(null)
  const [noteError, setNoteError] = useState<string | null>(null)
  const others = members.filter((m) => !m.pending && m.id !== me.id)
  const put = (t: ThreadTeam) => qc.setQueryData(["inbox-team", "thread", threadId], t)
  const act = async (work: () => Promise<ThreadTeam | void>, fail: (message: string | null) => void) => {
    fail(null)
    try {
      const t = await work()
      if (t) put(t)
      else void qc.invalidateQueries({ queryKey: ["inbox-team", "thread", threadId] })
    } catch (e) {
      fail(e instanceof Error ? e.message : String(e))
    }
  }
  const assignee = team?.assignee ?? null
  const value = !assignee ? NOBODY : assignee.id === me.id ? ME : assignee.id
  const assign = (v: string) => {
    const to = v === ME ? me : (others.find((m) => m.id === v) ?? null)
    void act(async () => (await getCoreClient()).assignThread(threadId, to && { id: to.id, name: to.name }, me), setAssignError)
  }
  const who = !assignee ? "Nobody" : assignee.id === me.id ? `${assignee.name} (you)` : assignee.name
  const by = assignee && assignee.by !== assignee.name ? `${assignee.by} assigned it.` : undefined
  return (
    <div className="flex flex-col gap-4" data-role="inbox-team">
      <div className="flex flex-col gap-2">
        <FieldRow
          size={size}
          label="Assigned to"
          rule="none"
          description={by}
          action={
            <AdaptiveMenu title="Assign" align="end" trigger={<FieldRowAction>Assign</FieldRowAction>}>
              <AdaptiveMenuRadioGroup label="Who handles this" value={value} onValueChange={(v) => assign(String(v))}>
                {others.map((m) => (
                  <AdaptiveMenuRadioItem key={m.id} value={m.id}>
                    {m.name}
                  </AdaptiveMenuRadioItem>
                ))}
                <AdaptiveMenuRadioItem value={ME}>Me</AdaptiveMenuRadioItem>
                <AdaptiveMenuRadioItem value={NOBODY}>Nobody</AdaptiveMenuRadioItem>
              </AdaptiveMenuRadioGroup>
            </AdaptiveMenu>
          }
        >
          {who}
        </FieldRow>
        {assignError && (
          <p role="alert" className="type-caption text-destructive">
            {assignError}
          </p>
        )}
      </div>
      <CommentThread
        label="Note"
        placeholder="Note for the team…"
        addLabel="Add note"
        caption="Notes stay with the team. They never go to anyone on the conversation."
        empty="No notes yet."
        // The owner can tidy anyone's; everyone else, their own.
        comments={(team?.comments ?? []).map((c) => ({ ...c, deletable: c.authorId === me.id || !isMember() }))}
        onAdd={(text) => act(async () => (await getCoreClient()).addThreadComment(threadId, text, me), setNoteError)}
        onDelete={(id) => void act(async () => (await getCoreClient()).removeThreadComment(id, me, !isMember()), setNoteError)}
      />
      {noteError && (
        <p role="alert" className="type-caption text-destructive">
          {noteError}
        </p>
      )}
    </div>
  )
}
