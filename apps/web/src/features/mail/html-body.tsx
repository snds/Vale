import DOMPurify from "dompurify"
import { useTheme } from "next-themes"
import { useMemo, useRef, useState } from "react"

import { Banner, Button } from "@unicron/ui"
import { useMailPrefs, useSenderProfile } from "@/core/queries"

/**
 * What the frame's document takes from the app's theme (brief M4, 1.3: HTML mail is one of the
 * four places that are more than tokens). The frame is a document of its own, so the values are
 * read from the app's root and written into its sheet: the body role's face, size and leading, and
 * Stone's ink and link colour. In Graphite the existing inversion turns that ink light; it follows
 * the app's theme, not the system's, so a dark app never shows a white letter. The frame's colour
 * scheme matches the app's, or the browser paints an opaque white canvas behind it.
 */
function frameLook(dark: boolean) {
  const css = getComputedStyle(document.documentElement)
  const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback
  return {
    ink: v("--g-theme-stone-body", "#1a1c1f"),
    link: v("--g-theme-stone-primary-text", "#1d4e89"),
    family: v("--type-body-family", "ui-sans-serif, system-ui, sans-serif"),
    size: v("--type-body-size", "1rem"),
    leading: v("--type-body-leading", "1.5rem"),
    dark,
  }
}

/**
 * Renders untrusted email HTML.
 * - DOMPurify strips scripts, handlers, and forms.
 * - The iframe sandbox has no `allow-scripts`, so nothing can run even if
 *   something slipped through. `allow-same-origin` only lets us size it.
 * - A CSP blocks remote content by default: tracking pixels never load
 *   until the reader asks for images (Apple Mail / HEY behavior), unless
 *   Advanced settings say to load them always, or for contacts (ADR-0055).
 */
export function HtmlBody({ html, from }: { html: string; from?: string }) {
  const [asked, setRemote] = useState(false)
  const { data: prefs } = useMailPrefs()
  const forContacts = prefs?.images === "contacts"
  const { data: sender } = useSenderProfile(forContacts && from ? from : null)
  const remote = asked || prefs?.images === "always" || (forContacts && !!sender?.contact)
  const frame = useRef<HTMLIFrameElement>(null)
  const dark = useTheme().resolvedTheme === "dark"

  const { doc, hasRemote } = useMemo(() => {
    // Second line of defense behind the CSP: until the reader consents, remote
    // URLs are removed from the markup, so no WebView ever attempts the fetch.
    let hasRemote = false
    const isRemote = (v: string | null) => !!v && /^\s*(https?:)?\/\//i.test(v)
    DOMPurify.addHook("afterSanitizeAttributes", (node) => {
      for (const attr of ["src", "srcset", "background", "poster"]) {
        if (isRemote(node.getAttribute(attr))) {
          hasRemote = true
          if (!remote) node.removeAttribute(attr)
        }
      }
      const style = node.getAttribute("style")
      if (style && /url\(\s*["']?(https?:)?\/\//i.test(style)) {
        hasRemote = true
        if (!remote) node.setAttribute("style", style.replace(/url\([^)]*\)/gi, "none"))
      }
    })
    const clean = DOMPurify.sanitize(html, {
      // <style> blocks can restyle our frame chrome; inline style attributes
      // carry most email layout, so those stay.
      FORBID_TAGS: ["form", "input", "button", "textarea", "select", "style"],
    })
    DOMPurify.removeHook("afterSanitizeAttributes")
    const img = remote ? "data: cid: https:" : "data: cid:"
    const look = frameLook(dark)
    const invert = look.dark ? `html{filter:invert(.92) hue-rotate(180deg)} img,video{filter:invert(1) hue-rotate(180deg)}` : ""
    const doc = `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src ${img}; font-src data:">
<base target="_blank">
<style>
  html{color-scheme:${look.dark ? "dark" : "light"}}
  html,body{margin:0;padding:0;background:transparent;color:${look.ink};font-family:${look.family};font-size:${look.size};line-height:${look.leading};overflow-wrap:anywhere}
  img{max-width:100%;height:auto} table{max-width:100%!important} a{color:${look.link}}
  ${invert}
</style></head><body>${clean}</body></html>`
    return { doc, hasRemote }
  }, [html, remote, dark])

  return (
    <div className="flex flex-col gap-4">
      {hasRemote && !remote && (
        <Banner
          tone="info"
          size="compact"
          title="Remote images are blocked."
          action={
            <Button variant="secondary" size="sm" onClick={() => setRemote(true)}>
              Load images
            </Button>
          }
        />
      )}
      <iframe
        ref={frame}
        title="Message body"
        sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        srcDoc={doc}
        className="min-h-24 w-full border-0"
        onLoad={() => {
          const body = frame.current?.contentDocument?.body
          if (frame.current && body) frame.current.style.height = `${body.scrollHeight}px`
        }}
      />
    </div>
  )
}
