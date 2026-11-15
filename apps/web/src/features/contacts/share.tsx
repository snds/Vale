import { useState } from "react"

import { AdaptiveDialog, AdaptiveMenuItem, QrCode, toast } from "@unicron/ui"
import { getCoreClient } from "@/core/client"
import type { ContactDetail } from "@/core/types"

import { scanCard } from "./contact-format"

const fail = (e: unknown) => toast.error(e instanceof Error ? e.message : String(e))

/**
 * Sharing a card (brief P2): the system share sheet where the device has one,
 * a .vcf file, or a QR code to scan. The person's SHARE menu and a phone's
 * More menu both use it; `layer` is the QR code's dialog, to mount beside them.
 */
export function useShareContact(contact: ContactDetail) {
  const [qr, setQr] = useState<string | null>(null)
  // Phones (and some desktops) can hand a file to the share sheet: Messages, AirDrop, Nearby Share.
  const canShare = typeof navigator !== "undefined" && typeof navigator.canShare === "function"
  const shareSheet = async () => {
    const { fileName, vcf } = await (await getCoreClient()).contactVcard(contact.id)
    const file = new File([vcf], fileName, { type: "text/vcard" })
    if (!navigator.canShare?.({ files: [file] })) return void toast.error("This device can't share files")
    await navigator.share({ files: [file], title: contact.fullName }).catch((e: unknown) => {
      // Closing the share sheet isn't an error.
      if (!(e instanceof DOMException && e.name === "AbortError")) throw e
    })
  }
  const save = async () => toast(`Saved to ${await (await getCoreClient()).saveContactVcard(contact.id)}`)
  const showQr = async () => setQr(scanCard((await (await getCoreClient()).contactVcard(contact.id)).vcf))
  const items = (
    <>
      {canShare && (
        <AdaptiveMenuItem icon="share" onSelect={() => void shareSheet().catch(fail)}>
          Share…
        </AdaptiveMenuItem>
      )}
      <AdaptiveMenuItem icon="download" onSelect={() => void save().catch(fail)}>
        Save as vCard file
      </AdaptiveMenuItem>
      <AdaptiveMenuItem icon="qr-code" onSelect={() => void showQr().catch(fail)}>
        Show QR code
      </AdaptiveMenuItem>
    </>
  )
  const layer = (
    <AdaptiveDialog
      open={qr !== null}
      onOpenChange={(o) => !o && setQr(null)}
      size="question"
      overline="Share"
      title={contact.fullName}
      description="Scan with a phone's camera to add this contact."
    >
      {qr !== null && (
        <div className="flex justify-center pb-4" data-slot="contact-qr">
          <QrCode value={qr} label={`QR code to add ${contact.fullName}`} />
        </div>
      )}
    </AdaptiveDialog>
  )
  return { items, layer }
}
