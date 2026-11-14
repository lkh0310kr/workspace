import { describe, expect, it, vi } from 'vitest'
import { DirectoryRequestRegistry } from './directoryRequestRegistry'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe('DirectoryRequestRegistry', () => {
  it('coalesces the same directory within a workspace but keeps workspaces isolated', async () => {
    const registry = new DirectoryRequestRegistry()
    const loadWorkspaceA = deferred<string>()
    const loadWorkspaceB = deferred<string>()
    const requestA = vi.fn(() => loadWorkspaceA.promise)
    const requestB = vi.fn(() => loadWorkspaceB.promise)

    const firstA = registry.run('workspace-a', '', requestA)
    const duplicateA = registry.run('workspace-a', '', requestA)
    const firstB = registry.run('workspace-b', '', requestB)

    expect(requestA).toHaveBeenCalledTimes(1)
    expect(requestB).toHaveBeenCalledTimes(1)

    loadWorkspaceA.resolve('a-root')
    loadWorkspaceB.resolve('b-root')
    await expect(Promise.all([firstA, duplicateA, firstB])).resolves.toEqual([
      'a-root',
      'a-root',
      'b-root'
    ])
  })

  it('allows a failed directory request to be retried', async () => {
    const registry = new DirectoryRequestRegistry()
    const load = vi.fn().mockRejectedValueOnce(new Error('temporary failure')).mockResolvedValue('ok')

    await expect(registry.run('workspace', 'notes', load)).rejects.toThrow('temporary failure')
    await expect(registry.run('workspace', 'notes', load)).resolves.toBe('ok')
    expect(load).toHaveBeenCalledTimes(2)
  })
})
