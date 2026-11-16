/** @vitest-environment jsdom */
import React, { act } from '../../../../../../node_modules/react'
import { createRoot, type Root } from '../../../../../../node_modules/react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PkmsSyncBridgeStatus } from '../../../../../../packages/pkms-client/src/platform/desktopApi'

const workspaceId = 'sync-panel-workspace'
const conflictPath = 'notes/topic.local-conflict-2026-11-15.md'
const bridge = vi.hoisted(() => ({ syncBridgeStatus: vi.fn() }))

import { SyncBridgePanel } from '../../../../../../packages/pkms-client/src/components/SyncBridgePanel'

describe('PKMS sync settings panel', () => {
  let root: Root | null = null
  let container: HTMLDivElement | null = null

  beforeEach(() => {
    bridge.syncBridgeStatus.mockReset()
    ;(globalThis as typeof globalThis & { React: typeof React }).React = React
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  })

  afterEach(async () => {
    if (root) await act(async () => root?.unmount())
    root = null
    container?.remove()
    container = null
    delete (window as unknown as { pkmsDesktop?: unknown }).pkmsDesktop
  })

  it('opens preserved conflicts and reports cloud errors separately from GitHub backup', async () => {
    const status: PkmsSyncBridgeStatus = {
      workspaceId,
      enabled: true,
      folderPath: '/tmp/pkms-test-root',
      excludedPaths: [],
      state: 'error',
      progress: null,
      lastScannedAt: null,
      lastSyncedAt: null,
      pendingFiles: 1,
      conflictFiles: [conflictPath],
      itemStates: { [conflictPath]: 'attention' },
      error: 'Cloud service is temporarily unavailable.'
    }
    bridge.syncBridgeStatus.mockResolvedValue(status)
    ;(window as unknown as { pkmsDesktop: unknown }).pkmsDesktop = bridge
    const onOpenConflict = vi.fn()
    const onClose = vi.fn()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    await act(async () => {
      root?.render(
        React.createElement(SyncBridgePanel, {
          workspaceId,
          githubStatus: 'synced',
          githubPendingFiles: 0,
          onResumeGithubBackup: async () => ({ githubStatus: 'synced' }) as never,
          onOpenConflict,
          onClose
        })
      )
    })

    expect(bridge.syncBridgeStatus).toHaveBeenCalledWith(workspaceId)
    expect(container.textContent).toContain('Needs attention')
    expect(container.textContent).toContain('Cloud service is temporarily unavailable.')
    expect(container.querySelector('.sync-bridge-github-state')?.textContent).toBe('Up to date')

    const conflictButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === conflictPath
    )
    expect(conflictButton).toBeTruthy()
    await act(async () => conflictButton?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(onOpenConflict).toHaveBeenCalledExactlyOnceWith(conflictPath)

    const closeButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Close sync settings"]'
    )
    await act(async () => closeButton?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(onClose).toHaveBeenCalledOnce()
  })
})
