import Collaboration from "@tiptap/extension-collaboration"
import { Placeholder } from "@tiptap/extensions"
import { useEditor } from "@tiptap/react"
import { type ReactNode } from "react"
import type * as Y from "yjs"

import { Button, Icon, Tabs, TabsContent, TabsList, TabsTrigger, formatListCount } from "@unicron/ui"
import { FormatBar } from "@/components/format-bar"
import { RichEditor } from "@/components/rich-editor"
import { MAIL_EXTENSIONS, richTextClass } from "@/components/use-rich-editor"
import { useMyName } from "@/core/queries"

import { CommentThread } from "./comment"
import { DRAFT_FIELD, type TeamComment, addComment, removeComment } from "./team-doc"

/**
 * A shared conversation's tabs (ADR-0060, ADR-0097; brief M9): MESSAGES (the shared copy only; the
 * owner's own conversation shows its messages above), COMMENTS NN, REPLY and FILES, as line tabs.
 * On a phone the tab list scrolls sideways; each tab's field and button come after its content.
 */
export function TeamTabs({
  doc,
  comments,
  owner,
  from,
  readOnly,
  messages,
  files,
  onUseReply,
}: {
  doc: Y.Doc
  comments: TeamComment[]
  owner: boolean
  /** Who shared it, for a teammate's "who sends it" line. */
  from: string | null
  /** A stopped share: what's here stays, read-only. */
  readOnly: boolean
  /** MESSAGES' panel, on the shared copy. Without it the tab is left out (the owner's own conversation). */
  messages?: ReactNode
  files: ReactNode
  /** The owner's way to send the team's reply: it opens in the composer. */
  onUseReply?: (html: string) => void
}) {
  return (
    <Tabs defaultValue={messages ? "messages" : "comments"}>
      {/* A plain wrapper scrolls the tab list sideways when it is wider than a phone. */}
      <div className="-mx-1 overflow-x-auto px-1">
        <TabsList variant="line" aria-label="Team">
          {messages && <TabsTrigger value="messages">Messages</TabsTrigger>}
          <TabsTrigger value="comments">{`Comments ${formatListCount(comments.length)}`}</TabsTrigger>
          <TabsTrigger value="reply">Reply</TabsTrigger>
          <TabsTrigger value="files">Files</TabsTrigger>
        </TabsList>
      </div>
      {messages && <TabsContent value="messages">{messages}</TabsContent>}
      <TabsContent value="comments">
        <Comments doc={doc} comments={comments} readOnly={readOnly} />
      </TabsContent>
      <TabsContent value="reply">
        <SharedDraft doc={doc} owner={owner} from={from} readOnly={readOnly} onUseReply={onUseReply} />
      </TabsContent>
      <TabsContent value="files">{files}</TabsContent>
    </Tabs>
  )
}

function Comments({ doc, comments, readOnly }: { doc: Y.Doc; comments: TeamComment[]; readOnly: boolean }) {
  const me = useMyName()
  return (
    <CommentThread
      label="Comment"
      placeholder="Comment for the team…"
      addLabel="Add comment"
      caption="Comments stay with the team."
      empty="No comments yet."
      readOnly={readOnly}
      // Names are what each person calls themselves, so this only offers to take back your own.
      comments={comments.map((c) => ({ ...c, deletable: c.author === me }))}
      onAdd={(text) => addComment(doc, me, text)}
      onDelete={(id) => removeComment(doc, id)}
    />
  )
}

/** The reply, written together (brief M9): live for everyone with the link, on the shared rich-text field. */
function SharedDraft({ doc, owner, from, readOnly, onUseReply }: { doc: Y.Doc; owner: boolean; from: string | null; readOnly: boolean; onUseReply?: (html: string) => void }) {
  const editor = useEditor(
    {
      extensions: [
        // Yjs keeps the undo history, per person.
        ...MAIL_EXTENSIONS.map((e) => (e.name === "starterKit" ? e.configure({ heading: false, codeBlock: false, undoRedo: false }) : e)),
        Collaboration.configure({ document: doc, field: DRAFT_FIELD }),
        Placeholder.configure({ placeholder: "Write the reply together…" }),
      ],
      immediatelyRender: true,
      editable: !readOnly,
      editorProps: {
        attributes: { role: "textbox", "aria-label": "Reply together", "aria-multiline": "true", class: richTextClass(false) },
      },
    },
    [doc, readOnly],
  )
  return (
    <div className="flex flex-col gap-4">
      {/* The shared rich-text field (ADR-0089); someone reading along gets no format bar. */}
      <RichEditor editor={editor} label="Reply together" bar={readOnly ? undefined : <FormatBar editor={editor} />} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="type-caption text-muted-foreground">
          {owner ? "Everyone with the link writes here. Only you send it." : `${from ?? "The person who shared it"} sends it from their account.`}
        </p>
        {owner && onUseReply && !readOnly && (
          <Button variant="secondary" size="sm" onClick={() => editor && onUseReply(editor.isEmpty ? "" : editor.getHTML())}>
            <Icon name="reply" data-icon="inline-start" /> Use as reply
          </Button>
        )}
      </div>
    </div>
  )
}
