export function getStoredAutoSave(): boolean {
  try {
    return window.localStorage.getItem('workspace.autoSave') === '1'
  } catch {
    return false
  }
}
