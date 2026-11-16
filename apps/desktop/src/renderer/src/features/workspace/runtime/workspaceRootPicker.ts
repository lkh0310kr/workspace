/** Native directory picker used when setting a Workspace tab's root path. */
export async function openDirectoryDialog(defaultPath?: string): Promise<string | null> {
  const result = await window.api.dialog.openDirectory(defaultPath)
  if (result.ok) return result.path
  if (!result.canceled && result.error) throw new Error(result.error)
  return null
}
