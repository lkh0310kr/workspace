import { useCallback, useEffect, useRef } from 'react'

type RefreshRun = (isCurrent: () => boolean) => Promise<void>

/** Runs one refresh at a time and coalesces any requests received while it is running. */
export function useLatestRefresh(runRefresh: RefreshRun): () => Promise<void> {
  const runRefreshRef = useRef(runRefresh)
  const mountedRef = useRef(false)
  const lifecycleRef = useRef(0)
  const runningRef = useRef(false)
  const queuedRef = useRef(false)
  const waitersRef = useRef<Array<() => void>>([])

  const resolveWaiters = useCallback(() => {
    for (const resolve of waitersRef.current.splice(0)) resolve()
  }, [])

  useEffect(() => {
    mountedRef.current = true
    lifecycleRef.current += 1
    return () => {
      mountedRef.current = false
      lifecycleRef.current += 1
      queuedRef.current = false
      resolveWaiters()
    }
  }, [resolveWaiters])

  useEffect(() => {
    runRefreshRef.current = runRefresh
  }, [runRefresh])

  return useCallback(() => {
    if (!mountedRef.current) return Promise.resolve()

    const completion = new Promise<void>((resolve) => waitersRef.current.push(resolve))
    if (runningRef.current) {
      queuedRef.current = true
      return completion
    }

    runningRef.current = true
    const drain = async (): Promise<void> => {
      try {
        do {
          queuedRef.current = false
          const lifecycle = lifecycleRef.current
          try {
            await runRefreshRef.current(
              () => mountedRef.current && lifecycleRef.current === lifecycle && !queuedRef.current
            )
          } catch {
            // Refresh callbacks own user-visible error handling; keep queued refreshes moving.
          }
        } while (mountedRef.current && queuedRef.current)
      } finally {
        runningRef.current = false
        resolveWaiters()
      }
    }

    void drain()
    return completion
  }, [resolveWaiters])
}
