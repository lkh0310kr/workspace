import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import * as path from 'node:path'
import { app } from 'electron'
import type { HardwareBuildResult } from '../../shared/hardwareSim'

type CommandResult = {
  exitCode: number | null
  stdout: string
  stderr: string
}

export type HardwareCommandRunner = (
  executable: string,
  args: string[],
  options: { cwd: string; timeoutMs: number }
) => Promise<CommandResult>

export interface ArduinoCompileOptions {
  projectPath: string
  firmwarePath: string
  fqbn?: string
  cliPath?: string
  timeoutMs?: number
  runner?: HardwareCommandRunner
  now?: () => Date
}

function appPath(): string {
  try {
    return app.getAppPath()
  } catch {
    return ''
  }
}

function isPackaged(): boolean {
  try {
    return app.isPackaged
  } catch {
    return false
  }
}

export function arduinoCliCandidates(
  options: {
    appPath?: string
    packaged?: boolean
    resourcesPath?: string
    platform?: NodeJS.Platform
    envPath?: string
  } = {}
): string[] {
  const executable =
    (options.platform ?? process.platform) === 'win32' ? 'arduino-cli.exe' : 'arduino-cli'
  const candidates: string[] = []
  if (options.envPath) candidates.push(options.envPath)
  if (options.packaged ?? isPackaged()) {
    const resources = options.resourcesPath ?? process.resourcesPath
    if (resources) candidates.push(path.join(resources, 'hardware-sim', executable))
  }
  const electronAppPath = options.appPath ?? appPath()
  if (electronAppPath) {
    candidates.push(path.resolve(electronAppPath, '..', '.tools', 'arduino-cli', executable))
  }
  candidates.push(executable)
  return candidates
}

export function resolveArduinoCli(): string {
  const candidates = arduinoCliCandidates({ envPath: process.env.ARDUINO_CLI_PATH })
  return (
    candidates.find(
      (candidate) => candidate === path.basename(candidate) || existsSync(candidate)
    ) ?? 'arduino-cli'
  )
}

export async function runHardwareCommand(
  executable: string,
  args: string[],
  options: { cwd: string; timeoutMs: number }
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: options.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error(`${path.basename(executable)} timed out after ${options.timeoutMs}ms`))
    }, options.timeoutMs)
    child.stdout.on('data', (chunk: Buffer) => {
      stdout = (stdout + chunk.toString('utf8')).slice(-1_000_000)
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = (stderr + chunk.toString('utf8')).slice(-1_000_000)
    })
    child.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.once('exit', (exitCode) => {
      clearTimeout(timer)
      resolve({ exitCode, stdout, stderr })
    })
  })
}

function writeJsonAtomic(filePath: string, value: unknown): void {
  mkdirSync(path.dirname(filePath), { recursive: true })
  const temporary = `${filePath}.tmp-${process.pid}-${Date.now()}`
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  try {
    renameSync(temporary, filePath)
  } catch {
    rmSync(filePath, { force: true })
    renameSync(temporary, filePath)
  }
}

