// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TabInfo } from '../electron'

;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const hotkeyState = vi.hoisted(() => ({
  handlers: [] as Array<(payload: { index: number }) => void>,
  switchToWorkspaceTab: vi.fn(),
  unsubscribe: vi.fn()
}))

vi.mock('../electron', () => ({
  onSwitchWorkspaceTabIndexShortcut: (handler: (payload: { index: number }) => void) => {
    hotkeyState.handlers.push(handler)
    return () => {
      hotkeyState.handlers = hotkeyState.handlers.filter((current) => current !== handler)
      hotkeyState.unsubscribe()
    }
  }
}))

vi.mock('../workspaceNavigation', () => ({
  switchToWorkspaceTab: hotkeyState.switchToWorkspaceTab
}))

import { useWorkspaceTabHotkeys } from './useWorkspaceTabHotkeys'

let root: Root | null = null
let container: HTMLDivElement | null = null

function tab(id: number): TabInfo {
  return { id, title: `Tab ${id}`, layout_json: '{}', root_path: `/workspace/${id}` }
}

function Hotkeys({ tabs }: { tabs: TabInfo[] }): null {
  useWorkspaceTabHotkeys(tabs)
  return null
}

afterEach(async () => {
  if (root) await act(async () => root?.unmount())
  root = null
  container?.remove()
  container = null
  hotkeyState.handlers = []
  hotkeyState.switchToWorkspaceTab.mockReset()
  hotkeyState.unsubscribe.mockReset()
})

describe('useWorkspaceTabHotkeys', () => {
  it('maps the one-based shortcut index to the matching tab and ignores a missing tab', async () => {
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)

    await act(async () => {
      root?.render(createElement(Hotkeys, { tabs: [tab(11), tab(22)] }))
    })

    expect(hotkeyState.handlers).toHaveLength(1)
    await act(async () => hotkeyState.handlers[0]({ index: 2 }))
    await act(async () => hotkeyState.handlers[0]({ index: 9 }))

    expect(hotkeyState.switchToWorkspaceTab).toHaveBeenCalledTimes(1)
    expect(hotkeyState.switchToWorkspaceTab).toHaveBeenCalledWith(22)
  })

  it('replaces the listener when tabs change and removes it on unmount', async () => {
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)

    await act(async () => {
      root?.render(createElement(Hotkeys, { tabs: [tab(11)] }))
    })
    const oldHandler = hotkeyState.handlers[0]

    await act(async () => {
      root?.render(createElement(Hotkeys, { tabs: [tab(33)] }))
    })

    expect(hotkeyState.unsubscribe).toHaveBeenCalledTimes(1)
    expect(hotkeyState.handlers).toHaveLength(1)
    expect(hotkeyState.handlers[0]).not.toBe(oldHandler)

    await act(async () => hotkeyState.handlers[0]({ index: 1 }))
    expect(hotkeyState.switchToWorkspaceTab).toHaveBeenCalledWith(33)

    await act(async () => root?.unmount())
    root = null
    expect(hotkeyState.unsubscribe).toHaveBeenCalledTimes(2)
    expect(hotkeyState.handlers).toHaveLength(0)
  })
})
