import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"

import { Icon, type IconName, Banner, Button, Skeleton, TextField } from "@unicron/ui"
import { getCoreClient } from "@/core/client"
import type { Account, OAuthClientInfo, OAuthIssuer } from "@/core/types"

import { AccountFormEnd, AccountFormTop, FormFailed } from "./onboarding/add-form"
import { useAddPlace } from "./onboarding/add-place"

interface ProviderCopy {
  company: string
  grants: { icon: IconName; text: string }[]
  stays: string
  hintLabel: string
  hintPlaceholder: string
  hintHelp: string
  builtInWarning: string
  ownWarning: string
  noClient: string
  /** What the provider calls the app's registration. */
  clientNoun: string
  clientIdLabel: string
  clientIdPlaceholder: string
  clientIdHelp: string
  /** Google gives Desktop clients a secret; Microsoft public clients have none. */
  secret: boolean
  docs: string
}

const DOCS = "https://github.com/snds/Vale/blob/main/docs"

const COPY: Record<OAuthIssuer, ProviderCopy> = {
  google: {
    company: "Google",
    grants: [
      { icon: "email", text: "Read, organize, and send your Gmail" },
      { icon: "calendar", text: "See and edit your Google Calendar" },
      { icon: "user--multiple", text: "See and edit your Google Contacts" },
    ],
    stays: "Everything stays on this device. Revoke access any time in your Google Account, or by removing the account here.",
    hintLabel: "Gmail address (optional)",
    hintPlaceholder: "you@gmail.com",
    hintHelp: "Picks the account on Google's page if you're signed in to several.",
    builtInWarning: "Until Google verifies this app, Google shows a warning page first. Continue only if you trust this copy of the app.",
    ownWarning: "Your own OAuth client is in testing mode, so Google shows a warning page and only allows the test users you added.",
    noClient: "This build has no Google sign-in set up. Google requires each app to register, so add your own OAuth client to sign in.",
    clientNoun: "OAuth client",
    clientIdLabel: "Client ID",
    clientIdPlaceholder: "…apps.googleusercontent.com",
    clientIdHelp: "In Google Cloud, create an OAuth client of type Desktop app and enable the Gmail, Calendar, and CardDAV APIs.",
    secret: true,
    docs: `${DOCS}/google-verification.md#use-your-own-oauth-client`,
  },
  microsoft: {
    company: "Microsoft",
    grants: [
      { icon: "email", text: "Read, organize, and send your Outlook mail" },
      { icon: "calendar", text: "See and edit your Outlook calendars" },
      { icon: "user--multiple", text: "See and edit your Outlook contacts" },
    ],
    // Microsoft has no way for an app to revoke its own sign-in.
    stays: "Everything stays on this device. Removing the account here deletes its sign-in from this device; to revoke access everywhere, use the app permissions page of your Microsoft account.",
    hintLabel: "Microsoft account email (optional)",
    hintPlaceholder: "you@outlook.com",
    hintHelp: "Suggests this account on Microsoft's page.",
    builtInWarning: "Microsoft lists this app as unverified until its publisher is verified. Continue only if you trust this copy of the app.",
    ownWarning: "Microsoft asks you to approve your own app registration the first time. Work or school accounts may need an administrator to approve it.",
    noClient: "This build has no Microsoft sign-in set up. Microsoft requires each app to register, so add your own app registration to sign in.",
    clientNoun: "app registration",
    clientIdLabel: "Application (client) ID",
    clientIdPlaceholder: "00000000-0000-0000-0000-000000000000",
    clientIdHelp: "In the Microsoft Entra admin center, register an app for personal and work accounts, add the Mobile and desktop platform with the redirect http://localhost, and allow public client flows.",
    secret: false,
    docs: `${DOCS}/microsoft-setup.md`,
  },
}

/**
 * Step 2 for Google and Microsoft (brief X8; ADR-0107): the person signs in
 * on the provider's own page, in the system browser. The app never sees the
 * password; it gets tokens it can refresh. CONTINUE IN BROWSER keeps its
 * word while it waits, with a way to cancel. The client the build signs in
 * with can be replaced by the person's own, and a build with none set up
 * opens on that form.
 */
