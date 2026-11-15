import { create } from "zustand"

/** Booking links' overline (brief C7): `BOOKING LINKS // 02`, in two digits. */
export const bookingOverline = (n: number | undefined) => `Booking links // ${String(n ?? 0).padStart(2, "0")}`

/** What the detail column says while no link is open. */
export const BOOKING_PICK = "Pick a booking link to see it here."

/**
 * What Booking links has open (ADR-0101): the link in the detail column (or
 * pushed), the form, and the preview. One store, so the list, the pane and
 * the phone's top bar ask for the same things.
 */
export const useBooking = create<{ open: string | null; editing: { id: string | null } | null; preview: string | null }>(() => ({ open: null, editing: null, preview: null }))
export const openBookingLink = (id: string | null) => useBooking.setState({ open: id })
export const newBookingLink = () => useBooking.setState({ editing: { id: null } })
export const editBookingLink = (id: string) => useBooking.setState({ editing: { id } })
export const previewBookingLink = (id: string) => useBooking.setState({ preview: id })
export const closeBooking = () => useBooking.setState({ open: null, editing: null, preview: null })
