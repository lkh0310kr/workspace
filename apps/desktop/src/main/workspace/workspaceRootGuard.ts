/** Reject filesystem requests created for a tab root that has since changed. */
export function assertExpectedWorkspaceRoot(
  currentRootPath: string,
  expectedRootPath?: string
): void {
  if (expectedRootPath !== undefined && currentRootPath !== expectedRootPath) {
    throw new Error('Workspace root changed; retry the operation in the current workspace.')
  }
}
