import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Model } from 'flexlayout-react'

const electron = vi.hoisted(() => ({ setTabLayout: vi.fn() }))
vi.mock('../electron', () => electron)

import { useWorkspaceStore } from './workspaceStore'

function model(value: string): Model {
  return {
    toJson: () => ({ value }),
    visitNodes: vi.fn()
  } as unknown as Model
}

describe('workspaceStore.persistLayout', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    electron.setTabLayout.mockReset().mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  it('coalesces per workspace without canceling another workspace save', async () => {
    const persistLayout = useWorkspaceStore.getState().persistLayout
    persistLayout(1, model('first draft'))
    persistLayout(1, model('latest draft'))
    persistLayout(2, model('other workspace'))

    await vi.advanceTimersByTimeAsync(249)
    expect(electron.setTabLayout).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)

    expect(electron.setTabLayout).toHaveBeenCalledTimes(2)
    expect(electron.setTabLayout).toHaveBeenNthCalledWith(1, 1, '{"value":"latest draft"}')
    expect(electron.setTabLayout).toHaveBeenNthCalledWith(2, 2, '{"value":"other workspace"}')
  })

  it('cancels a pending save when hydration removes its workspace', async () => {
    useWorkspaceStore.getState().persistLayout(1, model('removed workspace'))
    useWorkspaceStore.getState().syncModelsFromWorkspace({ tabs: [], active_tab_id: 0 })

    await vi.advanceTimersByTimeAsync(250)

    expect(electron.setTabLayout).not.toHaveBeenCalled()
  })
})
