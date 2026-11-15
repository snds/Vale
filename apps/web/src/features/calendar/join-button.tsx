import { Icon, buttonVariants } from "@unicron/ui"
import { cn } from "@/lib/utils"

import { useJoin } from "./meeting"

/**
 * Joins the event's call (ADR-0030): in Zoom's or Teams' app when there's a
 * link for it and you haven't chosen the browser, else on the web.
 */
export function JoinButton({
  url,
  appUrl,
  size = "sm",
  variant = "default",
  long = false,
  className,
}: {
  url: string
  /** The same call in its service's app. */
  appUrl?: string | null
  size?: "sm" | "default"
  variant?: "default" | "outline"
  /** "Join Zoom" instead of "Join", where there's room. */
  long?: boolean
  className?: string
}) {
  const join = useJoin(url, appUrl)
  // A real link (not a button rendered as one), so it opens, copies, and reads as a link.
  return (
    <a
      href={join.href}
      // App links open the app; a new tab for them would stay blank.
      target={join.inApp ? undefined : "_blank"}
      rel="noreferrer"
      aria-label={long ? undefined : `Join ${join.service}`}
      title={join.inApp ? `Opens the ${join.service} app` : undefined}
      data-opens={join.inApp ? "app" : "browser"}
      onClick={(e) => {
        // Keep the click from also selecting the row or card it sits in.
        e.stopPropagation()
        if (join.native) {
          e.preventDefault()
          join.open()
        }
      }}
      className={cn(buttonVariants({ size, variant }), className)}
    >
      <Icon name="video" data-icon="inline-start" /> {long ? `Join ${join.service}` : "Join"}
    </a>
  )
}
