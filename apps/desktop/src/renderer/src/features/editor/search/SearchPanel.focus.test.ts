// @vitest-environment jsdom
import { act, createElement, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

type SearchResult = {
  item: {
    providerId: string
    itemId: string
    parentId: string | null
    name: string
    path: string
    kind: 'markdown'
    readOnly: boolean
  }
  matches: Array<{
    line: number
    column: number
    preview: string
    ranges: Array<{ start: number; end: number }>
  }>
}
type SearchFunction = (
  query: string,
  options: Record<string, unknown>,
  signal?: AbortSignal,
  onResult?: (result: SearchResult) => void
) => Promise<SearchResult[]>
type ReplaceFunction = (
  ref: { providerId: string; itemId: string },
  query: string,
  replacement: string,
  options: Record<string, unknown>,
  expectedMatchCount: number
) => Promise<boolean>
;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const { provider, otherProvider, release } = vi.hoisted(() => {
  const createProvider = (
    id: string
  ): {
    id: string
    capabilities: { searchNames: boolean; searchContents: boolean; replaceContents: boolean }
    search: ReturnType<typeof vi.fn<SearchFunction>>
    replaceContents: ReturnType<typeof vi.fn<ReplaceFunction>>
  } => ({
    id,
    capabilities: { searchNames: true, searchContents: true, replaceContents: true },
    search: vi.fn<SearchFunction>(),
    replaceContents: vi.fn<ReplaceFunction>()
  })
  return {
    provider: createProvider('test-provider'),
    otherProvider: createProvider('other-provider'),
    release: vi.fn()
  }
})

vi.mock('../runtime/localEditorProvider', () => ({
  acquireLocalEditorProvider: (tabId: number) => ({
    provider: tabId === 1 ? provider : otherProvider,
    release
  })
}))

import { SearchPanel } from './SearchPanel'

let root: Root | null = null
let container: HTMLDivElement | null = null

afterEach(async () => {
  if (root) await act(async () => root?.unmount())
  root = null
  container?.remove()
  container = null
  vi.resetAllMocks()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function result(
  itemId: string,
  path: string,
  preview: string,
  ranges: Array<{ start: number; end: number }>
): SearchResult {
  return {
    item: {
      providerId: 'test-provider',
      itemId,
      parentId: null,
      name: path.split('/').at(-1) ?? path,
      path,
      kind: 'markdown',
      readOnly: false
    },
    matches: [{ line: 1, column: 1, preview, ranges }]
  }
}

function setInputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  setter?.call(input, value)
  input.dispatchEvent(
    new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value })
  )
}

function deferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (cause: unknown) => void
} {
  let resolve!: (value: T) => void
  let reject!: (cause: unknown) => void
  const promise = new Promise<T>((accept, decline) => {
    resolve = accept
    reject = decline
  })
  return { promise, resolve, reject }
}

