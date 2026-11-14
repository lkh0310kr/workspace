// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const { provider, release } = vi.hoisted(() => ({
  provider: {
    id: 'test-provider',
    capabilities: { searchNames: true, searchContents: true },
    search: vi.fn(async () => [])
  },
  release: vi.fn()
}))

vi.mock('../editor/localEditorProvider', () => ({
  acquireLocalEditorProvider: () => ({ provider, release })
}))

import { SearchPanel } from './SearchPanel'

let root: Root | null = null
let container: HTMLDivElement | null = null

afterEach(async () => {
  if (root) await act(async () => root?.unmount())
  root = null
  container?.remove()
  container = null
  vi.clearAllMocks()
})

describe('SearchPanel input focus', () => {
  it('focuses on open and focuses again when the shortcut is repeated', async () => {
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    const renderPanel = (focusRequest: number) =>
      createElement(SearchPanel, {
        tabId: 1,
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
})
