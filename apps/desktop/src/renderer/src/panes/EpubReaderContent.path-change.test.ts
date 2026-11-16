// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_EBOOK_STATE } from '../../../shared/ebookState'

const electron = vi.hoisted(() => ({
  openEpub: vi.fn(),
  openEpubAbsolute: vi.fn(),
  getEbookState: vi.fn(),
  saveEbookState: vi.fn()
}))

vi.mock('../electron', () => electron)
vi.mock('../vendor/foliate-js/view.js', () => ({}))
vi.mock('../vendor/foliate-js/epub.js', () => ({
  EPUB: class {
    init(): Promise<Record<string, never>> {
      return Promise.resolve({})
    }
  }
}))
vi.mock('../vendor/foliate-js/ui/tree.js', () => ({ createTOCView: vi.fn() }))

import { EpubReaderContent } from './EpubReaderContent'

;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

class FakeFoliateView extends HTMLElement {
  book = { metadata: { title: 'Second book' }, toc: null }
  renderer = { setAttribute: vi.fn(), setStyles: vi.fn() }
  lastLocation = undefined
  open = vi.fn(async () => {})
  close = vi.fn()
  init = vi.fn(async () => {})
  goLeft = vi.fn(async () => {})
  goRight = vi.fn(async () => {})
  goTo = vi.fn(async () => {})
  goToFraction = vi.fn(async () => {})
  search = vi.fn(async function* (): AsyncGenerator<string, void, unknown> {
    yield 'done'
  })
  clearSearch = vi.fn()
}

type EpubOpenResult = { bookId: string; sizes: Record<string, number>; title: string }
type Deferred<T> = {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason: unknown) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

async function flushPromises(): Promise<void> {
  for (let i = 0; i < 10; i += 1) await Promise.resolve()
}

describe('EpubReaderContent path changes', () => {
  let root: Root | null = null
  let container: HTMLDivElement | null = null

  beforeEach(() => {
    if (!customElements.get('foliate-view')) {
      customElements.define('foliate-view', FakeFoliateView)
    }
    electron.openEpub.mockReset()
    electron.openEpubAbsolute.mockReset()
    electron.getEbookState.mockReset().mockResolvedValue({
      ...DEFAULT_EBOOK_STATE
    })
    electron.saveEbookState.mockReset().mockResolvedValue(undefined)
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    if (root) await act(async () => root?.unmount())
    root = null
    container?.remove()
    container = null
  })

  it('opens a new EPUB after the previous path failed', async () => {
    electron.openEpub
      .mockRejectedValueOnce(new Error('first book failed'))
      .mockResolvedValueOnce({ bookId: 'book-2', sizes: {}, title: 'Second book' })
    await act(async () => {
      root?.render(createElement(EpubReaderContent, { tabId: 7, filePath: 'first.epub' }))
      await flushPromises()
    })
    expect(container?.textContent).toContain('first book failed')
    expect(electron.openEpub).toHaveBeenCalledTimes(1)

    await act(async () => {
      root?.render(createElement(EpubReaderContent, { tabId: 7, filePath: 'second.epub' }))
      await flushPromises()
    })

    expect(electron.openEpub).toHaveBeenCalledTimes(2)
    expect(electron.openEpub).toHaveBeenLastCalledWith(7, 'second.epub')
    expect(container?.textContent).not.toContain('first book failed')
    expect(container?.textContent).toContain('Second book')
  })

  it('ignores an older open failure after the new path has loaded', async () => {
    const oldOpen = deferred<EpubOpenResult>()
    electron.openEpub
      .mockImplementationOnce(() => oldOpen.promise)
      .mockResolvedValueOnce({ bookId: 'book-2', sizes: {}, title: 'Second book' })

    await act(async () => {
      root?.render(createElement(EpubReaderContent, { tabId: 7, filePath: 'first.epub' }))
      await flushPromises()
    })
    expect(electron.openEpub).toHaveBeenCalledTimes(1)

    await act(async () => {
      root?.render(createElement(EpubReaderContent, { tabId: 7, filePath: 'second.epub' }))
      await flushPromises()
    })
    expect(electron.openEpub).toHaveBeenCalledTimes(2)
    expect(container?.textContent).toContain('Second book')

    await act(async () => {
      oldOpen.reject(new Error('late first book failure'))
      await oldOpen.promise.catch(() => undefined)
      await flushPromises()
    })
    expect(container?.textContent).not.toContain('late first book failure')
    expect(container?.textContent).toContain('Second book')
  })
})
