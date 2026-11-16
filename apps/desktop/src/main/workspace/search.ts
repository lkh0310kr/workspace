import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync } from 'node:fs'
import * as path from 'node:path'
import { rgPath } from '@vscode/ripgrep'

// Find-in-Files / Quick Open backend — spawns the same rg binary VSCode
// bundles and drives the same way (ref-proj/vscode's
// ripgrepTextSearchEngine.ts: cp.spawn(rgPath, args, { cwd }), parse --json
// newline-delimited stdout), rather than reimplementing a slower/weaker
// pure-JS recursive grep that ignores .gitignore.

export interface SearchMatchRange {
  start: number
  end: number
}

export interface SearchMatch {
  lineNumber: number
  lineText: string
  ranges: SearchMatchRange[]
}

export interface SearchFileResult {
  path: string
  matches: SearchMatch[]
}

/** ripgrep reports UTF-8 byte offsets; renderer string slicing uses UTF-16 indexes. */
function utf8RangesToUtf16(
  text: string,
  ranges: readonly { start: number; end: number }[]
): { start: number; end: number }[] {
  const offsets = ranges
    .flatMap((range, rangeIndex) => [
      { byte: range.start, rangeIndex, edge: 'start' as const },
      { byte: range.end, rangeIndex, edge: 'end' as const }
    ])
    .sort((a, b) => a.byte - b.byte)
  const converted: { start: number; end: number }[] = ranges.map(() => ({ start: 0, end: 0 }))
  let bytes = 0
  let utf16 = 0
  let offsetIndex = 0
  for (const character of text) {
    while (offsetIndex < offsets.length && offsets[offsetIndex].byte <= bytes) {
      const offset = offsets[offsetIndex++]
      converted[offset.rangeIndex][offset.edge] = utf16
    }
    bytes += Buffer.byteLength(character, 'utf8')
    utf16 += character.length
  }
  while (offsetIndex < offsets.length) {
    const offset = offsets[offsetIndex++]
    converted[offset.rangeIndex][offset.edge] = utf16
  }
  return converted
}

export interface SearchOptions {
  caseSensitive?: boolean
  regex?: boolean
  wholeWord?: boolean
  includeHidden?: boolean
}

type RipgrepJsonEvent =
  | {
      type: 'match'
      data: {
        path: { text: string }
        lines: { text: string }
        line_number: number
        submatches: { start: number; end: number }[]
      }
    }
  | { type: 'begin' | 'end'; data: { path: { text: string } } }
  | { type: 'summary' | 'context'; data: unknown }

function parseRipgrepFileEventPath(line: string, root: string): string | null {
  if (!line) return null
  try {
    const event = JSON.parse(line) as RipgrepJsonEvent
    if (event.type !== 'begin' && event.type !== 'end') return null
    const absolutePath = path.resolve(root, event.data.path.text)
    return path.relative(root, absolutePath)
  } catch {
    return null
  }
}

/** Parses one line of `rg --json` output into a file-relative match, or
 * null for event types this feature doesn't need (begin/end/summary) or a
 * line that isn't valid JSON (rg can interleave stderr-ish diagnostics on
 * rare malformed input — skip rather than crash the whole stream). Pure and
 * independently testable — no process spawn needed to exercise it. */
export function parseRipgrepMatchLine(
  line: string,
  root: string
): { path: string; match: SearchMatch } | null {
  if (!line) return null
  let event: RipgrepJsonEvent
  try {
    event = JSON.parse(line)
  } catch {
    return null
  }
  if (event.type !== 'match') return null
  // `rg --json` emits root-relative paths by default (for example
  // `./src/file.ts`). Resolve those against the scanned workspace, not the
  // Electron process cwd, which can differ when the app is launched from Finder.
  const absolutePath = path.resolve(root, event.data.path.text)
  const relPath = path.relative(root, absolutePath)
  const lineText = event.data.lines.text.replace(/\r?\n$/, '')
  const ranges = utf8RangesToUtf16(lineText, event.data.submatches)
  return {
    path: relPath,
    match: {
      lineNumber: event.data.line_number,
      lineText,
      ranges
    }
  }
}

function buildSearchArgs(query: string, opts: SearchOptions): string[] {
  const args = ['--json', '--line-number', '--column']
  args.push(opts.caseSensitive ? '--case-sensitive' : '--ignore-case')
  if (opts.wholeWord) args.push('--word-regexp')
  if (!opts.regex) args.push('--fixed-strings')
  if (opts.includeHidden) args.push('--hidden')
  args.push('--', query, '.')
  return args
}

export interface ActiveSearch {
  cancel: () => void
}

/** Resolve an Electron asar virtual path to the real unpacked binary path. */
export function resolveSearchBinaryPath(
  binaryPath = rgPath,
  exists: (candidate: string) => boolean = existsSync
): string {
  const unpackedPath = binaryPath.replace(/\.asar(?=[/\\])/, '.asar.unpacked')
  return unpackedPath !== binaryPath && exists(unpackedPath) ? unpackedPath : binaryPath
}

/**
 * Streams completed files as ripgrep finds them. A file is sent once with its
 * complete match list, avoiding repeated IPC serialization of cumulative data.
 */
export function searchInFiles(
  root: string,
  query: string,
  opts: SearchOptions,
  onFile: (result: SearchFileResult) => void,
  onDone: (error?: string) => void
): ActiveSearch {
  let proc: ChildProcessWithoutNullStreams
  try {
    proc = spawn(resolveSearchBinaryPath(), buildSearchArgs(query, opts), { cwd: root })
  } catch (error) {
    onDone(error instanceof Error ? error.message : String(error))
    return { cancel: () => {} }
  }
  let buffer = ''
  const byFile = new Map<string, SearchFileResult>()
  let stderr = ''

  const flushFile = (filePath: string) => {
    const entry = byFile.get(filePath)
    if (!entry) return
    byFile.delete(filePath)
    onFile(entry)
  }

  proc.stdout.on('data', (chunk: Buffer) => {
    buffer += chunk.toString('utf8')
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      const parsed = parseRipgrepMatchLine(line, root)
      if (parsed) {
        let entry = byFile.get(parsed.path)
        if (!entry) {
          entry = { path: parsed.path, matches: [] }
          byFile.set(parsed.path, entry)
        }
        entry.matches.push(parsed.match)
        continue
      }
      const filePath = parseRipgrepFileEventPath(line, root)
      if (filePath !== null) flushFile(filePath)
    }
  })
  proc.stderr.on('data', (chunk: Buffer) => {
    stderr += chunk.toString('utf8')
  })
  proc.on('error', (err) => onDone(String(err)))
  proc.on('close', (code) => {
    for (const filePath of byFile.keys()) flushFile(filePath)
    // Why: rg exits 1 for "no matches" (not an error — an empty result set)
    // and 2 for a real failure (bad regex, unreadable root, etc).
    if (code === 2) onDone(stderr.trim() || `ripgrep exited with code ${code}`)
    else onDone()
  })

  return {
    cancel: () => {
      proc.kill()
    }
  }
}

/** All files under root respecting .gitignore, via `rg --files` (plain
 * newline-delimited paths — not the --json content-search mode). Backs
 * Quick Open as well as Find-in-Files' own default search scope. */
export function listAllFiles(root: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const proc = spawn(rgPath, ['--files'], { cwd: root })
    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8')
    })
    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8')
    })
    proc.on('error', reject)
    proc.on('close', (code) => {
      if (code === 2) {
        reject(new Error(stderr.trim() || `ripgrep exited with code ${code}`))
        return
      }
      resolve(stdout.split('\n').filter(Boolean))
    })
  })
}
