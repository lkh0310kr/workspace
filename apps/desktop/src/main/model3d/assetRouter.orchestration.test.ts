import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { routeAssetOpen } from './assetRouter'

const tempDirs: string[] = []

function makeTempWorkspace(files: Record<string, Buffer | string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'model-route-'))
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

describe('routeAssetOpen', () => {
  it('preview intent completes import job with manifest', async () => {
    const glbHeader = Buffer.from([0x67, 0x6c, 0x54, 0x46, 0x02, 0x00, 0x00, 0x00])
    const root = makeTempWorkspace({ 'models/box.glb': glbHeader })
    const job = await routeAssetOpen(
      { tabId: 1, relativePath: 'models/box.glb', intent: 'preview', source: 'tree' },
      root
    )
    expect(job.phase).toBe('ready')
    expect(job.pipeline).toBe('import-preview')
    expect(job.manifest?.status).toBe('ready')
  })
})
