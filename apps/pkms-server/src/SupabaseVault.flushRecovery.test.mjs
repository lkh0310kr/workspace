import { beforeEach, describe, expect, it, vi } from 'vitest'

const { supabaseRequestMock, supabaseRpcMock } = vi.hoisted(() => ({
  supabaseRequestMock: vi.fn(),
  supabaseRpcMock: vi.fn()
}))

vi.mock('./SupabaseAccountStore', () => ({
  accountStore: () => ({
    fetch: async () => Response.json({ accessToken: 'github-token' })
  })
}))
vi.mock('./crypto', () => ({ json: (body, init) => Response.json(body, init) }))
vi.mock('./supabase', () => ({
  SupabaseError: class SupabaseError extends Error {},
  supabaseRequest: supabaseRequestMock,
  supabaseRpc: supabaseRpcMock
}))
vi.mock('./linkRewrite', () => ({ computeLinkEdits: vi.fn() }))

import { flushWorkspace } from './SupabaseVault.ts'

const baseHead = 'base-head'

function createHarness(initialFiles, scenario) {
  let files = initialFiles.map((file) => ({ ...file }))
  let head = scenario === 'external' ? 'external-head' : baseHead
  let commitNumber = 0
  let finishAttempts = 0
  let updateRevisionBeforeSecondFinish = false
  const treePayloads = []
  const finishPayloads = []
  let recoveredFiles = []

  supabaseRequestMock.mockImplementation(async (_env, path) => {
    if (path.startsWith('/rest/v1/pkms_workspaces'))
      return Response.json([
        {
          workspace_id: 'workspace-1',
          owner_login: 'kanghyun',
          repository: 'owner/repo',
          branch: 'main',
          server_revision: Math.max(...files.map((file) => file.revision)),
          github_status: 'pending',
          github_head: baseHead,
          github_message: null,
          last_github_commit_at: null,
          flush_due_at: null,
          lease_token: 'lease-1'
        }
      ])
    if (path.startsWith('/rest/v1/pkms_files')) return Response.json(files)
    throw new Error(`unexpected Supabase request: ${path}`)
  })

  supabaseRpcMock.mockImplementation(async (_env, name, payload) => {
    if (name !== 'pkms_finish_flush') throw new Error(`unexpected RPC: ${name}`)
    finishAttempts += 1
    finishPayloads.push(payload)
    if (scenario !== 'external' && finishAttempts === 1)
      throw new Error('simulated_finish_flush_failure')
    if (updateRevisionBeforeSecondFinish && finishAttempts === 2) {
      files = files.map((file) => ({ ...file, revision: file.revision + 1, dirty: true }))
    }
    for (const item of payload.p_files) {
      const file = files.find((candidate) => candidate.file_id === item.fileId)
      if (file && file.revision === item.revision && file.revision <= payload.p_captured_revision) {
        file.dirty = false
        file.deleted = item.deleted
        file.sha = item.sha ?? file.sha
        file.previous_path = null
      }
    }
    return { githubStatus: 'synced' }
  })

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input, init) => {
      const url = new URL(String(input))
      const method = init?.method ?? 'GET'
      if (url.pathname === '/repos/owner/repo/git/ref/heads/main')
        return Response.json({ object: { sha: head } })
      if (url.pathname === `/repos/owner/repo/git/commits/${baseHead}`)
        return Response.json({ tree: { sha: 'base-tree' } })
      if (url.pathname === '/repos/owner/repo/git/commits/pkms-commit-1')
        return Response.json({ tree: { sha: 'recovered-tree' } })
      if (url.pathname === '/repos/owner/repo/commits/external-head')
        return Response.json({
          commit: { message: 'Manual edit' },
          author: { login: 'kanghyun' },
          parents: [{ sha: baseHead }],
          files: [{ filename: 'README.md', status: 'modified', sha: 'external-blob' }]
        })
      if (url.pathname === '/repos/owner/repo/commits/pkms-commit-1')
        return Response.json({
          commit: { message: 'Sync PKMS workspace' },
          author: { login: 'kanghyun' },
          parents: [{ sha: baseHead }],
          files: recoveredFiles
        })
      if (url.pathname === '/repos/owner/repo/git/blobs' && method === 'POST')
        return Response.json({ sha: 'new-blob-sha' })
      if (url.pathname === '/repos/owner/repo/git/trees' && method === 'POST') {
        const body = JSON.parse(String(init.body))
        treePayloads.push(body.tree)
        if (treePayloads.length === 1) {
          recoveredFiles =
            scenario === 'delete'
              ? [{ filename: 'gone.md', status: 'removed', sha: null }]
              : [
                  {
                    filename: 'new.md',
                    previous_filename: 'old.md',
                    status: 'renamed',
                    sha: 'new-blob-sha'
                  }
                ]
        }
        return Response.json({ sha: `tree-${treePayloads.length}` })
      }
      if (url.pathname === '/repos/owner/repo/git/commits' && method === 'POST') {
        commitNumber += 1
        return Response.json({ sha: `pkms-commit-${commitNumber}` })
      }
      if (url.pathname === '/repos/owner/repo/git/refs/heads/main' && method === 'PATCH') {
        head = `pkms-commit-${commitNumber}`
        return Response.json({ ref: 'refs/heads/main' })
      }
      throw new Error(`unexpected GitHub request: ${method} ${url.pathname}`)
    })
  )

  return {
    finishPayloads,
    treePayloads,
    get files() {
      return files
    },
    get finishAttempts() {
      return finishAttempts
    },
    setUpdateRevisionBeforeSecondFinish() {
      updateRevisionBeforeSecondFinish = true
    }
  }
}

