export const DEFAULT_BROWSER_TAB_URL = 'https://www.google.com'

export type BrowserTabLabelInput = {
  title?: string | null
  url?: string | null
}

export function browserTabUrlForNewTab(sourceUrl?: string | null): string {
  return sourceUrl ?? DEFAULT_BROWSER_TAB_URL
}

export function getBrowserTabLabel(item: BrowserTabLabelInput): string {
  if (item.title?.trim()) return item.title.trim()
  try {
    return item.url ? new URL(item.url).hostname : 'New Tab'
  } catch {
    return item.url || 'New Tab'
  }
}
