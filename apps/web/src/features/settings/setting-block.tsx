import type { ReactNode } from "react"

import { SectionHeader } from "@unicron/ui"

/**
 * One overline group of a settings section (brief T0): its header, then its
 * rows, each drawing its own hairline. A section stacks its groups 32 apart.
 * The group is a region named by its header, so a screen reader and the
 * scenes find it by name.
 */
export function SettingBlock({ title, count, action, children }: { title: string; count?: number; action?: ReactNode; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col">
      <SectionHeader title={title} count={count} action={action} level={3} />
      {children}
    </section>
  )
}
