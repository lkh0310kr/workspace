import { describe, expect, it, vi } from 'vitest'
import {
  buildBrowserImageContextMenu,
  type BrowserImageContextMenuActions
} from './browserImageContextMenu'

function createActions(): BrowserImageContextMenuActions {
  return {
    openImageInNewTab: vi.fn(),
    saveImage: vi.fn(),
    copyImage: vi.fn(),
    copyImageAddress: vi.fn()
  }
}

describe('buildBrowserImageContextMenu', () => {
  it('provides Orca-style actions for a navigable image URL', () => {
    const actions = createActions()
    const menu = buildBrowserImageContextMenu(
      {
        mediaType: 'image',
        srcURL: 'https://example.com/image.png',
        hasImageContents: true,
        x: 12,
        y: 34
      },
      actions
    )

    expect(menu?.map(({ label }) => label)).toEqual([
      'Open Image in New Tab',
      'Save Image',
      'Copy Image',
      'Copy Image Address'
    ])
    menu?.forEach((item) => item.click())
    expect(actions.openImageInNewTab).toHaveBeenCalledWith('https://example.com/image.png')
    expect(actions.saveImage).toHaveBeenCalledWith('https://example.com/image.png')
    expect(actions.copyImage).toHaveBeenCalledWith(12, 34)
    expect(actions.copyImageAddress).toHaveBeenCalledWith('https://example.com/image.png')
  })

  it.each(['blob:https://example.com/id', 'data:image/png;base64,AA=='])(
    'omits Open Image in New Tab for non-navigable URL %s',
    (srcURL) => {
      const menu = buildBrowserImageContextMenu(
        { mediaType: 'image', srcURL, hasImageContents: true, x: 0, y: 0 },
        createActions()
      )

      expect(menu?.map(({ label }) => label)).toEqual([
        'Save Image',
        'Copy Image',
        'Copy Image Address'
      ])
    }
  )

  it('disables Copy Image when the image has no contents', () => {
    const menu = buildBrowserImageContextMenu(
      {
        mediaType: 'image',
        srcURL: 'https://example.com/empty.png',
        hasImageContents: false,
        x: 1,
        y: 2
      },
      createActions()
    )

    expect(menu?.find(({ label }) => label === 'Copy Image')?.enabled).toBe(false)
  })

  it.each([
    { mediaType: 'link', srcURL: 'https://example.com/image.png' },
    { mediaType: 'image', srcURL: '' }
  ])('returns no menu for non-image or missing image URL', ({ mediaType, srcURL }) => {
    expect(
      buildBrowserImageContextMenu(
        { mediaType, srcURL, hasImageContents: true, x: 0, y: 0 },
        createActions()
      )
    ).toBeNull()
  })
})
