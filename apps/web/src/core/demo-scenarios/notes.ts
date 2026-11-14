import type { DemoScenarios } from "../demo-scenarios"

/** Notes (ADR-0081, ADR-0105): notes, folders, locks and sync in states the sample data doesn't reach. */
export const notes: DemoScenarios = {
  /** A reminder on the gift list passed earlier this morning, so the note stands under DUE until it's marked done. */
  "notes-due": ({ client, wrap }) => {
    const seeded = (async () => {
      const gifts = (await client.listNotes({ search: null, tag: null, archived: false, folder: null })).find((n) => n.title.startsWith("Gift ideas"))
      if (gifts) await client.setNoteMeta(gifts.id, { remindAt: Math.floor(Date.now() / 1000) - 75 * 60 })
    })()
    // Every read of the notes waits for the reminder, so the first list already shows it.
    wrap("listNotes", (list) => async (query) => {
      await seeded
      return list(query)
    })
  },
  /** Nobody has written a note yet: every list of notes comes back empty. */
  "notes-empty": ({ wrap }) => {
    wrap("listNotes", () => async () => [])
    wrap("noteTags", () => async () => [])
    wrap("noteGraph", () => async () => ({ notes: [], links: [], items: [] }))
  },
  /** The notes can't be read: the core answers every list with an error. */
  "notes-read-fails": ({ wrap }) => {
    wrap("listNotes", () => async () => {
      throw new Error("The notes store is locked by another Vale window.")
    })
  },
}
