import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"

import { AdaptiveMenuItem, Badge, Button, EmptyState, FieldRow, FieldRowAction, Skeleton, TextField } from "@unicron/ui"
import { FormLayer, FormLayerForm } from "@/components/editor-frame"
import { type Invitation, invitationUrl } from "@/core/client"
import type { GatewayMember } from "@/core/types"
import { useConfirm } from "@/lib/confirm"
import { useCopy } from "@/lib/copy"
import { useLeaveGuard } from "@/lib/leave-guard"
import { SaveFailed } from "@/features/settings/save-failed"
import { SettingBlock } from "@/features/settings/setting-block"
import { useRowSize } from "@/features/settings/row-size"
import { gateway } from "@/features/updates/gateway-client"

const said = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** The team as Settings reads it. Under `inbox-team`, so whatever changes the team reads it again everywhere. */
const ROSTER = ["inbox-team", "roster"]

/** The layer over the rows: adding someone, or the link a NEW LINK made. */
type Layer = { kind: "add" } | { kind: "link"; invite: Invitation } | null

/**
 * Settings › Team members (brief T10; ADR-0063, ADR-0112), for the
 * gateway's owner. The section's line says what members can do. A row per
 * person: the name, the email in mono or "Owner (you)", NOT JOINED YET while
 * an invitation is out, NEW LINK for a member, REMOVE in the row's menu,
 * which asks. ADD MEMBER opens the form layer: NAME · EMAIL · CREATE
 * INVITATION, then the link to copy, shown once.
 */
export function Members() {
  const qc = useQueryClient()
  const { data: members, error, refetch, isRefetching } = useQuery({ queryKey: ROSTER, queryFn: () => gateway().members(), staleTime: 60_000 })
  const [layer, setLayer] = useState<Layer>(null)
  const [failed, setFailed] = useState<{ id: string; message: string } | null>(null)
  const confirm = useConfirm()
  const size = useRowSize()
  const refresh = () => void qc.invalidateQueries({ queryKey: ["inbox-team"] })

  const newLink = useMutation({
    mutationFn: (m: GatewayMember) => gateway().newLink(m.id),
    onMutate: () => setFailed(null),
    onSuccess: (invite) => {
      refresh()
      setLayer({ kind: "link", invite })
    },
    onError: (e, m) => setFailed({ id: m.id, message: said(e) }),
  })

  const remove = (m: GatewayMember) =>
    void confirm
      .ask({
        title: `Remove ${m.name}?`,
        description: "They're signed out now. What's assigned to them goes back to nobody.",
        confirmLabel: "Remove",
        run: () => gateway().removeMember(m.id),
      })
      .then((yes) => yes && refresh())

  if (error && !members) {
    return (
      <EmptyState
        tone="critical"
        size="sm"
        overline="Team members"
        title="Can't load team members."
        body={said(error)}
        action={
          <Button variant="secondary" loading={isRefetching} onClick={() => void refetch()}>
            Try again
          </Button>
        }
      />
    )
  }
  if (!members) {
    return (
      <div className="flex flex-col gap-5" aria-busy="true" aria-label="Loading team members">
        <Skeleton variant="row" />
        <Skeleton variant="row" />
        <Skeleton variant="row" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-8">
      <SettingBlock title="People" count={members.length}>
        <ul className="flex flex-col" aria-label="People">
          {members.map((m) => (
            <li key={m.id}>
              <FieldRow
                size={size}
                label={m.name}
                badge={m.role === "member" && m.pending ? <Badge>Not joined yet</Badge> : undefined}
                action={
                  m.role === "member" && (
                    <FieldRowAction loading={newLink.isPending && newLink.variables?.id === m.id} onClick={() => newLink.mutate(m)}>
                      New link
                    </FieldRowAction>
                  )
                }
                menu={
                  m.role === "member" ? (
                    <AdaptiveMenuItem icon="user--minus" variant="destructive" onSelect={() => remove(m)}>
                      Remove
                    </AdaptiveMenuItem>
                  ) : undefined
                }
                menuLabel={m.role === "member" ? `More actions for ${m.name}` : undefined}
              >
                {m.role === "owner" ? "Owner (you)" : (m.email ?? "")}
              </FieldRow>
              {failed?.id === m.id && <SaveFailed message={failed.message} />}
            </li>
          ))}
        </ul>
      </SettingBlock>
      <div>
        <Button variant="secondary" onClick={() => setLayer({ kind: "add" })}>
          Add member
        </Button>
      </div>

      <FormLayer open={layer !== null} onClose={() => setLayer(null)}>
        {layer?.kind === "add" && <AddMemberForm onCreated={(invite) => (refresh(), setLayer({ kind: "link", invite }))} />}
        {layer?.kind === "link" && <InvitationForm invite={layer.invite} onDone={() => setLayer(null)} />}
      </FormLayer>
      {confirm.question()}
    </div>
  )
}

/** ADD MEMBER's form: NAME · EMAIL · the primary CREATE INVITATION. A refusal stays in the form, in the gateway's words. */
function AddMemberForm({ onCreated }: { onCreated: (invite: Invitation) => void }) {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [tried, setTried] = useState(false)
  useLeaveGuard(() => !!name.trim() || !!email.trim())
  const add = useMutation({ mutationFn: () => gateway().addMember(name.trim(), email.trim()), onSuccess: onCreated })
  const nameProblem = !name.trim() ? "Enter their name" : null
  const emailProblem = !email.trim() ? "Enter their email" : !/^[^\s@]+@[^\s@]+$/.test(email.trim()) ? "That isn't an email address" : null
  return (
    <FormLayerForm
      overline="Team members"
      title="Add member"
      primary={{ label: "Create invitation", icon: "checkmark", loading: add.isPending }}
      error={add.error ? said(add.error) : null}
      onSubmit={() => {
        setTried(true)
        if (!nameProblem && !emailProblem) add.mutate()
      }}
    >
      <TextField label="Name" autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} error={tried && nameProblem ? nameProblem : undefined} data-form-focus="" />
      <TextField label="Email" type="email" autoComplete="off" autoCapitalize="none" spellCheck={false} value={email} onChange={(e) => setEmail(e.target.value)} error={tried && emailProblem ? emailProblem : undefined} />
    </FormLayerForm>
  )
}

/** The one time an invitation's link shows: INVITATION LINK with COPY LINK, and DONE. */
function InvitationForm({ invite, onDone }: { invite: Invitation; onDone: () => void }) {
  const url = invitationUrl(invite.code)
  const { copied, copy } = useCopy({ what: "link", label: "Invitation link" })
  const size = useRowSize()
  return (
    <FormLayerForm overline="Invitation" title={invite.member.name} primary={{ label: "Done", icon: "checkmark" }} onSubmit={onDone}>
      <div className="flex flex-col">
        <FieldRow size={size} label="Invitation link" description={`Works once, for ${invite.days} days. It won't show again.`} action={<FieldRowAction onClick={() => void copy(url)}>{copied ? "Copied" : "Copy link"}</FieldRowAction>}>
          {url}
        </FieldRow>
      </div>
      <p className="type-caption text-text-secondary">Send it to {invite.member.email ?? invite.member.name} yourself. They choose a password with it.</p>
    </FormLayerForm>
  )
}