describe('SearchPanel input focus', () => {
  it('focuses on open and focuses again when the shortcut is repeated', async () => {
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    const renderPanel = (focusRequest: number): ReactElement =>
      createElement(SearchPanel, {
        tabId: 1,
        rootPath: '/workspace',
        focusRequest,
        onJumpToResult: vi.fn(),
        onClose: vi.fn()
      })

    await act(async () => root?.render(renderPanel(0)))
    const input = container.querySelector<HTMLInputElement>('.search-panel-input')
    expect(input).not.toBeNull()
    expect(document.activeElement).toBe(input)

    input?.blur()
    expect(document.activeElement).not.toBe(input)
    await act(async () => root?.render(renderPanel(1)))
    expect(document.activeElement).toBe(input)
  })

  it('aborts the prior query and ignores its late results', async () => {
    vi.useFakeTimers()
    const first = deferred<SearchResult[]>()
    const second = deferred<SearchResult[]>()
    provider.search.mockImplementation((query) =>
      query === 'first' ? first.promise : second.promise
    )

    const host = document.createElement('div')
    container = host
    document.body.append(host)
    root = createRoot(host)
    await act(async () =>
      root?.render(
        createElement(SearchPanel, {
          tabId: 1,
          rootPath: '/workspace',
          focusRequest: 0,
          onJumpToResult: vi.fn(),
          onClose: vi.fn()
        })
      )
    )

    const input = host.querySelector<HTMLInputElement>('.search-panel-input')!
    await act(async () => {
      setInputValue(input, 'first')
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(249)
    })
    expect(provider.search).not.toHaveBeenCalled()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(provider.search).toHaveBeenCalledTimes(1)
    const firstSignal = provider.search.mock.calls[0][2]

    await act(async () => {
      setInputValue(input, 'second')
    })
    expect(firstSignal?.aborted).toBe(true)
    await act(async () => {
      first.resolve([result('first-result', 'First.md', 'first match', [{ start: 0, end: 5 }])])
      await Promise.resolve()
    })
    expect(host.textContent).not.toContain('First.md')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(250)
    })
    expect(provider.search).toHaveBeenCalledTimes(2)
    await act(async () => {
      second.resolve([result('second-result', 'Second.md', 'second match', [{ start: 0, end: 6 }])])
      await Promise.resolve()
    })
    expect(host.textContent).toContain('Second.md')
    expect(host.textContent).not.toContain('First.md')
  })

  it('does not rerun an unchanged query when the provider identity changes', async () => {
    vi.useFakeTimers()
    provider.search.mockResolvedValue([])
    otherProvider.search.mockResolvedValue([])

    const host = document.createElement('div')
    container = host
    document.body.append(host)
    root = createRoot(host)
    const renderPanel = (tabId: number): ReactElement =>
      createElement(SearchPanel, {
        tabId,
        rootPath: '/workspace',
        focusRequest: 0,
        onJumpToResult: vi.fn(),
        onClose: vi.fn()
      })
    await act(async () => root?.render(renderPanel(1)))
    const input = host.querySelector<HTMLInputElement>('.search-panel-input')!
    await act(async () => {
      setInputValue(input, 'needle')
      await vi.advanceTimersByTimeAsync(250)
    })
    expect(provider.search).toHaveBeenCalledTimes(1)

    await act(async () => root?.render(renderPanel(2)))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250)
    })
    expect(otherProvider.search).not.toHaveBeenCalled()
  })

  it('batches streamed updates by file and lets the final response replace them', async () => {
    vi.useFakeTimers()
    const search = deferred<SearchResult[]>()
    let emitResult: ((entry: SearchResult) => void) | undefined
    provider.search.mockImplementation((_query, _options, _signal, onResult) => {
      emitResult = onResult
      return search.promise
    })

    let nextFrameId = 0
    const frameCallbacks = new Map<number, FrameRequestCallback>()
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      const id = ++nextFrameId
      frameCallbacks.set(id, callback)
      return id
    })
    vi.stubGlobal('cancelAnimationFrame', (id: number) => frameCallbacks.delete(id))

    const host = document.createElement('div')
    container = host
    document.body.append(host)
    root = createRoot(host)
    await act(async () =>
      root?.render(
        createElement(SearchPanel, {
          tabId: 1,
          rootPath: '/workspace',
          focusRequest: 0,
          onJumpToResult: vi.fn(),
          onClose: vi.fn()
        })
      )
    )
    const input = host.querySelector<HTMLInputElement>('.search-panel-input')!
    await act(async () => {
      setInputValue(input, 'needle')
      await vi.advanceTimersByTimeAsync(250)
    })

    await act(async () => {
      emitResult?.(result('streamed-file', 'Streamed.md', 'first preview', [{ start: 0, end: 5 }]))
      emitResult?.(result('streamed-file', 'Streamed.md', 'latest preview', [{ start: 0, end: 6 }]))
    })
    expect(frameCallbacks.size).toBe(1)
    await act(async () => {
      const [id, callback] = [...frameCallbacks.entries()][0]
      frameCallbacks.delete(id)
      callback(16)
    })
    expect(host.textContent).toContain('latest preview')
    expect(host.textContent).not.toContain('first preview')

    await act(async () => {
      search.resolve([result('final-file', 'Final.md', 'final preview', [{ start: 0, end: 5 }])])
      await Promise.resolve()
    })
    expect(host.textContent).toContain('Final.md')
    expect(host.textContent).toContain('final preview')
    expect(host.textContent).not.toContain('Streamed.md')
    expect(host.querySelector('.search-panel-status')?.textContent).toContain('1 result in 1 file')
  })

  it('aborts active work and cancels a queued stream frame when unmounted', async () => {
    vi.useFakeTimers()
    const search = deferred<SearchResult[]>()
    let emitResult: ((entry: SearchResult) => void) | undefined
    provider.search.mockImplementation((_query, _options, _signal, onResult) => {
      emitResult = onResult
      return search.promise
    })

    let nextFrameId = 0
    const frameCallbacks = new Map<number, FrameRequestCallback>()
    const cancelFrame = vi.fn((id: number) => frameCallbacks.delete(id))
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      const id = ++nextFrameId
      frameCallbacks.set(id, callback)
      return id
    })
    vi.stubGlobal('cancelAnimationFrame', cancelFrame)

    const host = document.createElement('div')
    container = host
    document.body.append(host)
    root = createRoot(host)
    await act(async () =>
      root?.render(
        createElement(SearchPanel, {
          tabId: 1,
          rootPath: '/workspace',
          focusRequest: 0,
          onJumpToResult: vi.fn(),
          onClose: vi.fn()
        })
      )
    )
    const input = host.querySelector<HTMLInputElement>('.search-panel-input')!
    await act(async () => {
      setInputValue(input, 'needle')
      await vi.advanceTimersByTimeAsync(250)
    })
    const signal = provider.search.mock.calls[0][2]
    await act(async () => {
      emitResult?.(result('streamed-file', 'Streamed.md', 'pending frame', [{ start: 0, end: 7 }]))
    })
    expect(frameCallbacks.size).toBe(1)

    await act(async () => root?.unmount())
    root = null

    expect(signal?.aborted).toBe(true)
    expect(cancelFrame).toHaveBeenCalledOnce()
    expect(frameCallbacks.size).toBe(0)
    expect(release).toHaveBeenCalledOnce()
  })

  it('passes the current match count to replaceContents as its stale-result precondition', async () => {
    vi.useFakeTimers()
    provider.search.mockResolvedValue([
      result('replace-file', 'Replace.md', 'needle needle', [
        { start: 0, end: 6 },
        { start: 7, end: 13 }
      ])
    ])
    provider.replaceContents.mockResolvedValue(false)

    const host = document.createElement('div')
    container = host
    document.body.append(host)
    root = createRoot(host)
    await act(async () =>
      root?.render(
        createElement(SearchPanel, {
          tabId: 1,
          rootPath: '/workspace',
          focusRequest: 0,
          onJumpToResult: vi.fn(),
          onClose: vi.fn()
        })
      )
    )
    const inputs = host.querySelectorAll<HTMLInputElement>('.search-panel-input')
    await act(async () => {
      setInputValue(inputs[0], 'needle')
      await vi.advanceTimersByTimeAsync(250)
    })
    expect(host.textContent).toContain('Replace.md')

    await act(async () => {
      host.querySelector<HTMLButtonElement>('.search-panel-toggle-replace')?.click()
    })
    const replaceInput = host.querySelectorAll<HTMLInputElement>('.search-panel-input')[1]
    await act(async () => {
      setInputValue(replaceInput, 'replacement')
      host.querySelector<HTMLButtonElement>('.search-panel-replace-all')?.click()
      await Promise.resolve()
    })

    expect(provider.replaceContents).toHaveBeenCalledWith(
      { providerId: 'test-provider', itemId: 'replace-file' },
      'needle',
      'replacement',
      { caseSensitive: false, regex: false, wholeWord: false },
      2
    )
  })
})
