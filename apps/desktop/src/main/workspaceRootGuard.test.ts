import { describe, expect, it } from 'vitest'
import { assertExpectedWorkspaceRoot } from './workspaceRootGuard'

describe('assertExpectedWorkspaceRoot', () => {
  it('allows requests without a pinned root for existing callers', () => {
    expect(() => assertExpectedWorkspaceRoot('/workspace-b')).not.toThrow()
  })

  it('rejects an operation pinned to the previous tab root', () => {
    expect(() => assertExpectedWorkspaceRoot('/workspace-b', '/workspace-a')).toThrow(
      'Workspace root changed; retry the operation in the current workspace.'
    )
  })

  it('allows a request pinned to the current tab root', () => {
    expect(() => assertExpectedWorkspaceRoot('/workspace-b', '/workspace-b')).not.toThrow()
  })
})