export function OAuthSignIn({ issuer, title, onAdded }: { issuer: OAuthIssuer; title: string; onAdded: (a: Account) => void }) {
  const copy = COPY[issuer]
  const { block, onBack } = useAddPlace()
  const qc = useQueryClient()
  const { data: client, isPending } = useQuery({ queryKey: ["oauth-client", issuer], queryFn: async () => (await getCoreClient()).getOAuthClient(issuer) })
  const [editing, setEditing] = useState(false)
  const [hint, setHint] = useState("")
  // CANCEL ends the wait on purpose: the core's "sign-in was cancelled" is then no news.
  const [cancelled, setCancelled] = useState(false)

  const signIn = useMutation({
    mutationFn: async () => (await getCoreClient()).addOAuthAccount(issuer, hint.trim() || null),
    onSuccess: (a) => {
      void qc.invalidateQueries()
      onAdded(a)
    },
  })
  const start = () => {
    setCancelled(false)
    signIn.mutate()
  }
  const cancel = () => {
    setCancelled(true)
    void getCoreClient().then((c) => c.cancelOAuthSignIn())
  }
  const needsClient = !isPending && (!client || editing)
  const failed = signIn.error && !cancelled ? (signIn.error instanceof Error ? signIn.error.message : String(signIn.error)) : null

  return (
    <div className="flex flex-1 flex-col gap-8">
      <AccountFormTop title={title} onBack={() => (signIn.isPending && cancel(), onBack())} />
      <p className="type-body text-text-secondary">{`You'll sign in on ${copy.company}'s page in your browser. This app never sees your ${copy.company} password.`}</p>

      {isPending ? (
        <Skeleton variant="row" />
      ) : needsClient ? (
        <ClientForm issuer={issuer} copy={copy} current={client ?? null} onClose={() => setEditing(false)} />
      ) : (
        <>
          <section aria-label="What the app can do" className="flex flex-col gap-3">
            <p className="type-caption text-text-label">{copy.company} will ask you to allow this app to:</p>
            <ul className="flex flex-col gap-3">
              {copy.grants.map((g) => (
                <li key={g.text} className="type-body flex items-center gap-3 text-text-body">
                  <Icon name={g.icon} tone="muted" /> {g.text}
                </li>
              ))}
            </ul>
            <p className="type-caption text-text-secondary">{copy.stays}</p>
          </section>
          <TextField
            id="oauth-hint"
            label={copy.hintLabel}
            type="email"
            autoComplete="email"
            autoCapitalize="none"
            placeholder={copy.hintPlaceholder}
            helper={copy.hintHelp}
            readOnly={signIn.isPending}
            value={hint}
            onChange={(e) => setHint(e.target.value)}
          />
          {/* The provider shows a warning page first: say so before the person meets it. */}
          <Banner tone="info" size="compact" body={client?.builtIn ? copy.builtInWarning : copy.ownWarning} />
          <FormFailed message={failed} />
          <AccountFormEnd
            primary={
              <Button block={block} loading={signIn.isPending} onClick={start}>
                <Icon name="launch" data-icon="inline-start" /> Continue in browser
              </Button>
            }
          >
            {signIn.isPending ? (
              <>
                <div role="status" className="flex flex-col gap-1">
                  <p className="type-ui text-text-body">Finish signing in in your browser</p>
                  <p className="type-caption text-text-secondary">When {copy.company} says you're signed in, come back here. The tab can be closed.</p>
                </div>
                <Button variant="ghost" onClick={cancel}>
                  Cancel
                </Button>
              </>
            ) : (
              <Button variant="ghost" onClick={() => setEditing(true)}>
                {client?.builtIn ? "Use your own client" : "Change client"}
              </Button>
            )}
          </AccountFormEnd>
        </>
      )}
    </div>
  )
}

/** CLIENT ID and, for Google, CLIENT SECRET, with the provider's own instructions; SAVE CLIENT, and REMOVE CLIENT for a saved one. */
function ClientForm({ issuer, copy, current, onClose }: { issuer: OAuthIssuer; copy: ProviderCopy; current: OAuthClientInfo | null; onClose: () => void }) {
  const { block } = useAddPlace()
  const [clientId, setClientId] = useState("")
  const [secret, setSecret] = useState("")
  const qc = useQueryClient()
  const save = useMutation({
    mutationFn: async (value: { clientId: string; clientSecret: string | null } | null) => (await getCoreClient()).setOAuthClient(issuer, value),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["oauth-client", issuer] })
      onClose()
    },
  })
  return (
    <form aria-label={`Your own ${copy.clientNoun}`} className="flex flex-1 flex-col gap-8" onSubmit={(e) => (e.preventDefault(), save.mutate({ clientId: clientId.trim(), clientSecret: secret.trim() || null }))}>
      {!current && (
        <p className="type-body text-text-body" role="status">
          {copy.noClient}
        </p>
      )}
      <div className="flex flex-col gap-4">
        <TextField
          id="oauth-client-id"
          label={copy.clientIdLabel}
          required
          autoComplete="off"
          placeholder={copy.clientIdPlaceholder}
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          helper={
            <>
              {copy.clientIdHelp}{" "}
              <a href={copy.docs} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                Step-by-step guide
              </a>
            </>
          }
        />
        {copy.secret && (
          <TextField
            id="oauth-client-secret"
            label="Client secret"
            autoComplete="off"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            helper="Google gives Desktop clients one and asks for it at sign-in. In an installed app it isn't a real secret; it's kept on this device."
          />
        )}
      </div>
      <FormFailed message={save.error ? (save.error instanceof Error ? save.error.message : String(save.error)) : null} />
      <AccountFormEnd
        primary={
          <Button type="submit" block={block} loading={save.isPending && save.variables !== null}>
            Save client
          </Button>
        }
      >
        {current && !current.builtIn && (
          <Button variant="ghost" type="button" loading={save.isPending && save.variables === null} onClick={() => save.mutate(null)}>
            Remove client
          </Button>
        )}
        {current && (
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
        )}
      </AccountFormEnd>
    </form>
  )
}
