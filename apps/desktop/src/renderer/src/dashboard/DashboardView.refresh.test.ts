// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DashboardView } from './DashboardView'

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

function systemSummary(hostname: string): {
  hostname: string
  platform: string
  release: string
  arch: string
  cpuPercent: number
  cpuCores: number
  memoryTotal: number
  memoryAvailable: number
  diskTotal: number
  diskAvailable: number
  uptimeSeconds: number
} {
  return {
    hostname,
    platform: 'darwin',
    release: 'test-release',
    arch: 'arm64',
    cpuPercent: 10,
    cpuCores: 8,
    memoryTotal: 1024,
    memoryAvailable: 512,
    diskTotal: 4096,
    diskAvailable: 2048,
    uptimeSeconds: 60
  }
}

describe('DashboardView refresh lifecycle', () => {
  let root: Root | null = null
  let container: HTMLDivElement | null = null
  let systemCalls: Array<Deferred<ReturnType<typeof systemSummary>>>
  let systemSummaryMock: ReturnType<typeof vi.fn<() => Promise<ReturnType<typeof systemSummary>>>>

  beforeEach(() => {
    vi.useFakeTimers()
    systemCalls = [deferred(), deferred(), deferred()]
    let systemIndex = 0
    systemSummaryMock = vi.fn(() => systemCalls[systemIndex++].promise)
    ;(window as unknown as { api: unknown }).api = {
      system: { summary: systemSummaryMock }
    }
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    if (root) await act(async () => root?.unmount())
    root = null
    container?.remove()
    container = null
    delete (window as unknown as { api?: unknown }).api
    vi.useRealTimers()
  })

  it('coalesces overlapping refreshes, applies the newest response, and stops after unmount', async () => {
    await act(async () => root?.render(createElement(DashboardView)))
    expect(systemSummaryMock).toHaveBeenCalledTimes(1)

    const refreshButtons = Array.from(
      container!.querySelectorAll<HTMLButtonElement>('button[aria-label="새로고침"]')
    )
    expect(refreshButtons).toHaveLength(1)
    await act(async () => {
      refreshButtons.forEach((button) => button.click())
      await vi.advanceTimersByTimeAsync(180_000)
    })
    expect(systemSummaryMock).toHaveBeenCalledTimes(1)

    await act(async () => {
      systemCalls[0].resolve(systemSummary('stale-host'))
      await systemCalls[0].promise
    })
    expect(systemSummaryMock).toHaveBeenCalledTimes(2)
    expect(container?.textContent).not.toContain('stale-host')

    await act(async () => {
      systemCalls[1].resolve(systemSummary('fresh-host'))
      await systemCalls[1].promise
    })
    expect(container?.textContent).toContain('fresh-host')

    await act(async () => refreshButtons.forEach((button) => button.click()))
    expect(systemSummaryMock).toHaveBeenCalledTimes(3)
    await act(async () => root?.unmount())
    root = null
    await act(async () => {
      await vi.advanceTimersByTimeAsync(180_000)
      systemCalls[2].resolve(systemSummary('after-unmount-host'))
      await systemCalls[2].promise
    })
    expect(systemSummaryMock).toHaveBeenCalledTimes(3)
  })
})
