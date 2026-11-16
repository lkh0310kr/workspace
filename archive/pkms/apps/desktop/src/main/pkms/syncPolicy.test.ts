import { describe, expect, it } from 'vitest'
import {
  folderPathsToReconcile,
  nextGuardedFolderDeleteRevision,
  pathIsWithinFolder,
  remoteDeletedFolders,
  remoteChangedSinceBaseline,
  resetRootScopedState
} from './syncPolicy'

describe('PKMS sync race policy', () => {
  it('detects deleted folders from an authoritative snapshot by identity, not path alone', () => {
    expect(
      remoteDeletedFolders(
        [
          { id: 'old-folder', path: 'engineering/01 math', kind: 'folder' },
          { id: 'moved-folder', path: 'old-name', kind: 'folder' }
        ],
        [
          { id: 'new-folder', path: 'engineering/01 math', kind: 'folder' },
          { id: 'moved-folder', path: 'new-name', kind: 'folder' }
        ]
      )
    ).toEqual(['engineering/01 math'])
  })

  it('matches deleted folder descendants without matching similarly prefixed siblings', () => {
    expect(pathIsWithinFolder('engineering/01 math/chapter.md', 'engineering/01 math')).toBe(true)
    expect(pathIsWithinFolder('engineering/01 mathematics/note.md', 'engineering/01 math')).toBe(
      false
    )
  })

  it('reconciles missing folder metadata from a directory scan, parent first', () => {
    expect(
      folderPathsToReconcile(
        ['03 electric/chapter', '02 physics', '03 electric', 'engineering'],
        [
          { path: 'engineering', kind: 'folder' },
          { path: '03 electric/chapter/note.md', kind: 'markdown' }
        ],
        true,
        []
      )
    ).toEqual(['02 physics', '03 electric', '03 electric/chapter'])
  })

  it('limits incremental folder repair to watcher paths and preserves existing cloud folders', () => {
    expect(
      folderPathsToReconcile(['missing-from-watcher'], [{ path: 'known', kind: 'folder' }], false, [
        'new/deep',
        'known'
      ])
    ).toEqual(['new/deep'])
  })

  it('restores the remote item when a local deletion raced with a newer cloud revision', () => {
    expect(
      remoteChangedSinceBaseline({ id: 'file-1', revision: 12 }, { fileId: 'file-1', revision: 11 })
    ).toBe(true)
  })

  it('restores the remote item when the same path now belongs to a different file identity', () => {
    expect(
      remoteChangedSinceBaseline({ id: 'file-2', revision: 11 }, { fileId: 'file-1', revision: 11 })
    ).toBe(true)
  })

  it('allows a local deletion only while the cloud identity and revision match its baseline', () => {
    expect(
      remoteChangedSinceBaseline({ id: 'file-1', revision: 11 }, { fileId: 'file-1', revision: 11 })
    ).toBe(false)
  })

  it('advances the base revision between sibling folder deletions in one pass', () => {
    const queuedAt = 1794
    const firstDeleteAcceptedAt = 1795
    expect(nextGuardedFolderDeleteRevision(firstDeleteAcceptedAt, queuedAt)).toBe(1795)
  })

  it('never regresses behind a queued deletion revision', () => {
    expect(nextGuardedFolderDeleteRevision(1794, 1795)).toBe(1795)
  })
})

describe('PKMS local root transition', () => {
  it('clears prior-root baselines and caches while retaining durable cloud mutations', () => {
    const state = {
      baselines: { workspace: { 'old.md': { fileId: 'cloud-1', hash: 'old', revision: 4 } } },
      remoteFiles: { workspace: { 'cloud-1': { path: 'old.md' } } },
      syncCursors: { workspace: 4 },
      remoteTrees: { workspace: [{ path: 'old.md' }] },
      remoteTreeVersions: { workspace: 4 },
      pendingFullScans: { workspace: true },
      pendingPaths: { workspace: ['old.md'] },
      pendingFolderCreates: { workspace: { 'old-folder': 'op-folder' } },
      localDirectories: { workspace: { 'old-folder': 'dev:ino' } },
      pendingDeletes: { workspace: { 'old.md': { operationId: 'op-delete' } } },
      pendingRemoteFolderDeletes: { workspace: ['old-folder'] },
      pendingCreates: { workspace: { 'new.md': { operationId: 'op-create' } } },
      pendingUpdates: { workspace: { 'cloud-2': { operationId: 'op-update' } } }
    }

    resetRootScopedState(state, 'workspace')

    expect(state.baselines.workspace).toBeUndefined()
    expect(state.remoteFiles.workspace).toBeUndefined()
    expect(state.syncCursors.workspace).toBeUndefined()
    expect(state.remoteTrees.workspace).toBeUndefined()
    expect(state.remoteTreeVersions.workspace).toBeUndefined()
    expect(state.pendingFullScans.workspace).toBeUndefined()
    expect(state.pendingPaths.workspace).toBeUndefined()
    expect(state.pendingFolderCreates.workspace).toBeUndefined()
    expect(state.localDirectories.workspace).toBeUndefined()
    expect(state.pendingDeletes.workspace).toBeUndefined()
    expect(state.pendingRemoteFolderDeletes.workspace).toBeUndefined()
    expect(state.pendingCreates.workspace['new.md'].operationId).toBe('op-create')
    expect(state.pendingUpdates.workspace['cloud-2'].operationId).toBe('op-update')
  })

  it("does not reset another workspace's local replica state", () => {
    const state = {
      baselines: { workspace: { 'old.md': {} }, other: { 'keep.md': {} } },
      remoteFiles: {},
      syncCursors: { other: 9 },
      remoteTrees: {},
      remoteTreeVersions: {},
      pendingFullScans: {},
      pendingPaths: {},
      pendingFolderCreates: {},
      localDirectories: {},
      pendingDeletes: {},
      pendingRemoteFolderDeletes: {}
    }

    resetRootScopedState(state, 'workspace')

    expect(state.baselines.other).toEqual({ 'keep.md': {} })
    expect(state.syncCursors.other).toBe(9)
  })
})
