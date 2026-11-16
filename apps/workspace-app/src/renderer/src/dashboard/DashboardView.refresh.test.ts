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

function serviceStatus(platformName: string): {
  status: number
  body: {
    services: never[]
    platforms: Array<{
      id: string
      name: string
      status: string
      description: string
      incidentCount: number
    }>
    updatedAt: string
  }
} {
  return {
    status: 200,
    body: {
      services: [],
      platforms: [
        {
          id: platformName,
          name: platformName,
          status: 'operational',
          description: 'All operational',
          incidentCount: 0
        }
      ],
      updatedAt: '2026-11-16T00:00:00.000Z'
    }
  }
}

function unauthorizedServiceStatus(): ReturnType<typeof serviceStatus> {
  return { status: 401, body: { services: [], platforms: [], updatedAt: '' } }
}

describe('DashboardView refresh lifecycle', () => {
  let root: Root | null = null
  let container: HTMLDivElement | null = null
  let systemCalls: Array<Deferred<ReturnType<typeof systemSummary>>>
  let serviceCalls: Array<Deferred<ReturnType<typeof serviceStatus>>>
  let systemSummaryMock: ReturnType<typeof vi.fn<() => Promise<ReturnType<typeof systemSummary>>>>
  let serviceRequestMock: ReturnType<typeof vi.fn<() => Promise<ReturnType<typeof serviceStatus>>>>

  beforeEach(() => {
    vi.useFakeTimers()
    systemCalls = [deferred(), deferred(), deferred()]
    serviceCalls = [deferred(), deferred(), deferred()]
    let systemIndex = 0
    let serviceIndex = 0
    systemSummaryMock = vi.fn(() => systemCalls[systemIndex++].promise)
    serviceRequestMock = vi.fn(() => serviceCalls[serviceIndex++].promise)
    ;(window as unknown as { api: unknown }).api = {
      system: { summary: systemSummaryMock }
    }
    ;(window as unknown as { workspaceHome: unknown }).workspaceHome = {
      request: serviceRequestMock
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
    delete (window as unknown as { workspaceHome?: unknown }).workspaceHome
    vi.useRealTimers()
  })

  it('coalesces overlapping refreshes, applies the newest response, and stops after unmount', async () => {
    await act(async () => root?.render(createElement(DashboardView)))
    expect(systemSummaryMock).toHaveBeenCalledTimes(1)
    expect(serviceRequestMock).toHaveBeenCalledTimes(1)

    const refreshButtons = Array.from(
      container!.querySelectorAll<HTMLButtonElement>('button[aria-label="새로고침"]')
    )
    expect(refreshButtons).toHaveLength(2)
    await act(async () => {
      refreshButtons.forEach((button) => button.click())
      await vi.advanceTimersByTimeAsync(180_000)
    })
    expect(systemSummaryMock).toHaveBeenCalledTimes(1)
    expect(serviceRequestMock).toHaveBeenCalledTimes(1)

    await act(async () => {
      systemCalls[0].resolve(systemSummary('stale-host'))
      serviceCalls[0].resolve(unauthorizedServiceStatus())
      await Promise.all([systemCalls[0].promise, serviceCalls[0].promise])
    })
    expect(systemSummaryMock).toHaveBeenCalledTimes(2)
    expect(serviceRequestMock).toHaveBeenCalledTimes(2)
    expect(container?.textContent).not.toContain('stale-host')
    expect(container?.textContent).not.toContain('Stale platform')
    expect(container?.textContent).not.toContain(
      '계정별 지표를 연결하려면 PKMS 로그인이 필요합니다.'
    )

    await act(async () => {
      systemCalls[1].resolve(systemSummary('fresh-host'))
      serviceCalls[1].resolve(serviceStatus('Fresh platform'))
      await Promise.all([systemCalls[1].promise, serviceCalls[1].promise])
    })
    expect(container?.textContent).toContain('fresh-host')
    expect(container?.textContent).toContain('Fresh platform')

    await act(async () => refreshButtons.forEach((button) => button.click()))
    expect(systemSummaryMock).toHaveBeenCalledTimes(3)
    expect(serviceRequestMock).toHaveBeenCalledTimes(3)
    await act(async () => root?.unmount())
    root = null
    await act(async () => {
      await vi.advanceTimersByTimeAsync(180_000)
      systemCalls[2].resolve(systemSummary('after-unmount-host'))
      serviceCalls[2].resolve(serviceStatus('After unmount platform'))
      await Promise.all([systemCalls[2].promise, serviceCalls[2].promise])
    })
    expect(systemSummaryMock).toHaveBeenCalledTimes(3)
    expect(serviceRequestMock).toHaveBeenCalledTimes(3)
  })
})
