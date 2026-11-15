import { create } from "zustand"

/**
 * Where first run stands (brief X8; ADR-0107). `open` is `null` until the
 * first read of the accounts settles, then whether the focus frame shows.
 * `provider` is the preset step 2 is for; without one, step 1 shows.
 * `added` is the address the person just added, for the toast the Inbox
 * shows once it is back.
 */
interface FirstRunState {
  open: boolean | null
  provider: string | null
  added: string | null
}

export const useFirstRun = create<FirstRunState>(() => ({ open: null, provider: null, added: null }))

/** "Not now", kept on this device: first run does not open by itself again here. */
export const NOT_NOW_KEY = "vale.first-run.not-now"

export function saidNotNow(): boolean {
  try {
    return localStorage.getItem(NOT_NOW_KEY) === "1"
  } catch {
    // No storage: ask again next time.
    return false
  }
}

/** NOT NOW: into the app, and remembered on this device. */
export function notNow() {
  try {
    localStorage.setItem(NOT_NOW_KEY, "1")
  } catch {
    // No storage: this visit still goes in.
  }
  useFirstRun.setState({ open: false, provider: null })
}

/** Step 1 again, from Mail's empty state (brief M1). */
export const openFirstRun = () => useFirstRun.setState({ open: true, provider: null })

export const pickProvider = (provider: string | null) => useFirstRun.setState({ provider })

/** An account was added: the app opens, and the Inbox says so. */
export const firstRunDone = (address: string) => useFirstRun.setState({ open: false, provider: null, added: address })
