/** Native clipboard operations shared by Desktop feature adapters. */
export function writeClipboardText(text: string): void {
  window.api.clipboard.writeText(text)
}

export function readClipboardText(): Promise<string> {
  return window.api.clipboard.readText()
}

export function saveClipboardImageAsTempFile(): Promise<string | null> {
  return window.api.clipboard.saveImageAsTempFile()
}
