import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Model } from 'flexlayout-react'

const persistence = vi.hoisted(() => ({ setTabLayout: vi.fn() }))

import { configurePaneSystemLayoutPersistence, usePaneSystemStore } from './paneSystemStore'

function model(value: string): Model {
  return {
    toJson: () => ({ value }),
    visitNodes: vi.fn()
  } as unknown as Model
}

describe('paneSystemStore.persistLayout', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    persistence.setTabLayout.mockReset().mockResolvedValue(undefined)
    configurePaneSystemLayoutPersistence(persistence.setTabLayout)
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  it('coalesces per workspace without canceling another workspace save', async () => {
    const persistLayout = usePaneSystemStore.getState().persistLayout
    persistLayout(1, model('first draft'))
    persistLayout(1, model('latest draft'))
    persistLayout(2, model('other workspace'))

    await vi.advanceTimersByTimeAsync(249)
    expect(persistence.setTabLayout).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)

    expect(persistence.setTabLayout).toHaveBeenCalledTimes(2)
    expect(persistence.setTabLayout).toHaveBeenNthCalledWith(1, 1, '{"value":"latest draft"}')
    expect(persistence.setTabLayout).toHaveBeenNthCalledWith(2, 2, '{"value":"other workspace"}')
  })

  it('cancels a pending save when hydration removes its workspace', async () => {
    usePaneSystemStore.getState().persistLayout(1, model('removed workspace'))
    usePaneSystemStore.getState().syncWorkspaceLayouts([])

    await vi.advanceTimersByTimeAsync(250)

    expect(persistence.setTabLayout).not.toHaveBeenCalled()
  })
})
