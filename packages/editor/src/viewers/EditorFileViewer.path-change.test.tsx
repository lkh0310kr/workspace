// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EditorFileViewer } from './EditorFileViewer'
import type { EditorViewerHost } from './viewerHost'

;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

type Deferred<T> = {
  promise: Promise<T>
  resolve: (value: T) => void
}

const hostFunctions = {
  readFileBinaryPreview: vi.fn(),
  getMediaUrl: vi.fn(),
  getMediaUrlAbsolute: vi.fn(),
  pickMediaFileDialog: vi.fn()
}

const host: EditorViewerHost = {
  ...hostFunctions,
  EpubReaderContent: () => null,
  ModelViewerContent: () => null,
  CadViewerContent: () => null
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

async function flushPromises(): Promise<void> {
  for (let i = 0; i < 10; i += 1) await Promise.resolve()
}

describe('EditorFileViewer path changes', () => {
  let root: Root | null = null
  let container: HTMLDivElement | null = null
  let createObjectURL: ReturnType<typeof vi.fn>
  let revokeObjectURL: ReturnType<typeof vi.fn>

  beforeEach(() => {
    hostFunctions.getMediaUrl.mockReset()
    hostFunctions.getMediaUrlAbsolute.mockReset()
    hostFunctions.pickMediaFileDialog.mockReset()
    hostFunctions.readFileBinaryPreview.mockReset()
    createObjectURL = vi.fn().mockReturnValueOnce('blob:first').mockReturnValueOnce('blob:second')
    revokeObjectURL = vi.fn()
    const NativeUrl = URL
    class MockUrl extends NativeUrl {
      static createObjectURL = createObjectURL
      static revokeObjectURL = revokeObjectURL
    }
    vi.stubGlobal('URL', MockUrl)
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    if (root) await act(async () => root?.unmount())
    root = null
    container?.remove()
    container = null
    vi.unstubAllGlobals()
  })

  it('clears the previous image while the next path preview is pending', async () => {
    const firstPreview = deferred<{ content: string; mimeType: string }>()
    const secondPreview = deferred<{ content: string; mimeType: string }>()
    hostFunctions.readFileBinaryPreview
      .mockImplementationOnce(() => firstPreview.promise)
      .mockImplementationOnce(() => secondPreview.promise)

    await act(async () => {
      root?.render(
        createElement(EditorFileViewer, {
          host,
          tabId: 7,
          filePath: 'first.png',
          absolutePath: null,
          onAssignAbsolutePath: vi.fn()
        })
      )
      await flushPromises()
    })
    await act(async () => {
      firstPreview.resolve({ content: 'YQ==', mimeType: 'image/png' })
      await firstPreview.promise
      await flushPromises()
    })
    expect(container?.querySelector('img')?.getAttribute('src')).toBe('blob:first')

    await act(async () => {
      root?.render(
        createElement(EditorFileViewer, {
          host,
          tabId: 7,
          filePath: 'second.png',
          absolutePath: null,
          onAssignAbsolutePath: vi.fn()
        })
      )
      await flushPromises()
    })

    expect(container?.querySelector('img')).toBeNull()
    expect(container?.textContent).toContain('Loading…')
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:first')

    await act(async () => {
      secondPreview.resolve({ content: 'Yg==', mimeType: 'image/png' })
      await secondPreview.promise
      await flushPromises()
    })

    expect(container?.querySelector('img')?.getAttribute('src')).toBe('blob:second')
  })
})
