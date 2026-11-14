import { Placeholder } from "@tiptap/extensions"
import { Extension, useEditor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"

import { cn } from "@/lib/utils"

/** The rich-text field's schema and editor (ADR-0089). The field itself is `rich-editor.tsx`. */

/** Leaves Mod-Enter to the form (send, save) instead of inserting a line break. */
const SendKey = Extension.create({
  name: "sendKey",
  priority: 1000,
  addKeyboardShortcuts: () => ({ "Mod-Enter": () => true }),
})

/** Only web and mail links; Tiptap's own check already refuses `javascript:`. */
export const SAFE_LINK = /^(https?:|mailto:)/i

/** The mail schema: email-sized formatting, no headings or code blocks. */
export const MAIL_EXTENSIONS = [
  StarterKit.configure({
    heading: false,
    codeBlock: false,
    link: { openOnClick: false, autolink: true, defaultProtocol: "https", isAllowedUri: (url, ctx) => SAFE_LINK.test(url) && ctx.defaultValidate(url) },
  }),
]

/** The text inside the box: the composer's prose rules, 16 px in from the sides as every field's value is. */
const TEXT = "composer-body px-4 py-3 outline-none"
/** A message field shows six lines at least (144 px); a short field (a signature, a template) three. */
export const richTextClass = (compact: boolean) => cn(TEXT, compact ? "min-h-21" : "min-h-36 flex-1")

/**
 * `focusFirst` marks the body as the composer's first focus. The dialog does
 * the focusing once it is open (see ComposeMail), which Tiptap's own autofocus
 * can't time reliably inside an opening dialog.
 */
export function useRichEditor({
  html,
  placeholder,
  focusFirst,
  label = "Message",
  compact = false,
}: {
  html: string
  placeholder: string
  focusFirst: boolean
  /** The accessible name; each editor on a screen needs its own. */
  label?: string
  /** A short field (signatures, templates) instead of the composer body. */
  compact?: boolean
}) {
  return useEditor({
    extensions: [...MAIL_EXTENSIONS, Placeholder.configure({ placeholder }), SendKey],
    content: html,
    immediatelyRender: true,
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-label": label,
        "aria-multiline": "true",
        ...(focusFirst ? { "data-composer-focus": "" } : {}),
        class: richTextClass(compact),
      },
    },
  })
}