function parseJsonRecord(text: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(text) as unknown
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

function diagnosticLines(...values: unknown[]): string[] {
  const lines = values
    .filter((value): value is string => typeof value === 'string')
    .flatMap((value) => value.split(/\r?\n/))
    .map((line) => line.trim())
    .filter(Boolean)
  return [...new Set(lines)].slice(-200)
}

function findCompiledHex(outputDir: string): string | null {
  if (!existsSync(outputDir)) return null
  const candidates = readdirSync(outputDir)
    .filter((name) => name.endsWith('.hex') && !name.includes('with_bootloader'))
    .sort()
  return candidates.length === 1 ? path.join(outputDir, candidates[0]) : null
}

function sha256(filePath: string): string {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex')
}

export async function compileArduinoFirmware(
  options: ArduinoCompileOptions
): Promise<HardwareBuildResult> {
  const startedAt = Date.now()
  const now = options.now ?? (() => new Date())
  const fqbn = options.fqbn ?? 'arduino:avr:uno'
  const projectDir = path.dirname(options.projectPath)
  const firmwarePath = path.resolve(options.firmwarePath)
  const relativeFirmware = path.relative(projectDir, firmwarePath)
  const buildDir = path.join(projectDir, 'build', 'hardware-sim')
  const resultPath = path.join(buildDir, 'build-result.json')
  const cliPath = options.cliPath ?? resolveArduinoCli()
  const runner = options.runner ?? runHardwareCommand
  const timeoutMs = options.timeoutMs ?? 120_000
  const temporaryOutput = path.join(buildDir, `.compile-${process.pid}-${startedAt}`)
  const publishedHex = path.join(buildDir, 'firmware.hex')

  const base = () => ({
    source: relativeFirmware.replace(/\\/g, '/'),
    fqbn,
    tool: 'arduino-cli' as const,
    toolPath: cliPath,
    completedAt: now().toISOString()
  })

  let result: HardwareBuildResult
  try {
    if (relativeFirmware.startsWith('..') || path.isAbsolute(relativeFirmware)) {
      throw new Error('firmware path escapes the hardware project directory')
    }
    if (!existsSync(firmwarePath)) {
      throw new Error(`firmware source not found: ${relativeFirmware}`)
    }
    mkdirSync(temporaryOutput, { recursive: true })
    const versionOutput = await runner(cliPath, ['version', '--format', 'json'], {
      cwd: projectDir,
      timeoutMs: Math.min(timeoutMs, 10_000)
    }).catch(() => null)
    const versionJson = versionOutput ? parseJsonRecord(versionOutput.stdout) : null
    const version =
      typeof versionJson?.VersionString === 'string'
        ? versionJson.VersionString
        : typeof versionJson?.version === 'string'
          ? versionJson.version
          : null
    const command = [
      'compile',
      '--fqbn',
      fqbn,
      '--output-dir',
      temporaryOutput,
      '--format',
      'json',
      path.dirname(firmwarePath)
    ]
    const output = await runner(cliPath, command, { cwd: projectDir, timeoutMs })
    const parsed = parseJsonRecord(output.stdout)
    const diagnostics = diagnosticLines(
      parsed?.compiler_err,
      parsed?.compiler_out,
      output.stderr,
      parsed ? undefined : output.stdout
    )
    const compiledHex = output.exitCode === 0 ? findCompiledHex(temporaryOutput) : null
    if (output.exitCode !== 0 || !compiledHex) {
      const reason =
        output.exitCode !== 0
          ? `arduino-cli exited with code ${output.exitCode ?? 'unknown'}`
          : 'arduino-cli did not produce exactly one firmware hex'
      result = {
        ...base(),
        ok: false,
        version,
        durationMs: Date.now() - startedAt,
        diagnostics: diagnostics.length ? diagnostics : [reason]
      }
    } else {
      mkdirSync(buildDir, { recursive: true })
      const temporaryHex = `${publishedHex}.tmp-${process.pid}-${startedAt}`
      writeFileSync(temporaryHex, readFileSync(compiledHex))
      try {
        renameSync(temporaryHex, publishedHex)
      } catch {
        rmSync(publishedHex, { force: true })
        renameSync(temporaryHex, publishedHex)
      }
      result = {
        ...base(),
        ok: true,
        version,
        durationMs: Date.now() - startedAt,
        diagnostics,
        hexPath: publishedHex,
        hexSha256: sha256(publishedHex)
      }
    }
  } catch (error) {
    result = {
      ...base(),
      ok: false,
      version: null,
      durationMs: Date.now() - startedAt,
      diagnostics: [error instanceof Error ? error.message : String(error)]
    }
  } finally {
    rmSync(temporaryOutput, { recursive: true, force: true })
  }

  writeJsonAtomic(resultPath, result)
  return result
}
