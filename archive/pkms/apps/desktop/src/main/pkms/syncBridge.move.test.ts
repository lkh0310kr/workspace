import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const testUserData = vi.hoisted(() => `/tmp/workspace-pkms-move-test-${process.pid}`)
vi.mock('electron', () => ({
  app: { getPath: () => testUserData },
  BrowserWindow: { getAllWindows: () => [] }
}))

import { movePkmsLocalItems } from './syncBridge'

describe('PKMS local folder move destination conflicts', () => {
  let fixture: string
  const workspaceId = 'move-conflict-test'
  const sourcePath = '01 math'
  const sourceId = `local-${Buffer.from(sourcePath).toString('base64url')}`

  beforeAll(async () => {
    fixture = await mkdtemp(path.join(os.tmpdir(), 'pkms-move-fixture-'))
    await mkdir(path.join(fixture, sourcePath, 'chapter'), { recursive: true })
    await writeFile(path.join(fixture, sourcePath, 'chapter', 'source.md'), 'source content')
    await mkdir(path.join(fixture, 'engineering', sourcePath, 'chapter'), { recursive: true })
    await writeFile(
      path.join(fixture, 'engineering', sourcePath, 'chapter', 'existing.md'),
      'existing content'
    )
    await mkdir(path.join(fixture, 'second'), { recursive: true })
    await writeFile(path.join(fixture, 'second', 'source.md'), 'second source')
    await mkdir(path.join(fixture, 'engineering', 'second'), { recursive: true })
    await writeFile(path.join(fixture, 'engineering', 'second', 'existing.md'), 'second target')
    await mkdir(testUserData, { recursive: true })
    await writeFile(
      path.join(testUserData, 'pkms-sync-bridge.json'),
      JSON.stringify({ configs: { [workspaceId]: { folderPath: fixture, excludedPaths: [] } } })
    )
  })

  afterAll(async () => {
    await rm(fixture, { recursive: true, force: true })
    await rm(testUserData, { recursive: true, force: true })
  })

  it('preserves both trees until confirmed, then replaces only the confirmed destination', async () => {
    await expect(movePkmsLocalItems(workspaceId, [sourceId], 'engineering')).rejects.toThrow(
      'local_destination_exists'
    )
    expect(await readFile(path.join(fixture, sourcePath, 'chapter', 'source.md'), 'utf8')).toBe(
      'source content'
    )
    expect(
      await readFile(
        path.join(fixture, 'engineering', sourcePath, 'chapter', 'existing.md'),
        'utf8'
      )
    ).toBe('existing content')

    const secondId = `local-${Buffer.from('second').toString('base64url')}`
    await expect(
      movePkmsLocalItems(workspaceId, [sourceId, secondId], 'engineering', [
        `engineering/${sourcePath}`
      ])
    ).rejects.toThrow('local_destination_exists')
    expect(await readFile(path.join(fixture, sourcePath, 'chapter', 'source.md'), 'utf8')).toBe(
      'source content'
    )
    expect(await readFile(path.join(fixture, 'second', 'source.md'), 'utf8')).toBe('second source')
    expect(await readFile(path.join(fixture, 'engineering', 'second', 'existing.md'), 'utf8')).toBe(
      'second target'
    )

    await movePkmsLocalItems(workspaceId, [sourceId], 'engineering', [`engineering/${sourcePath}`])

    expect(
      await readFile(path.join(fixture, 'engineering', sourcePath, 'chapter', 'source.md'), 'utf8')
    ).toBe('source content')
    await expect(
      readFile(path.join(fixture, 'engineering', sourcePath, 'chapter', 'existing.md'), 'utf8')
    ).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(
      readFile(path.join(fixture, sourcePath, 'chapter', 'source.md'), 'utf8')
    ).rejects.toMatchObject({
      code: 'ENOENT'
    })
  })
})
