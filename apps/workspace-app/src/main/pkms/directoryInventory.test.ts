import { lstat, mkdir, mkdtemp, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  localDirectoryInventory,
  matchesExclusion,
  missingLocalDirectories,
  pathIsProtectedByInventory,
  preserveProtectedDirectoryIdentities,
  type DirectoryInventoryIO
} from './directoryInventory'

const roots: string[] = []

async function makeRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'pkms-directory-inventory-'))
  roots.push(root)
  return root
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('complete local directory inventory', () => {
  it('recurses through folders and skips reserved, excluded, and symlink paths', async () => {
    const root = await makeRoot()
    await mkdir(path.join(root, '02 physics', 'chapter'), { recursive: true })
    await mkdir(path.join(root, 'private', 'nested'), { recursive: true })
    await mkdir(path.join(root, '.git', 'objects'), { recursive: true })
    await mkdir(path.join(root, 'node_modules', 'dependency'), { recursive: true })
    await mkdir(path.join(root, 'target', 'secret'), { recursive: true })
    await symlink(path.join(root, 'target'), path.join(root, 'linked'))
    await writeFile(path.join(root, '02 physics', 'chapter', 'note.md'), 'note')

    const inventory = await localDirectoryInventory(root, ['private/**'])

    expect(Object.keys(inventory.directories).sort()).toEqual([
      '02 physics',
      '02 physics/chapter',
      'target',
      'target/secret'
    ])
    expect(inventory.protectedPaths).toEqual(['linked'])
    expect(pathIsProtectedByInventory('linked/secret/note.md', inventory.protectedPaths)).toBe(true)
    expect(pathIsProtectedByInventory('linked-other/note.md', inventory.protectedPaths)).toBe(false)
    const previous = { linked: 'dev:1', 'linked/child': 'dev:2', deleted: 'dev:3' }
    expect(missingLocalDirectories(previous, inventory)).toEqual(['deleted'])
    expect(preserveProtectedDirectoryIdentities(previous, inventory)).toMatchObject({
      linked: 'dev:1',
      'linked/child': 'dev:2'
    })
    expect(inventory.directories['02 physics']).toMatch(/^\d+:\d+$/)
    expect(matchesExclusion('private/nested', ['private/**'])).toBe(true)
    expect(matchesExclusion('privateish/nested', ['private/**'])).toBe(false)
  })

  it('rejects when a nested directory cannot be read instead of returning a partial inventory', async () => {
    const root = await makeRoot()
    await mkdir(path.join(root, 'first'), { recursive: true })
    await mkdir(path.join(root, 'inaccessible'), { recursive: true })
    const io: DirectoryInventoryIO = {
      readdir: async (directory) => {
        if (path.basename(directory) === 'inaccessible') {
          throw Object.assign(new Error('permission denied'), { code: 'EACCES' })
        }
        return readdir(directory, { withFileTypes: true })
      },
      lstat: (target) => lstat(target, { bigint: true })
    }

    await expect(localDirectoryInventory(root, [], io)).rejects.toMatchObject({ code: 'EACCES' })
  })

  it('rejects a root that is missing or unavailable', async () => {
    const root = path.join(await makeRoot(), 'missing')
    await expect(localDirectoryInventory(root, [])).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
