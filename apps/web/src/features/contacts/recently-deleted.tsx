import { AppFrameInset, Button, EmptyState, ListRow, Skeleton, toast } from "@unicron/ui"
import { useCollections, useDeletedContacts, usePimAction } from "@/core/queries"

import { folio } from "../calendar/dates"

/**
 * Recently deleted (brief P5): contacts deleted, and cards merged into
 * another, in the last 30 days. Each row is the name, the day it went, and
 * RESTORE. One column up to 720.
 */
export function RecentlyDeletedPane({ onRestored }: { onRestored: (id: string) => void }) {
  const { data: gone = [], isPending } = useDeletedContacts()
  const { data: books = [] } = useCollections("contacts")
  const restore = usePimAction((c, id: string) => c.restoreContact(id))
  const run = async (id: string) => {
    try {
      const back = await restore.mutateAsync(id)
      toast.success(`Restored ${back.fullName || "contact"}`)
      onRestored(back.id)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    }
  }
  if (isPending)
    return (
      <div className="flex max-w-180 flex-col" aria-hidden data-slot="deleted-loading">
        <Skeleton variant="row" />
        <Skeleton variant="row" />
        <Skeleton variant="row" />
      </div>
    )
  return (
    <section className="flex max-w-180 flex-col pb-10" aria-label="Recently deleted">
      {gone.length === 0 ? (
        <AppFrameInset>
          <EmptyState overline="Recently deleted // 00" title="Nothing deleted." body="Deleted contacts stay here for 30 days." />
        </AppFrameInset>
      ) : (
        <ul>
          {gone.map((g) => (
            <ListRow
              key={g.id}
              render={<li />}
              title={g.fullName || "No name"}
              meta={`Deleted ${folio(new Date(g.deletedAt * 1000))}`}
              metaStyle="plain"
              detail={books.some((b) => b.id === g.bookId) ? undefined : "Its address book is gone, so it comes back on this device."}
              action={
                <Button variant="secondary" size="sm" loading={restore.isPending && restore.variables === g.id} onClick={() => void run(g.id)} aria-label={`Restore ${g.fullName}`}>
                  Restore
                </Button>
              }
            />
          ))}
        </ul>
      )}
    </section>
  )
}
