/** Operating-system shell actions shared by Desktop feature adapters. */
export async function revealItemInDir(path: string): Promise<void> {
  return window.api.shell.revealItemInDir(path)
}
