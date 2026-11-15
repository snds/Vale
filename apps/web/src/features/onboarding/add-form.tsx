import { useContext, type ReactNode } from "react"

import { Banner, Button, Icon, PageHead } from "@unicron/ui"
import { AccountScreenHead } from "@/features/settings/account-screen-head"

import { AddContext, useAddPlace, type AddContextValue } from "./add-place"

/**
 * The parts step 2 of adding an account is drawn with (brief X8; ADR-0107),
 * in first run's focus frame or Settings › Accounts' column (`add-place.ts`).
 */

export function AddPlaceProvider({ where, onBack, children }: AddContextValue & { children: ReactNode }) {
  return <AddContext.Provider value={{ where, onBack }}>{children}</AddContext.Provider>
}

/**
 * The form's head: in the focus frame, a way back to step 1 and the step's
 * title in the page head; in Settings, the pushed screen's head (ADR-0104).
 * `onBack` replaces the place's own way back (a sign-in waiting in the
 * browser is cancelled first).
 */
export function AccountFormTop({ title, onBack }: { title: string; onBack?: () => void }) {
  const place = useContext(AddContext)
  const back = onBack ?? place.onBack
  if (place.where === "settings") return <AccountScreenHead title={title} onBack={back} />
  return (
    <div className="flex flex-col items-start gap-4">
      <Button variant="ghost" size="sm" onClick={back}>
        <Icon name="arrow--left" data-icon="inline-start" />
        Back
      </Button>
      <PageHead title={title} size="sm" />
    </div>
  )
}

/**
 * The form's end: its one primary, then what belongs under it (a line, a
 * text button). On a phone it stands at the foot of the screen, full width,
 * and rides above the on-screen keyboard (`--keyboard-inset`, index.css).
 */
export function AccountFormEnd({ primary, children }: { primary: ReactNode; children?: ReactNode }) {
  const { where, phone } = useAddPlace()
  const under = children ? <div className={where === "settings" && !phone ? "flex flex-col items-end gap-2" : "flex flex-col items-center gap-2 text-center"}>{children}</div> : null
  if (phone) {
    return (
      <div className="sticky bottom-(--keyboard-inset) mt-auto flex flex-col gap-3 bg-surface-ground pt-4 pb-[max(--spacing(4),env(safe-area-inset-bottom))]">
        {primary}
        {under}
      </div>
    )
  }
  return (
    <div className={where === "settings" ? "flex flex-col items-end gap-2" : "flex flex-col gap-3"}>
      {primary}
      {under}
    </div>
  )
}

/** A form that could not save: the server's words, in a compact critical Banner above its end (brief 4.0, X8). */
export function FormFailed({ message }: { message: string | null }) {
  if (!message) return null
  return <Banner tone="critical" size="compact" body={message} />
}
