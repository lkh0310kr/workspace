/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest'
import {
  formatDroppedPaths,
  installTerminalFileDropHandler,
  TERMINAL_FILE_DROP_EVENT
} from './terminal-file-drop'

describe('terminal file drop', () => {
  it('encodes Codex paths as file URLs, including spaces and unicode', () => {
    expect(formatDroppedPaths(['/Users/me/My Image.png', '/tmp/한글.png'], 'codex')).toBe(
      'file:///Users/me/My%20Image.png file:///tmp/%ED%95%9C%EA%B8%80.png'
    )
  })

  it('quotes shell paths safely without submitting them', () => {
    const container = document.createElement('div')
    const focus = vi.fn()
    const write = vi.fn()
    const dispose = installTerminalFileDropHandler({
      container,
      focus,
      write,
      getTerminalAgent: () => null
    })
    const event = new CustomEvent(TERMINAL_FILE_DROP_EVENT, {
      bubbles: true,
      cancelable: true,
      detail: { paths: ["/tmp/My image's.png"] }
    })

    container.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expect(focus).toHaveBeenCalledOnce()
    expect(write).toHaveBeenCalledWith("'/tmp/My image'\\''s.png'")
    expect(write.mock.calls[0][0]).not.toContain('\n')
    dispose()
  })

  it('ignores invalid paths and removes the listener on disposal', () => {
    const container = document.createElement('div')
    const write = vi.fn()
    const dispose = installTerminalFileDropHandler({
      container,
      focus: vi.fn(),
      write,
      getTerminalAgent: () => 'codex'
    })
    container.dispatchEvent(
      new CustomEvent(TERMINAL_FILE_DROP_EVENT, {
        detail: { paths: ['/tmp/image.png\nsubmit'] }
      })
    )
    expect(write).not.toHaveBeenCalled()

    dispose()
    container.dispatchEvent(
      new CustomEvent(TERMINAL_FILE_DROP_EVENT, { detail: { paths: ['/tmp/image.png'] } })
    )
    expect(write).not.toHaveBeenCalled()
  })
})
