import { useEffect, useState } from 'react'

/** Returns `value` only after it has stopped changing for `delay` ms.
 * Used to keep expensive recomputation off the typing path. */
export function useDebounced<T>(value: T, delay = 400): T {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return settled
}
