import type { DemoScenarios } from "../demo-scenarios"

/**
 * A square portrait for a demo card: a figure on a muted ground, drawn here as
 * a PNG so the demo carries no image file. Null where the browser can't draw.
 */
function portrait(): string | null {
  try {
    const canvas = document.createElement("canvas")
    canvas.width = canvas.height = 128
    const g = canvas.getContext("2d")
    if (!g) return null
    g.fillStyle = "#7d8f96"
    g.fillRect(0, 0, 128, 128)
    g.fillStyle = "#e9dccd"
    g.beginPath()
    g.arc(64, 54, 24, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = "#33424a"
    g.beginPath()
    g.ellipse(64, 128, 46, 38, 0, Math.PI, 0)
    g.fill()
    return canvas.toDataURL("image/png")
  } catch {
    return null
  }
}

/** The first card whose name is this, changed as the person would change it in the form. */
function changeCard(demo: Parameters<DemoScenarios[string]>[0], name: string, change: (input: Parameters<typeof demo.client.updateContact>[1]) => void) {
  const { client } = demo
  void client
    .listContacts(name, null, null)
    .then((list) => list.find((c) => c.fullName === name))
    .then(async (found) => {
      if (!found) return
      const c = await client.getContact(found.id)
      const input = { bookId: c.bookId, fullName: c.fullName, emails: c.emails, phones: c.phones, org: c.org, title: c.title, note: c.note, birthday: c.birthday, labels: c.labels }
      change(input)
      await client.updateContact(c.id, input)
    })
}

/** Deletes the first card with each of these names, one after another, as the person would. */
async function deleteCards(client: Parameters<DemoScenarios[string]>[0]["client"], names: string[]) {
  for (const name of names) {
    const found = (await client.listContacts(name, null, null)).find((c) => c.fullName === name)
    if (found) await client.deleteContact(found.id)
  }
}

/** Contacts (ADR-0081, ADR-0102, ADR-0103): address books and people in states the sample data doesn't reach. */
export const contacts: DemoScenarios = {
  /**
   * A card with every row of brief P2: a photo, two emails, two phones, two
   * labels, a birthday and a note. Priya already has meetings and mail.
   */
  "contacts-full": (demo) =>
    changeCard(demo, "Priya Raman", (input) => {
      input.emails = [...input.emails, { label: "home", value: "priya.raman@example.net" }]
      input.phones = [...input.phones, { label: "work", value: "+1 555 010 4400" }]
      input.labels = ["Work", "Clay club"]
      input.birthday = "1988-06-21"
      input.note = "Leads the token audit. Prefers a call to a long thread."
      const photo = portrait()
      if (photo) Object.assign(input, { photo })
    }),
  /** The Work address book is read-only (a shared or a subscribed book): its cards can't be edited or deleted. */
  "contacts-readonly": ({ wrap }) => {
    wrap("listCollections", (original) => async (kind) => (await original(kind)).map((b) => (b.id === "book-work" ? { ...b, writable: false } : b)))
    wrap("getContact", (original) => async (id) => {
      const c = await original(id)
      return c.bookId === "book-work" ? { ...c, writable: false } : c
    })
  },
  /** A smart group whose people carry different labels, so its chips narrow it. */
  "contacts-group": ({ client }) => {
    void client.saveSmartGroup(null, { name: "Studio and clay club", labels: ["Work", "Clay club"], company: null, domain: null, hasPhone: false, hasBirthday: false, inTouchDays: null })
  },
  /** The contacts list never arrives: its loading state. */
  "contacts-loading": ({ wrap }) => {
    wrap("listContacts", () => () => new Promise(() => {}))
  },
  /** Two cards deleted today: Recently deleted has rows (brief P5). */
  "contacts-deleted": ({ client }) => {
    void deleteCards(client, ["Sam Okafor", "Diego Alvarez"])
  },
  /**
   * A morning of changes to undo (brief P5): two cards deleted, one edited,
   * four added, so Restore contacts names cards in each of its rows.
   */
  "contacts-changed": (demo) => {
    const { client } = demo
    void (async () => {
      await deleteCards(client, ["Sam Okafor", "Diego Alvarez"])
      const lena = (await client.listContacts("Lena Fischer", null, null)).find((c) => c.fullName === "Lena Fischer")
      if (lena) {
        const c = await client.getContact(lena.id)
        await client.updateContact(c.id, { bookId: c.bookId, fullName: c.fullName, emails: c.emails, phones: [], org: c.org, title: c.title, note: c.note, birthday: c.birthday, labels: c.labels })
      }
      for (const [fullName, email] of [
        ["Noor Haddad", "noor@example.org"],
        ["Tomás Ibarra", "tomas@example.es"],
        ["Wren Adeyemi", "wren@example.co.uk"],
        ["Jonah Brandt", "jonah@example.de"],
      ] as const)
        await client.createContact({ bookId: "book-personal", fullName, emails: [{ label: "home", value: email }], phones: [] })
    })()
  },
}
