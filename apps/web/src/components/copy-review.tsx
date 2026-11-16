import { useEffect, useRef } from "react"
import { AdaptiveDialog, TextField } from "@unicron/ui"

import { useCopyReview } from "@/lib/copy"

/**
 * The text the clipboard refused, when it is too long for a toast (Vale 16): a 560 review dialog
 * with the text selected, ready to copy by hand (⌘C or Ctrl+C). Read-only; closing it loses nothing.
 */
export function CopyReview() {
  const shown = useCopyReview()
  const text = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    if (!shown) return
    const id = requestAnimationFrame(() => {
      text.current?.focus()
      text.current?.select()
    })
    return () => cancelAnimationFrame(id)
  }, [shown])
  return (
    <AdaptiveDialog
      open={!!shown}
      onOpenChange={(o) => !o && useCopyReview.setState(null)}
      size="review"
      overline="Copy by hand"
      title={shown?.label ?? ""}
      description="Your browser blocked the clipboard. The text is selected: copy it with ⌘C or Ctrl+C."
    >
      {shown && <TextField ref={text} multiline minRows={8} readOnly label={shown.label} data-role="copy-value" value={shown.value} />}
    </AdaptiveDialog>
  )
}
