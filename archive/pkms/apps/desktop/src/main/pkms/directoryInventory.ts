import { promises as fs, type BigIntStats, type Dirent } from 'node:fs'
import path from 'node:path'

export type DirectoryInventoryIO = {
  readdir: (directory: string) => Promise<Dirent[]>
  lstat: (target: string) => Promise<BigIntStats>
}

export type LocalDirectoryInventory = {
  directories: Record<string, string | null>
  protectedPaths: string[]
}

const defaultIO: DirectoryInventoryIO = {
  readdir: (directory) => fs.readdir(directory, { withFileTypes: true }),
  lstat: (target) => fs.lstat(target, { bigint: true })
}

export function matchesExclusion(relative: string, patterns: string[]): boolean {
  return patterns.some((raw) => {
    const pattern = raw.trim().replaceAll('\\', '/').replace(/\/$/, '')
    if (!pattern) return false
    if (pattern.endsWith('/**') && relative === pattern.slice(0, -3)) return true
    let source = ''
    for (let index = 0; index < pattern.length; index++) {
      const char = pattern[index]
      if (char === '*' && pattern[index + 1] === '*' && pattern[index + 2] === '/') {
        source += '(?:.*/)?'
        index += 2
      } else if (char === '*' && pattern[index + 1] === '*') {
        source += '.*'
        index++
      } else if (char === '*') source += '[^/]*'
      else if (char === '?') source += '[^/]'
      else source += /[\\^$+?.()|{}\[\]]/.test(char) ? `\\${char}` : char
    }
    try {
      return new RegExp(`^${source}(?:/.*)?$`).test(relative)
    } catch {
      return false
    }
  })
}

/** Return a complete recursive inventory, or reject without exposing a partial result. */
export async function localDirectoryInventory(
  root: string,
  excludedPaths: string[],
  io: DirectoryInventoryIO = defaultIO
): Promise<LocalDirectoryInventory> {
  const directories: Record<string, string | null> = {}
  const protectedPaths: string[] = []
  const visit = async (directory: string, prefix: string): Promise<void> => {
    const entries = await io.readdir(directory)
    for (const entry of entries) {
      if (entry.isSymbolicLink()) {
        const relative = path.posix.join(prefix, entry.name)
        if (!matchesExclusion(relative, excludedPaths)) protectedPaths.push(relative)
        continue
      }
      if (['.git', '.obsidian', 'node_modules'].includes(entry.name)) continue
      const relative = path.posix.join(prefix, entry.name)
      if (matchesExclusion(relative, excludedPaths)) continue
      if (!entry.isDirectory()) continue
      const absolute = path.join(directory, entry.name)
      const stat = await io.lstat(absolute)
      if (stat.isSymbolicLink() || !stat.isDirectory()) continue
      directories[relative] = `${stat.dev}:${stat.ino}`
      await visit(absolute, relative)
    }
  }
  const rootStat = await io.lstat(root)
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) throw new Error('sync_root_unavailable')
  await visit(root, '')
  return { directories, protectedPaths }
}

export function pathIsProtectedByInventory(
  relative: string,
  protectedPaths: Iterable<string>
): boolean {
  for (const protectedPath of protectedPaths) {
    if (relative === protectedPath || relative.startsWith(`${protectedPath}/`)) return true
  }
  return false
}

export function missingLocalDirectories(
  previous: Record<string, string | null>,
  current: LocalDirectoryInventory
): string[] {
  return Object.keys(previous).filter(
    (relative) =>
      !Object.hasOwn(current.directories, relative) &&
      !pathIsProtectedByInventory(relative, current.protectedPaths)
  )
}

export function preserveProtectedDirectoryIdentities(
  previous: Record<string, string | null>,
  current: LocalDirectoryInventory
): Record<string, string | null> {
  return {
    ...current.directories,
    ...Object.fromEntries(
      Object.entries(previous).filter(([relative]) =>
        pathIsProtectedByInventory(relative, current.protectedPaths)
      )
    )
  }
}