const env = { ASSET_BUCKET: { get: vi.fn(), delete: vi.fn() } }

beforeEach(() => {
  vi.resetAllMocks()
  vi.unstubAllGlobals()
})

describe('flushWorkspace recovery after a failed finish RPC', () => {
  it('does not re-delete a file already removed by the previous PKMS commit', async () => {
    const harness = createHarness(
      [
        {
          file_id: 'file-delete',
          path: 'gone.md',
          parent_path: '',
          kind: 'markdown',
          content: null,
          object_key: null,
          size: 0,
          sha: 'old-blob-sha',
          previous_path: null,
          revision: 1,
          deleted: true,
          dirty: true
        }
      ],
      'delete'
    )
    await expect(flushWorkspace(env, 'workspace-1', 'kanghyun', 'lease-1')).rejects.toThrow(
      'simulated_finish_flush_failure'
    )
    await flushWorkspace(env, 'workspace-1', 'kanghyun', 'lease-1')

    expect(harness.treePayloads).toHaveLength(1)
    expect(harness.treePayloads[0].map(({ path, sha }) => ({ path, sha }))).toEqual([
      { path: 'gone.md', sha: null }
    ])
    expect(harness.finishAttempts).toBe(2)
    expect(harness.files[0].dirty).toBe(false)
    expect(harness.finishPayloads[1].p_new_head).toBe('pkms-commit-1')
  })

  it('replays a rename target, skips its removed source, and leaves a newer revision dirty', async () => {
    const harness = createHarness(
      [
        {
          file_id: 'file-rename',
          path: 'new.md',
          parent_path: '',
          kind: 'markdown',
          content: 'current content',
          object_key: null,
          size: 15,
          sha: 'old-blob-sha',
          previous_path: 'old.md',
          revision: 2,
          deleted: false,
          dirty: true
        }
      ],
      'rename'
    )
    harness.setUpdateRevisionBeforeSecondFinish()
    await expect(flushWorkspace(env, 'workspace-1', 'kanghyun', 'lease-1')).rejects.toThrow(
      'simulated_finish_flush_failure'
    )
    await flushWorkspace(env, 'workspace-1', 'kanghyun', 'lease-1')

    expect(harness.treePayloads).toHaveLength(2)
    expect(harness.treePayloads[0].map(({ path, sha }) => ({ path, sha }))).toContainEqual({
      path: 'old.md',
      sha: null
    })
    expect(harness.treePayloads[1].map(({ path, sha }) => ({ path, sha }))).toEqual([
      { path: 'new.md', sha: 'new-blob-sha' }
    ])
    expect(harness.finishPayloads[1].p_captured_revision).toBe(2)
    expect(harness.finishPayloads[1].p_files).toEqual([
      { fileId: 'file-rename', revision: 2, deleted: false, sha: 'new-blob-sha' }
    ])
    expect(harness.files[0]).toMatchObject({ revision: 3, dirty: true, previous_path: 'old.md' })
  })

  it('pauses on an unrelated external branch change', async () => {
    const harness = createHarness(
      [
        {
          file_id: 'file-edit',
          path: 'note.md',
          parent_path: '',
          kind: 'markdown',
          content: 'current content',
          object_key: null,
          size: 15,
          sha: 'old-blob-sha',
          previous_path: null,
          revision: 1,
          deleted: false,
          dirty: true
        }
      ],
      'external'
    )
    await flushWorkspace(env, 'workspace-1', 'kanghyun', 'lease-1')

    expect(harness.treePayloads).toHaveLength(0)
    expect(harness.finishPayloads[0]).toMatchObject({
      p_github_status: 'external-change',
      p_files: []
    })
  })
})
