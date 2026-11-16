// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useLatestRefresh } from './useLatestRefresh'

;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void }

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

const state = vi.hoisted(() => ({
  requests: [] as Array<Deferred<string>>,
  applied: [] as string[],
  completed: vi.fn()
}))

function RefreshProbe(): React.JSX.Element {
  const refresh = useLatestRefresh(async (isCurrent): Promise<void> => {
    const result = await state.requests.shift()!.promise
    if (isCurrent()) state.applied.push(result)
  })
  return createElement('button', {
    onClick: () => {
      void refresh().then(state.completed)
      void refresh().then(state.completed)
    }
  })
}

describe('useLatestRefresh', () => {
  let root: Root | null = null
  let container: HTMLDivElement | null = null

  afterEach(async () => {
    if (root) await act(async () => root?.unmount())
    root = null
    container?.remove()
    container = null
    state.requests = []
    state.applied = []
    state.completed.mockReset()
  })

  it('coalesces calls and resolves awaiters after the newest queued refresh', async () => {
    const first = deferred<string>()
    const second = deferred<string>()
    state.requests = [first, second]
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    await act(async () => root?.render(createElement(RefreshProbe)))

    await act(async () => container?.querySelector('button')?.click())
    expect(state.requests).toHaveLength(1)
    expect(state.completed).not.toHaveBeenCalled()

    await act(async () => {
      first.resolve('stale')
      await first.promise
    })
    expect(state.requests).toHaveLength(0)
    expect(state.applied).toEqual([])
    expect(state.completed).not.toHaveBeenCalled()

    await act(async () => {
      second.resolve('fresh')
      await second.promise
    })
    expect(state.applied).toEqual(['fresh'])
    expect(state.completed).toHaveBeenCalledTimes(2)
  })
})
