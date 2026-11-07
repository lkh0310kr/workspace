import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import * as path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  arduinoCliCandidates,
  compileArduinoFirmware,
  type HardwareCommandRunner
} from './arduinoCompile'

const temporaryRoots: string[] = []

function fixture(): { root: string; projectPath: string; firmwarePath: string } {
  const root = mkdtempSync(path.join(tmpdir(), 'hardware-compile-contract-'))
  temporaryRoots.push(root)
  const sketchDir = path.join(root, 'firmware', 'blink')
  mkdirSync(sketchDir, { recursive: true })
  const projectPath = path.join(root, 'hardware-sim.json')
  const firmwarePath = path.join(sketchDir, 'blink.ino')
  writeFileSync(projectPath, '{}\n')
  writeFileSync(firmwarePath, 'void setup() {}\nvoid loop() {}\n')
  return { root, projectPath, firmwarePath }
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('arduinoCliCandidates', () => {
  it('prefers an explicit path and packaged tool', () => {
    expect(
      arduinoCliCandidates({
        envPath: '/custom/arduino-cli',
        packaged: true,
        resourcesPath: '/app/resources',
        appPath: '/repo/electron',
        platform: 'darwin'
      }).slice(0, 3)
    ).toEqual([
      '/custom/arduino-cli',
      path.join('/app/resources', 'hardware-sim', 'arduino-cli'),
      path.join('/repo', '.tools', 'arduino-cli', 'arduino-cli')
    ])
  })
})

describe('compileArduinoFirmware', () => {
  it('publishes one deterministic hex and structured build result', async () => {
    const files = fixture()
    const calls: string[][] = []
    const runner: HardwareCommandRunner = async (_executable, args) => {
      calls.push(args)
      if (args[0] === 'version') {
        return {
          exitCode: 0,
          stdout: JSON.stringify({ VersionString: 'arduino-cli 1.5.1' }),
          stderr: ''
        }
      }
      const outputDir = args[args.indexOf('--output-dir') + 1]
      writeFileSync(path.join(outputDir, 'blink.ino.hex'), ':00000001FF\n')
      return {
        exitCode: 0,
        stdout: JSON.stringify({ success: true, compiler_out: 'Sketch uses 444 bytes.' }),
        stderr: ''
      }
    }

    const result = await compileArduinoFirmware({
      ...files,
      cliPath: '/tools/arduino-cli',
      runner,
      now: () => new Date('2026-09-03T08:00:00.000Z')
    })

    expect(result.ok).toBe(true)
    expect(result.source).toBe('firmware/blink/blink.ino')
    expect(result.version).toBe('arduino-cli 1.5.1')
    expect(result.hexPath).toBe(path.join(files.root, 'build', 'hardware-sim', 'firmware.hex'))
    expect(result.hexSha256).toMatch(/^[a-f0-9]{64}$/)
    expect(calls[1]).toContain('arduino:avr:uno')
    expect(calls[1].at(-1)).toBe(path.dirname(files.firmwarePath))

    const recorded = JSON.parse(
      readFileSync(path.join(files.root, 'build', 'hardware-sim', 'build-result.json'), 'utf8')
    ) as typeof result
    expect(recorded).toEqual(result)
    expect(readFileSync(result.hexPath!, 'utf8')).toBe(':00000001FF\n')
  })

  it('records compiler diagnostics without publishing a stale hex', async () => {
    const files = fixture()
    const runner: HardwareCommandRunner = async (_executable, args) => {
      if (args[0] === 'version') {
        return { exitCode: 0, stdout: '{}', stderr: '' }
      }
      return {
        exitCode: 1,
        stdout: JSON.stringify({
          success: false,
          compiler_err: "blink.ino:2:3: error: expected ';'"
        }),
        stderr: ''
      }
    }

    const result = await compileArduinoFirmware({
      ...files,
      cliPath: '/tools/arduino-cli',
      runner
    })

    expect(result.ok).toBe(false)
    expect(result.diagnostics).toContain("blink.ino:2:3: error: expected ';'")
    expect(result.hexPath).toBeUndefined()
    expect(() =>
      readFileSync(path.join(files.root, 'build', 'hardware-sim', 'firmware.hex'))
    ).toThrow()
  })

  it('turns a missing CLI into an agent-readable build result', async () => {
    const files = fixture()
    const runner: HardwareCommandRunner = async () => {
      throw Object.assign(new Error('spawn arduino-cli ENOENT'), { code: 'ENOENT' })
    }

    const result = await compileArduinoFirmware({
      ...files,
      cliPath: 'arduino-cli',
      runner
    })

    expect(result.ok).toBe(false)
    expect(result.diagnostics[0]).toContain('ENOENT')
    expect(
      readFileSync(path.join(files.root, 'build', 'hardware-sim', 'build-result.json'), 'utf8')
    ).toContain('spawn arduino-cli ENOENT')
  })
})
