import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { execFileSync } from 'node:child_process'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { listDir, readFileBinaryPreview } from './files'

const tempDirs: string[] = []

function makeTempRoot(files: Record<string, Buffer>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'files-preview-'))
  tempDirs.push(dir)
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(dir, rel)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, content)
  }
  return dir
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

describe('readFileBinaryPreview', () => {
  it('reads glb files', async () => {
    const glbHeader = Buffer.from([0x67, 0x6c, 0x54, 0x46, 0x02, 0x00, 0x00, 0x00])
    const root = makeTempRoot({ 'box.glb': glbHeader })
    const preview = await readFileBinaryPreview(root, 'box.glb')
    expect(preview).not.toBeNull()
    expect(preview?.mimeType).toBe('model/gltf-binary')
    expect(preview?.content.length).toBeGreaterThan(0)
  })

  it('reads obj files', async () => {
    const root = makeTempRoot({ 'cube.obj': Buffer.from('o Cube\nv 0 0 0\n') })
    const preview = await readFileBinaryPreview(root, 'cube.obj')
    expect(preview).not.toBeNull()
    expect(preview?.mimeType).toBe('model/obj')
  })

  it('reads stl files', async () => {
    const root = makeTempRoot({ 'cube.stl': Buffer.from('solid cube\nendsolid cube\n') })
    const preview = await readFileBinaryPreview(root, 'cube.stl')
    expect(preview).not.toBeNull()
    expect(preview?.mimeType).toBe('model/stl')
  })

  it('keeps the main event loop responsive while file bytes are pending', async () => {
    const root = makeTempRoot({ 'box.glb': Buffer.from('unused') })
    let finishRead: ((bytes: Buffer) => void) | undefined
    const readFile = vi.spyOn(fs.promises, 'readFile').mockImplementation(
      () =>
        new Promise((resolve) => {
          finishRead = (bytes) => resolve(bytes as never)
        })
    )

    try {
      const previewPromise = readFileBinaryPreview(root, 'box.glb')
      expect(readFile).toHaveBeenCalledOnce()

      await new Promise<void>((resolve) => setImmediate(resolve))
      finishRead?.(Buffer.from('async bytes'))

      await expect(previewPromise).resolves.toEqual({
        content: Buffer.from('async bytes').toString('base64'),
        mimeType: 'model/gltf-binary'
      })
    } finally {
      readFile.mockRestore()
    }
  })

  it('returns null for unknown extensions', async () => {
    const root = makeTempRoot({ 'readme.txt': Buffer.from('hi') })
    await expect(readFileBinaryPreview(root, 'readme.txt')).resolves.toBeNull()
  })
})

describe('listDir Git ignore decorations', () => {
  it('keeps the main event loop responsive while directory entries are pending', async () => {
    const root = makeTempRoot({ 'note.md': Buffer.from('content') })
    const entry = { name: 'note.md', isDirectory: () => false } as fs.Dirent
    let finishRead: ((entries: fs.Dirent[]) => void) | undefined
    const readdir = vi.spyOn(fs.promises, 'readdir').mockImplementation(
      () =>
        new Promise((resolve) => {
          finishRead = (entries) => resolve(entries as never)
        })
    )

    try {
      const listingPromise = listDir(root, '')
      expect(readdir).toHaveBeenCalledOnce()

      await new Promise<void>((resolve) => setImmediate(resolve))
      finishRead?.([entry])

      await expect(listingPromise).resolves.toEqual([
        { name: 'note.md', path: 'note.md', isDir: false, isIgnored: false }
      ])
    } finally {
      readdir.mockRestore()
    }
  })

  it('marks ignored paths but respects negation and tracked files', async () => {
    const root = makeTempRoot({
      '.gitignore': Buffer.from('*.log\nignored-dir/\n!keep.log\n'),
      'debug.log': Buffer.from('ignored'),
      'keep.log': Buffer.from('included again'),
      'tracked.log': Buffer.from('already tracked'),
      'ignored-dir/secret.md': Buffer.from('ignored child'),
      'visible.md': Buffer.from('visible')
    })
    execFileSync('git', ['init'], { cwd: root, stdio: 'ignore' })
    execFileSync('git', ['add', '--force', 'tracked.log'], { cwd: root, stdio: 'ignore' })

    const entries = await listDir(root, '')
    const ignoredByName = Object.fromEntries(entries.map((entry) => [entry.name, entry.isIgnored]))

    expect(ignoredByName['debug.log']).toBe(true)
    expect(ignoredByName['ignored-dir']).toBe(true)
    expect(ignoredByName['keep.log']).toBe(false)
    expect(ignoredByName['tracked.log']).toBe(false)
    expect(ignoredByName['visible.md']).toBe(false)

    const children = await listDir(root, 'ignored-dir')
    expect(children.find((entry) => entry.name === 'secret.md')?.isIgnored).toBe(true)
  })

  it('keeps entries visible and unmarked when the root is not a Git repository', async () => {
    const root = makeTempRoot({ 'notes.md': Buffer.from('visible') })
    await expect(listDir(root, '')).resolves.toEqual([
      { name: 'notes.md', path: 'notes.md', isDir: false, isIgnored: false }
    ])
  })
})
