import { describe, expect, it } from 'vitest'
import { aggregateFolderSyncItemState } from '../../../../../packages/pkms-client/src/domain/syncItemState'

describe('PKMS folder sync state aggregation', () => {
  it('reports the most important descendant state for nested paths', () => {
    expect(
      aggregateFolderSyncItemState('docs', {
        'docs/guide.md': 'pending',
        'docs/nested/reference.md': 'attention',
        'docs-archive/old.md': 'synced'
      })
    ).toBe('attention')
  })

  it('prioritizes active and unresolved work over settled states', () => {
    expect(aggregateFolderSyncItemState('docs', { 'docs/a.md': 'synced', 'docs/b.md': 'syncing' }))
      .toBe('syncing')
    expect(aggregateFolderSyncItemState('docs', { 'docs/a.md': 'pending', 'docs/b.md': 'excluded' }))
      .toBe('pending')
  })

  it('shows settled aggregate states only when every descendant agrees', () => {
    expect(
      aggregateFolderSyncItemState('docs', { 'docs/a.md': 'synced', 'docs/b.md': 'synced' })
    ).toBe('synced')
    expect(
      aggregateFolderSyncItemState('docs', { 'docs/a.md': 'excluded', 'docs/b.md': 'excluded' })
    ).toBe('excluded')
    expect(
      aggregateFolderSyncItemState('docs', { 'docs/a.md': 'synced', 'docs/b.md': 'excluded' })
    ).toBeUndefined()
    expect(aggregateFolderSyncItemState('docs', {})).toBeUndefined()
  })

  it('does not let clean descendants erase the folder’s own unresolved state', () => {
    const descendants = { 'docs/a.md': 'synced' as const, 'docs/nested/b.md': 'synced' as const }
    expect(aggregateFolderSyncItemState('docs', descendants, 'attention')).toBe('attention')
    expect(aggregateFolderSyncItemState('docs', descendants, 'pending')).toBe('pending')
  })
})
