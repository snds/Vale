import { useEffect, useState } from "react"

/**
 * `value` once it has stayed the same for `ms`: the words of a search after typing pauses (Vale 39).
 * Until then, the last value that settled.
 */
export function useSettled<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    if (Object.is(value, settled)) return
    const timer = setTimeout(() => setSettled(value), ms)
    return () => clearTimeout(timer)
  }, [value, settled, ms])
  return settled
}
