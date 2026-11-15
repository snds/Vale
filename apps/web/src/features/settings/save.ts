import { useCallback, useState } from "react"

/**
 * How a setting saves (brief T0; cross-app decisions §5): at once and
 * silently. When the save fails the control shows its old value again, and
 * one critical line under its row says why, in the server's words. A row's
 * line goes when that row, or any other, is changed again.
 *
 * ```tsx
 * const save = useSettingSave()
 * <ToggleRow checked={prefs.quote} onCheckedChange={(quote) => save.run("quote", setPrefs({ ...prefs, quote }))} />
 * <SaveFailed message={save.failed("quote")} />
 * ```
 *
 * Keep the control on the stored value (not a local copy) and it returns by
 * itself: the store only changes when the save holds.
 */
export function useSettingSave() {
  const [failure, setFailure] = useState<{ row: string; message: string } | null>(null)
  const run = useCallback((row: string, saving: Promise<unknown>) => {
    setFailure(null)
    saving.catch((e: unknown) => setFailure({ row, message: e instanceof Error ? e.message : String(e) }))
  }, [])
  const failed = useCallback((row: string) => (failure?.row === row ? failure.message : null), [failure])
  return { run, failed }
}
