export interface BrowserImageContextMenuContext {
  mediaType: string
  srcURL: string
  hasImageContents: boolean
  x: number
  y: number
}

export interface BrowserImageContextMenuActions {
  openImageInNewTab: (url: string) => void
  saveImage: (url: string) => void
  copyImage: (x: number, y: number) => void
  copyImageAddress: (url: string) => void
}

export interface BrowserImageContextMenuItem {
  label: string
  enabled: boolean
  click: () => void
}

function normalizeOpenableImageUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl)
    return ['http:', 'https:', 'file:'].includes(url.protocol) ? url.toString() : null
  } catch {
    return null
  }
}

export function buildBrowserImageContextMenu(
  context: BrowserImageContextMenuContext,
  actions: BrowserImageContextMenuActions
): BrowserImageContextMenuItem[] | null {
  if (context.mediaType !== 'image' || !context.srcURL) return null

  const items: BrowserImageContextMenuItem[] = []
  const openableUrl = normalizeOpenableImageUrl(context.srcURL)
  if (openableUrl) {
    items.push({
      label: 'Open Image in New Tab',
      enabled: true,
      click: () => actions.openImageInNewTab(openableUrl)
    })
  }

  items.push(
    {
      label: 'Save Image',
      enabled: true,
      click: () => actions.saveImage(context.srcURL)
    },
    {
      label: 'Copy Image',
      enabled: context.hasImageContents,
      click: () => actions.copyImage(context.x, context.y)
    },
    {
      label: 'Copy Image Address',
      enabled: true,
      click: () => actions.copyImageAddress(context.srcURL)
    }
  )

  return items
}
