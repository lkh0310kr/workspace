import { app, BrowserWindow } from 'electron'
import { randomUUID, createHash } from 'node:crypto'
import { promises as fs, watch, type FSWatcher } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import * as Y from 'yjs'
import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js'
import { requestPkmsApi } from './api'
import { appendStartupLog, isPackagedApp } from '../startupLog'
import type { PkmsSyncBridgeStatus, PkmsSyncItemState } from '../../shared/pkmsSyncBridge'
import {
  folderPathsToReconcile,
  nextGuardedFolderDeleteRevision,
  remoteChangedSinceBaseline,
  resetRootScopedState
} from './syncPolicy'

type BridgeFile = {
  id: string
  path: string
  kind: string
  revision: number
  size?: number
  sha?: string | null
  localHash?: string
}
type BridgeSnapshotPage = {
  revision: number
  files: BridgeFile[]
  hasMore: boolean
  nextPath: string
}
type BridgeChange = BridgeFile & { deleted: boolean }
type Baseline = { fileId: string; hash: string; revision: number }
type PendingDelete = {
  kind: 'markdown' | 'folder'
  path: string
  fileId: string
  operationId: string
  baseRevision: number
  expectedItemRevision?: number
  firstObservedAt: number
  attempts: number
}
type Persisted = {
  configs: Record<string, { folderPath: string; excludedPaths: string[] }>
  baselines: Record<string, Record<string, Baseline>>
  remoteFiles: Record<string, Record<string, BridgeFile>>
  syncCursors: Record<string, number>
  remoteTrees: Record<string, BridgeFile[]>
  remoteTreeVersions: Record<string, number>
  pendingFullScans: Record<string, boolean>
  pendingPaths: Record<string, string[]>
  pendingUpdates: Record<
    string,
    Record<string, { operationId: string; targetHash: string; update: string }>
  >
  pendingCreates: Record<
    string,
    Record<string, { operationId: string; fileId: string; contentHash: string; content: string }>
  >
  pendingFolderCreates: Record<string, Record<string, string>>
  localDirectories: Record<string, Record<string, string | null>>
  pendingDeletes: Record<string, Record<string, PendingDelete>>
}
const EMPTY: Persisted = {
  configs: {},
  baselines: {},
  remoteFiles: {},
  syncCursors: {},
  remoteTrees: {},
  remoteTreeVersions: {},
  pendingFullScans: {},
  pendingPaths: {},
  pendingUpdates: {},
  pendingCreates: {},
  pendingFolderCreates: {},
  localDirectories: {},
  pendingDeletes: {}
}
// Poll the cloud's revision feed frequently; full disk walks are a recovery path.
// The revision feed is metadata-only; poll it frequently so edits from web/iOS
// reach the local source of truth promptly. Full disk walks remain a recovery
// path because native watcher events cover normal local edits.
const REMOTE_CHANGE_POLL_INTERVAL_MS = 5_000
const FULL_LOCAL_SCAN_INTERVAL_MS = 15 * 60_000
const timers = new Map<string, ReturnType<typeof setTimeout>>()
const retryTimers = new Map<string, ReturnType<typeof setTimeout>>()
const retryAttempts = new Map<string, number>()
const pollers = new Map<string, ReturnType<typeof setInterval>>()
const realtimeChannels = new Map<
  string,
  { client: SupabaseClient; channel: RealtimeChannel; tokenTimer: ReturnType<typeof setInterval> }
>()
const fullScanners = new Map<string, ReturnType<typeof setInterval>>()
const watchers = new Map<string, FSWatcher>()
const statuses = new Map<string, PkmsSyncBridgeStatus>()
const running = new Map<string, Promise<void>>()
const folderLocks = new Map<string, FolderSyncLock>()
const starting = new Set<string>()
const fullScanRequests = new Set<string>()
const directoryScanRequests = new Set<string>()
const dirtyLocalPaths = new Map<string, Set<string>>()
let persisted: Persisted | null = null

type FolderSyncLock = { path: string; token: string }

function notifyLocalTreeChanged(workspaceId: string, relativePath: string | null): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed())
      window.webContents.send('pkms:local-tree:changed', { workspaceId, path: relativePath })
  }
}

function folderSyncLockPath(root: string): string {
  const key = createHash('sha256').update(path.resolve(root)).digest('hex')
  return path.join(tmpdir(), 'workspace-pkms-sync-locks', `${key}.lock`)
}
function processIsRunning(pid: number): boolean {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}
async function acquireFolderSyncLock(root: string, workspaceId: string): Promise<FolderSyncLock> {
  const lockPath = folderSyncLockPath(root)
  await fs.mkdir(path.dirname(lockPath), { recursive: true, mode: 0o700 })
  for (let attempt = 0; attempt < 3; attempt++) {
    const token = randomUUID()
    try {
      const handle = await fs.open(lockPath, 'wx', 0o600)
      try {
        await handle.writeFile(
          JSON.stringify({ pid: process.pid, workspaceId, token, startedAt: Date.now() })
        )
        await handle.sync()
      } catch (writeError) {
        await fs.unlink(lockPath).catch(() => {})
        throw writeError
      } finally {
        await handle.close()
      }
      return { path: lockPath, token }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      let owner: { pid?: number; token?: string } | null = null
      try {
        owner = JSON.parse(await fs.readFile(lockPath, 'utf8')) as { pid?: number; token?: string }
      } catch {
        /* A process may have exited while creating the lock. */
      }
      if (owner && processIsRunning(owner.pid ?? 0)) throw new Error('editing_folder_in_use')
      if (!owner) {
        try {
          const stat = await fs.stat(lockPath)
          if (Date.now() - stat.mtimeMs < 120_000) throw new Error('editing_folder_in_use')
        } catch (statError) {
          if ((statError as NodeJS.ErrnoException).code === 'ENOENT') continue
          throw statError
        }
      }
      try {
        await fs.unlink(lockPath)
      } catch (unlinkError) {
        if ((unlinkError as NodeJS.ErrnoException).code !== 'ENOENT') throw unlinkError
      }
    }
  }
  throw new Error('editing_folder_in_use')
}
async function releaseFolderSyncLock(lock: FolderSyncLock): Promise<void> {
  try {
    const owner = JSON.parse(await fs.readFile(lock.path, 'utf8')) as { token?: string }
    if (owner.token === lock.token) await fs.unlink(lock.path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
}

function statePath(): string {
  return path.join(app.getPath('userData'), 'pkms-sync-bridge.json')
}
async function load(): Promise<Persisted> {
  if (persisted) return persisted
  try {
    const saved = JSON.parse(await fs.readFile(statePath(), 'utf8')) as Partial<Persisted>
    persisted = {
      ...EMPTY,
      ...saved,
      remoteFiles: saved.remoteFiles ?? {},
      syncCursors: saved.syncCursors ?? {},
      remoteTrees: saved.remoteTrees ?? {},
      remoteTreeVersions: saved.remoteTreeVersions ?? {},
      pendingFullScans: saved.pendingFullScans ?? {},
      pendingPaths: saved.pendingPaths ?? {},
      pendingUpdates: saved.pendingUpdates ?? {},
      pendingCreates: saved.pendingCreates ?? {},
      pendingFolderCreates: saved.pendingFolderCreates ?? {},
      localDirectories: saved.localDirectories ?? {},
      pendingDeletes: saved.pendingDeletes ?? {}
    }
  } catch {
    persisted = structuredClone(EMPTY)
  }
  return persisted
}
async function save(): Promise<void> {
  const state = await load()
  await fs.mkdir(path.dirname(statePath()), { recursive: true })
  const temp = `${statePath()}.${randomUUID()}.tmp`
  await fs.writeFile(temp, JSON.stringify(state), { mode: 0o600 })
  await fs.rename(temp, statePath())
}
function hash(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}
function gitBlobHash(content: string): string {
  const bytes = Buffer.from(content, 'utf8')
  return createHash('sha1').update(`blob ${bytes.byteLength}\0`).update(bytes).digest('hex')
}
function safePath(root: string, relative: string): string {
  const target = path.resolve(root, relative)
  if (target !== root && !target.startsWith(`${root}${path.sep}`))
    throw new Error('invalid_sync_path')
  return target
}
async function assertSafeParentDirectories(root: string, relative: string): Promise<void> {
  let current = root
  for (const part of path.posix
    .dirname(relative)
    .split('/')
    .filter((item) => item && item !== '.')) {
    current = path.join(current, part)
    const stat = await fs.lstat(current)
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('unsafe_local_path')
  }
}
async function localPathIsAbsent(root: string, relative: string): Promise<boolean> {
  try {
    await assertSafeParentDirectories(root, relative)
    await fs.lstat(safePath(root, relative))
    return false
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return true
    throw error
  }
}
async function assertDestinationFree(root: string, relative: string): Promise<void> {
  try {
    await fs.lstat(safePath(root, relative))
    throw new Error('local_destination_exists')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
}
export async function getPkmsLocalFolder(workspaceId: string): Promise<string | null> {
  return (await load()).configs[workspaceId]?.folderPath ?? null
}
function localFileId(relative: string): string {
  return `local-${Buffer.from(relative).toString('base64url')}`
}
function localPathFromId(id: string): string | null {
  if (!id.startsWith('local-')) return null
  try {
    return Buffer.from(id.slice(6), 'base64url').toString('utf8')
  } catch {
    return null
  }
}
export async function listPkmsLocalDirectory(
  workspaceId: string,
  relativeDirectory: string
): Promise<Array<{ id: string; path: string; kind: 'markdown' | 'folder'; revision: number }>> {
  const root = await getPkmsLocalFolder(workspaceId)
  if (!root) throw new Error('local_folder_not_connected')
  const rootStat = await fs.lstat(root)
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) throw new Error('unsafe_local_path')
  const directory = relativeDirectory ? safePath(root, relativeDirectory) : root
  let directoryStat = rootStat
  if (relativeDirectory) {
    try {
      await assertSafeParentDirectories(root, path.posix.join(relativeDirectory, '_'))
      directoryStat = await fs.lstat(directory)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw error
    }
  }
  if (directoryStat.isSymbolicLink() || !directoryStat.isDirectory())
    throw new Error('unsafe_local_path')
  const entries = await fs.readdir(directory, { withFileTypes: true })
  const output: Array<{ id: string; path: string; kind: 'markdown' | 'folder'; revision: number }> =
    []
  const excludedPaths = (await load()).configs[workspaceId]?.excludedPaths ?? []
  for (const entry of entries) {
    if (entry.isSymbolicLink() || ['.git', '.obsidian', 'node_modules'].includes(entry.name))
      continue
    const relative = path.posix.join(relativeDirectory, entry.name)
    const kind = entry.isDirectory()
      ? 'folder'
      : entry.isFile() && entry.name.toLowerCase().endsWith('.md')
        ? 'markdown'
        : null
    if (!kind || matchesExclusion(relative, excludedPaths)) continue
    output.push({ id: localFileId(relative), path: relative, kind, revision: 0 })
  }
  return output.sort((a, b) =>
    a.kind === b.kind ? a.path.localeCompare(b.path) : a.kind === 'folder' ? -1 : 1
  )
}
export async function getPkmsLocalFile(
  workspaceId: string,
  id: string
): Promise<{ id: string; path: string; kind: 'markdown' | 'folder'; revision: number } | null> {
  const relative = localPathFromId(id)
  if (!relative || isReservedSyncPath(relative)) return null
  const root = await getPkmsLocalFolder(workspaceId)
  if (!root) throw new Error('local_folder_not_connected')
  try {
    await assertSafeParentDirectories(root, relative)
    const stat = await fs.lstat(safePath(root, relative))
    if (
      stat.isSymbolicLink() ||
      (!stat.isDirectory() && !(stat.isFile() && relative.toLowerCase().endsWith('.md')))
    )
      return null
    return { id, path: relative, kind: stat.isDirectory() ? 'folder' : 'markdown', revision: 0 }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}
export async function resolvePkmsLocalItemAbsolutePath(
  workspaceId: string,
  relativePath: string
): Promise<{ path: string; kind: 'file' | 'folder' }> {
  let root = await getPkmsLocalFolder(workspaceId)
  if (!root && !isPackagedApp()) {
    const userData = app.getPath('userData')
    const profileName = path.basename(userData)
    const stableProfileName = profileName.endsWith('-dev')
      ? profileName.slice(0, -4)
      : 'workspace-app'
    try {
      const stableState = JSON.parse(
        await fs.readFile(
          path.join(path.dirname(userData), stableProfileName, 'pkms-sync-bridge.json'),
          'utf8'
        )
      ) as Partial<Persisted>
      root = stableState.configs?.[workspaceId]?.folderPath ?? null
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT' && !(error instanceof SyntaxError))
        throw error
    }
  }
  if (!root) throw new Error('local_folder_not_connected')
  if (
    !relativePath ||
    relativePath.startsWith('/') ||
    relativePath.split('/').some((part) => !part || part === '.' || part === '..') ||
    isReservedSyncPath(relativePath)
  )
    throw new Error('invalid_sync_path')
  const rootStat = await fs.lstat(root)
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) throw new Error('unsafe_local_path')
  await assertSafeParentDirectories(root, relativePath)
  const itemPath = safePath(root, relativePath)
  try {
    const itemStat = await fs.lstat(itemPath)
    if (itemStat.isSymbolicLink() || (!itemStat.isDirectory() && !itemStat.isFile()))
      throw new Error('unsafe_local_path')
    return { path: itemPath, kind: itemStat.isDirectory() ? 'folder' : 'file' }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new Error('local_item_not_found')
    throw error
  }
}
function validateLocalName(name: string): void {
  if (
    !name.trim() ||
    name === '.' ||
    name === '..' ||
    /[\\/:\0]/.test(name) ||
    name.startsWith('.')
  )
    throw new Error('invalid_local_name')
}
export async function createPkmsLocalItem(
  workspaceId: string,
  parent: string,
  kind: 'markdown' | 'folder',
  name: string
) {
  validateLocalName(name)
  if (kind === 'markdown' && !name.toLowerCase().endsWith('.md'))
    throw new Error('markdown_extension_required')
  const root = await getPkmsLocalFolder(workspaceId)
  if (!root) throw new Error('local_folder_not_connected')
  const relative = path.posix.join(parent, name)
  if (matchesExclusion(relative, (await load()).configs[workspaceId]?.excludedPaths ?? []))
    throw new Error('path_is_excluded')
  const target = safePath(root, relative)
  await assertSafeParentDirectories(root, relative)
  await assertDestinationFree(root, relative)
  if (kind === 'folder') await fs.mkdir(target)
  else await fs.writeFile(target, '', { flag: 'wx' })
  return { id: localFileId(relative), path: relative, kind, revision: 0 }
}
export async function renamePkmsLocalItem(workspaceId: string, id: string, name: string) {
  validateLocalName(name)
  const file = await getPkmsLocalFile(workspaceId, id)
  if (!file) throw new Error('local_file_not_found')
  if (file.kind === 'markdown' && !name.toLowerCase().endsWith('.md'))
    throw new Error('markdown_extension_required')
  const destination = path.posix.join(path.posix.dirname(file.path), name)
  const root = await getPkmsLocalFolder(workspaceId)
  if (!root) throw new Error('local_folder_not_connected')
  await assertSafeParentDirectories(root, destination)
  await assertDestinationFree(root, destination)
  await fs.rename(safePath(root, file.path), safePath(root, destination))
  return { ...file, id: localFileId(destination), path: destination }
}
export async function movePkmsLocalItems(
  workspaceId: string,
  ids: string[],
  destinationDirectory: string,
  overwritePaths: string[] = []
): Promise<
  Array<{
    oldId: string
    file: { id: string; path: string; kind: 'markdown' | 'folder'; revision: number }
  }>
> {
  const root = await getPkmsLocalFolder(workspaceId)
  if (!root) throw new Error('local_folder_not_connected')
  const destination = safePath(root, destinationDirectory || '.')
  if (destinationDirectory)
    await assertSafeParentDirectories(root, path.posix.join(destinationDirectory, '_'))
  const destinationStat = await fs.lstat(destination)
  if (!destinationStat.isDirectory() || destinationStat.isSymbolicLink())
    throw new Error('invalid_local_destination')
  const moves = await Promise.all(
    ids.map(async (id) => {
      const file = await getPkmsLocalFile(workspaceId, id)
      if (!file) throw new Error('local_file_not_found')
      const next = path.posix.join(destinationDirectory, path.posix.basename(file.path))
      if (
        file.kind === 'folder' &&
        (destinationDirectory === file.path || destinationDirectory.startsWith(`${file.path}/`))
      )
        throw new Error('cannot_move_folder_into_itself')
      return {
        oldId: file.id,
        from: safePath(root, file.path),
        to: safePath(root, next),
        file: { id: localFileId(next), path: next, kind: file.kind, revision: 0 as const }
      }
    })
  )
  const destinations = new Set<string>()
  const overwriteTargets = new Set(overwritePaths)
  for (const move of moves) {
    const relative = path.relative(root, move.to).split(path.sep).join('/')
    if (destinations.has(relative)) throw new Error('local_destination_exists')
    destinations.add(relative)
    if (move.from === move.to) continue
    await assertSafeParentDirectories(root, relative)
    try {
      const targetStat = await fs.lstat(move.to)
      if (targetStat.isSymbolicLink()) throw new Error('unsafe_local_path')
      if (!overwriteTargets.has(relative)) throw new Error('local_destination_exists')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }
  for (const move of moves) {
    if (move.from === move.to) continue
    const relative = path.relative(root, move.to).split(path.sep).join('/')
    if (overwriteTargets.has(relative)) await fs.rm(move.to, { recursive: true, force: false })
    await fs.rename(move.from, move.to)
  }
  return moves.map(({ oldId, file }) => ({ oldId, file }))
}
export async function deletePkmsLocalItems(workspaceId: string, ids: string[]): Promise<void> {
  const root = await getPkmsLocalFolder(workspaceId)
  if (!root) throw new Error('local_folder_not_connected')
  const files = await Promise.all(ids.map((id) => getPkmsLocalFile(workspaceId, id)))
  if (files.some((file) => !file)) throw new Error('local_file_not_found')
  for (const file of files)
    await fs.rm(safePath(root, file!.path), { recursive: file!.kind === 'folder', force: false })
}
export async function readPkmsLocalMarkdown(
  workspaceId: string,
  relative: string
): Promise<{ text: string; revision: string }> {
  const root = await getPkmsLocalFolder(workspaceId)
  if (!root) throw new Error('local_folder_not_connected')
  if (!relative.toLowerCase().endsWith('.md') || isReservedSyncPath(relative))
    throw new Error('invalid_local_markdown_path')
  const target = safePath(root, relative)
  await assertSafeParentDirectories(root, relative)
  const stat = await fs.lstat(target)
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('unsafe_local_markdown_path')
  const text = await fs.readFile(target, 'utf8')
  return { text, revision: hash(text) }
}
export async function writePkmsLocalMarkdown(
  workspaceId: string,
  relative: string,
  text: string,
  expectedRevision: string
): Promise<{ revision: string }> {
  const current = await readPkmsLocalMarkdown(workspaceId, relative)
  if (current.revision !== expectedRevision) throw new Error('local_file_changed_conflict')
  const root = await getPkmsLocalFolder(workspaceId)
  if (!root) throw new Error('local_folder_not_connected')
  await writeAtomic(root, relative, text, current.revision)
  return { revision: hash(text) }
}
function status(workspaceId: string): PkmsSyncBridgeStatus {
  return (
    statuses.get(workspaceId) ?? {
      workspaceId,
      enabled: false,
      folderPath: null,
      state: 'disconnected',
      excludedPaths: [],
      progress: null,
      lastScannedAt: null,
      lastSyncedAt: null,
      pendingFiles: 0,
      conflictFiles: [],
      itemStates: {},
      error: null
    }
  )
}
function setStatus(
  workspaceId: string,
  patch: Partial<PkmsSyncBridgeStatus>
): PkmsSyncBridgeStatus {
  const next = { ...status(workspaceId), ...patch }
  statuses.set(workspaceId, next)
  return next
}
function setItemState(
  workspaceId: string,
  relative: string,
  itemState: PkmsSyncItemState | null
): void {
  const itemStates = { ...status(workspaceId).itemStates }
  if (itemState) itemStates[relative] = itemState
  else delete itemStates[relative]
  setStatus(workspaceId, { itemStates })
}

class PkmsBridgeRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string
  ) {
    super(code || `PKMS request failed (${status})`)
  }
}
async function request<T>(pathName: string, method: 'GET' | 'POST', value?: unknown): Promise<T> {
  const response = await requestPkmsApi<T>(pathName, {
    method,
    ...(value === undefined ? {} : { body: { kind: 'json', value: JSON.stringify(value) } })
  })
  if (response.status < 200 || response.status >= 300) {
    const detail =
      response.body && typeof response.body === 'object'
        ? (response.body as { message?: string; error?: string })
        : {}
    throw new PkmsBridgeRequestError(
      response.status,
      detail.error ?? detail.message ?? `PKMS request failed (${response.status})`
    )
  }
  return response.body
}
async function startCloudWakeup(workspaceId: string): Promise<void> {
  stopCloudWakeup(workspaceId)
  try {
    const config = await request<{ url: string; anonKey: string }>('/api/realtime/config', 'GET')
    const initial = await request<{ token: string }>('/api/realtime/token', 'GET')
    let activeToken = initial.token
    const client = createClient(config.url, config.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      accessToken: async () => activeToken
    })
    await client.realtime.setAuth(initial.token)
    const channel = client.channel(`pkms:${workspaceId}`, {
      config: { private: true, broadcast: { self: false } }
    })
    channel.on('broadcast', { event: 'protocol' }, () => schedule(workspaceId))
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') schedule(workspaceId) // cursor catch-up after connect/reconnect
    })
    const tokenTimer = setInterval(() => {
      void request<{ token: string }>('/api/realtime/token', 'GET')
        .then(({ token }) => {
          activeToken = token
          return client.realtime.setAuth(token)
        })
        .catch(() => schedule(workspaceId))
    }, 10 * 60_000)
    realtimeChannels.set(workspaceId, { client, channel, tokenTimer })
  } catch {
    // Revision polling remains the recovery path when realtime auth/network is unavailable.
  }
}
function stopCloudWakeup(workspaceId: string): void {
  const active = realtimeChannels.get(workspaceId)
  if (!active) return
  clearInterval(active.tokenTimer)
  void active.client.removeChannel(active.channel)
  realtimeChannels.delete(workspaceId)
}
function b64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64')
}
function fromB64(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, 'base64'))
}

function matchesExclusion(relative: string, patterns: string[]): boolean {
  return patterns.some((raw) => {
    const pattern = raw.trim().replaceAll('\\', '/').replace(/\/$/, '')
    if (!pattern) return false
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
async function markdownFiles(root: string, excludedPaths: string[]): Promise<Map<string, string>> {
  const paths: string[] = []
  const visit = async (dir: string): Promise<void> => {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isSymbolicLink() || ['.git', '.obsidian', 'node_modules'].includes(entry.name))
        continue
      const absolute = path.join(dir, entry.name)
      if (entry.isDirectory()) await visit(absolute)
      else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
        const relative = path.relative(root, absolute).split(path.sep).join('/')
        if (matchesExclusion(relative, excludedPaths)) continue
        paths.push(relative)
      }
    }
  }
  await visit(root)
  const found = new Map<string, string>()
  let next = 0
  const worker = async () => {
    while (next < paths.length) {
      const relative = paths[next++]
      found.set(relative, await fs.readFile(safePath(root, relative), 'utf8'))
    }
  }
  await Promise.all(Array.from({ length: Math.min(16, paths.length) }, () => worker()))
  return found
}
async function localDirectoryInventory(
  root: string,
  excludedPaths: string[]
): Promise<Record<string, string | null>> {
  const directories: Record<string, string | null> = {}
  const visit = async (directory: string, prefix: string): Promise<void> => {
    const entries = await fs.readdir(directory, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isSymbolicLink() || ['.git', '.obsidian', 'node_modules'].includes(entry.name))
        continue
      const relative = path.posix.join(prefix, entry.name)
      if (matchesExclusion(relative, excludedPaths)) continue
      if (!entry.isDirectory()) continue
      const absolute = path.join(directory, entry.name)
      const stat = await fs.lstat(absolute, { bigint: true })
      if (stat.isSymbolicLink() || !stat.isDirectory()) continue
      directories[relative] = `${stat.dev}:${stat.ino}`
      await visit(absolute, relative)
    }
  }
  const rootStat = await fs.lstat(root)
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) throw new Error('sync_root_unavailable')
  await visit(root, '')
  return directories
}
async function markdownFilesAt(
  root: string,
  relativePaths: Iterable<string>,
  excludedPaths: string[]
): Promise<Map<string, string>> {
  const found = new Map<string, string>()
  const visit = async (directory: string, prefix: string): Promise<void> => {
    const entries = await fs.readdir(directory, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isSymbolicLink() || ['.git', '.obsidian', 'node_modules'].includes(entry.name))
        continue
      const relative = path.posix.join(prefix, entry.name)
      if (matchesExclusion(relative, excludedPaths)) continue
      const absolute = path.join(directory, entry.name)
      if (entry.isDirectory()) await visit(absolute, relative)
      else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md'))
        found.set(relative, await fs.readFile(absolute, 'utf8'))
    }
  }
  for (const relative of relativePaths) {
    if (
      !relative ||
      relative.startsWith('/') ||
      relative.split('/').some((part) => !part || part === '.' || part === '..') ||
      isReservedSyncPath(relative) ||
      matchesExclusion(relative, excludedPaths)
    )
      continue
    const target = safePath(root, relative)
    try {
      await assertSafeParentDirectories(root, relative)
      const stat = await fs.lstat(target)
      if (stat.isSymbolicLink()) continue
      if (stat.isDirectory()) await visit(target, relative)
      else if (stat.isFile() && relative.toLowerCase().endsWith('.md')) {
        found.set(relative, await fs.readFile(target, 'utf8'))
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }
  return found
}
function isReservedSyncPath(relative: string): boolean {
  return relative.split('/').some((part) => ['.git', '.obsidian', 'node_modules'].includes(part))
}
async function writeAtomic(
  root: string,
  relative: string,
  content: string,
  expectedCurrentHash?: string | null
): Promise<void> {
  const target = safePath(root, relative)
  const parentParts = path.posix
    .dirname(relative)
    .split('/')
    .filter((part) => part && part !== '.')
  let current = root
  for (const part of parentParts) {
    current = path.join(current, part)
    try {
      const stat = await fs.lstat(current)
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('unsafe_sync_path')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      await fs.mkdir(current)
    }
  }
  let mode = 0o666
  try {
    const existing = await fs.lstat(target)
    if (existing.isSymbolicLink() || !existing.isFile()) throw new Error('unsafe_sync_path')
    mode = existing.mode & 0o777
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  const temp = `${target}.${randomUUID()}.pkms-tmp`
  await fs.writeFile(temp, content, { encoding: 'utf8', mode })
  try {
    if (expectedCurrentHash !== undefined) {
      let actualHash: string | null = null
      try {
        const currentStat = await fs.lstat(target)
        if (currentStat.isSymbolicLink() || !currentStat.isFile())
          throw new Error('unsafe_sync_path')
        actualHash = hash(await fs.readFile(target, 'utf8'))
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
      if (actualHash !== expectedCurrentHash) throw new Error('local_file_changed_retry')
    }
    await fs.rename(temp, target)
  } catch (error) {
    await fs.rm(temp, { force: true }).catch(() => {})
    throw error
  }
}
async function removeLocalFile(
  root: string,
  relative: string,
  expectedHash?: string
): Promise<void> {
  const target = safePath(root, relative)
  let current = root
  for (const part of path.posix
    .dirname(relative)
    .split('/')
    .filter((item) => item && item !== '.')) {
    current = path.join(current, part)
    try {
      const stat = await fs.lstat(current)
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('unsafe_sync_path')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
      throw error
    }
  }
  try {
    const stat = await fs.lstat(target)
    if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('unsafe_sync_path')
    if (expectedHash !== undefined && hash(await fs.readFile(target, 'utf8')) !== expectedHash)
      throw new Error('local_file_changed_retry')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
    throw error
  }
  await fs.rm(target, { force: true })
}
async function readRemoteText(
  workspaceId: string,
  file: BridgeFile
): Promise<{ text: string; revision: number }> {
  const data = await request<{ update: string; revision: number }>(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/files/${encodeURIComponent(file.id)}/updates`,
    'GET'
  )
  const doc = new Y.Doc({ guid: file.id })
  Y.applyUpdate(doc, fromB64(data.update))
  return { text: doc.getText('markdown').toString(), revision: data.revision }
}
async function readRemoteTexts(
  workspaceId: string,
  files: BridgeFile[],
  onProgress: (completed: number, total: number) => void
): Promise<{
  documents: Map<string, { text: string; revision: number }>
  missingIds: Set<string>
}> {
  const batches: BridgeFile[][] = []
  const batchSize = 32
  for (let index = 0; index < files.length; index += batchSize)
    batches.push(files.slice(index, index + batchSize))
  const documents = new Map<string, { text: string; revision: number }>()
  const missingIds = new Set<string>()
  let nextBatch = 0
  let completed = 0
  let firstError: unknown
  onProgress(0, files.length)
  const worker = async () => {
    while (true) {
      if (firstError !== undefined) return
      const batch = batches[nextBatch++]
      if (!batch) return
      try {
        const result = await request<{
          documents: Array<{
            id: string
            path: string
            revision: number
            text?: string
            error?: string
          }>
        }>(`/api/workspaces/${encodeURIComponent(workspaceId)}/sync/download`, 'POST', {
          fileIds: batch.map((file) => file.id)
        })
        const returnedIds = new Set<string>()
        for (const document of result.documents) {
          returnedIds.add(document.id)
          if (document.error === 'not_found') {
            missingIds.add(document.id)
            onProgress(++completed, files.length)
            continue
          }
          if (document.error || typeof document.text !== 'string')
            throw new Error(`${document.error ?? 'document_load_failed'}:${document.id}`)
          documents.set(document.id, { text: document.text, revision: document.revision })
          onProgress(++completed, files.length)
        }
        // A file can disappear between the manifest read and this batch query.
        // Treat omitted rows like tombstones instead of falling back to one GET
        // per file, which turns a stale manifest into minutes of serial traffic.
        for (const file of batch) {
          if (!returnedIds.has(file.id)) {
            missingIds.add(file.id)
            onProgress(++completed, files.length)
          }
        }
      } catch (error) {
        firstError ??= error
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, batches.length) }, () => worker()))
  if (firstError !== undefined) throw firstError
  return { documents, missingIds }
}
async function readRemoteChanges(
  workspaceId: string,
  afterRevision: number
): Promise<{ changes: BridgeChange[]; nextRevision: number }> {
  const changes: BridgeChange[] = []
  let lastRevision = afterRevision
  let lastFileId = ''
  while (true) {
    const query = new URLSearchParams({
      afterRevision: String(afterRevision),
      lastRevision: String(lastRevision),
      lastFileId
    })
    const page = await request<{
      changes: BridgeChange[]
      hasMore: boolean
      nextRevision: number
      lastRevision: number
      lastFileId: string
    }>(`/api/workspaces/${encodeURIComponent(workspaceId)}/sync/changes?${query}`, 'GET')
    changes.push(...page.changes)
    if (!page.hasMore) return { changes, nextRevision: page.nextRevision }
    lastRevision = page.lastRevision
    lastFileId = page.lastFileId
  }
}
async function readRemoteSnapshot(
  workspaceId: string
): Promise<{ revision: number; files: BridgeFile[] }> {
  const files: BridgeFile[] = []
  let atRevision: number | undefined
  let afterPath = ''
  let legacySnapshot = false
  while (true) {
    const query = new URLSearchParams()
    if (atRevision !== undefined) query.set('atRevision', String(atRevision))
    if (afterPath) query.set('afterPath', afterPath)
    let page: BridgeSnapshotPage
    try {
      page = await request<BridgeSnapshotPage>(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/${legacySnapshot ? 'snapshot' : 'sync/tree'}${query.size ? `?${query}` : ''}`,
        'GET'
      )
    } catch (error) {
      if (
        !legacySnapshot &&
        !files.length &&
        error instanceof Error &&
        error.message === 'not_found'
      ) {
        legacySnapshot = true
        continue
      }
      throw error
    }
    atRevision = page.revision
    files.push(...page.files)
    if (!page.hasMore) {
      if (legacySnapshot) {
        const folders = new Map<string, BridgeFile>()
        for (const file of files) {
          let parent = file.path.includes('/') ? file.path.slice(0, file.path.lastIndexOf('/')) : ''
          while (parent) {
            if (!folders.has(parent))
              folders.set(parent, {
                id: `folder-${parent}`,
                path: parent,
                kind: 'folder',
                revision: 0
              })
            parent = parent.includes('/') ? parent.slice(0, parent.lastIndexOf('/')) : ''
          }
        }
        files.push(...folders.values())
      }
      return { files, revision: atRevision }
    }
    afterPath = page.nextPath
  }
}
async function createRemoteFile(
  workspaceId: string,
  snapshotRevision: number,
  relative: string,
  content: string
): Promise<BridgeFile> {
  const state = await load()
  const creates = (state.pendingCreates[workspaceId] ??= {})
  const contentHash = hash(content)
  const pending = creates[relative] ?? {
    operationId: randomUUID(),
    fileId: randomUUID(),
    contentHash,
    content
  }
  creates[relative] = pending
  await save()
  const { operationId, fileId } = pending
  const doc = new Y.Doc({ guid: fileId })
  if (pending.content) doc.getText('markdown').insert(0, pending.content)
  const result = await request<{
    file?: BridgeFile
    path?: string
    fileId?: string
    acceptedRevision?: number
    conflictCopyPath?: string
  }>(`/api/workspaces/${encodeURIComponent(workspaceId)}/operations`, 'POST', {
    operationId,
    baseRevision: snapshotRevision,
    clientId: 'desktop-sync-bridge',
    operation: { type: 'create-file', path: relative, fileId, content: pending.content },
    initialState: b64(Y.encodeStateAsUpdate(doc))
  })
  return {
    id: result.file?.id ?? result.fileId ?? fileId,
    path: result.file?.path ?? result.conflictCopyPath ?? result.path ?? relative,
    kind: 'markdown',
    revision: result.file?.revision ?? result.acceptedRevision ?? 0,
    localHash: hash(pending.content)
  }
}
async function replaceRemoteText(
  workspaceId: string,
  file: BridgeFile,
  currentRemote: string,
  nextText: string
): Promise<number> {
  const state = await load()
  const updates = (state.pendingUpdates[workspaceId] ??= {})
  const targetHash = hash(nextText)
  const existingPending = updates[file.id]
  if (existingPending?.targetHash === targetHash) {
    const ack = await request<{ acceptedRevision?: number }>(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/files/${encodeURIComponent(file.id)}/updates`,
      'POST',
      existingPending
    )
    delete updates[file.id]
    await save()
    return ack.acceptedRevision ?? file.revision
  }
  const latest = await request<{ update: string; revision: number }>(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/files/${encodeURIComponent(file.id)}/updates`,
    'GET'
  )
  const doc = new Y.Doc({ guid: file.id })
  Y.applyUpdate(doc, fromB64(latest.update))
  const text = doc.getText('markdown')
  if (text.toString() !== currentRemote) throw new Error('remote_changed_retry')
  const vector = Y.encodeStateVector(doc)
  let prefix = 0
  while (
    prefix < currentRemote.length &&
    prefix < nextText.length &&
    currentRemote[prefix] === nextText[prefix]
  )
    prefix++
  let suffix = 0
  while (
    suffix < currentRemote.length - prefix &&
    suffix < nextText.length - prefix &&
    currentRemote[currentRemote.length - 1 - suffix] === nextText[nextText.length - 1 - suffix]
  )
    suffix++
  const removed = currentRemote.length - prefix - suffix
  const inserted = nextText.slice(prefix, nextText.length - suffix)
  doc.transact(() => {
    if (removed) text.delete(prefix, removed)
    if (inserted) text.insert(prefix, inserted)
  })
  const mutation = {
    operationId: randomUUID(),
    targetHash,
    update: b64(Y.encodeStateAsUpdate(doc, vector))
  }
  updates[file.id] = mutation
  await save()
  const result = await request<{ acceptedRevision?: number }>(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/files/${encodeURIComponent(file.id)}/updates`,
    'POST',
    mutation
  )
  delete updates[file.id]
  await save()
  return result.acceptedRevision ?? latest.revision
}
async function conflictCopy(root: string, relative: string, content: string): Promise<string> {
  const ext = path.posix.extname(relative)
  const base = ext ? relative.slice(0, -ext.length) : relative
  const conflict = `${base}.local-conflict-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}${ext || '.md'}`
  await writeAtomic(root, conflict, content)
  return conflict
}

async function syncOnce(workspaceId: string): Promise<void> {
  const config = (await load()).configs[workspaceId]
  if (!config) return
  const active = running.get(workspaceId)
  if (active) return active
  let fullScan = false
  let scanDirectories = false
  let scannedDirectories: Record<string, string | null> | null = null
  let scannedLocalPaths: string[] = []
  const job = (async () => {
    const root = path.resolve(config.folderPath)
    try {
      if (!folderLocks.has(workspaceId))
        folderLocks.set(workspaceId, await acquireFolderSyncLock(root, workspaceId))
      const state = await load()
      fullScan = fullScanRequests.delete(workspaceId) || state.pendingFullScans[workspaceId] === true
      scanDirectories = directoryScanRequests.delete(workspaceId)
      scannedLocalPaths = [
        ...new Set([
          ...(dirtyLocalPaths.get(workspaceId) ?? []),
          ...((await load()).pendingPaths[workspaceId] ?? [])
        ])
      ]
      dirtyLocalPaths.delete(workspaceId)
      state.pendingPaths[workspaceId] = [
        ...new Set([...(state.pendingPaths[workspaceId] ?? []), ...scannedLocalPaths])
      ]
      await save()
      let knownRemoteFiles = state.remoteFiles[workspaceId]
      let knownRemoteTree = state.remoteTrees[workspaceId]
      let nextSyncRevision = state.syncCursors[workspaceId]
      const remoteChangedPaths = new Set<string>()
      const baselines = (state.baselines[workspaceId] ??= {})
      if (scanDirectories || fullScan) {
        try {
          scannedDirectories = await localDirectoryInventory(root, config.excludedPaths ?? [])
        } catch (error) {
          appendStartupLog('pkms_local_scan_incomplete', {
            workspaceId,
            error: error instanceof Error ? error.message : 'unknown'
          })
          throw error
        }
        const previousDirectories = state.localDirectories[workspaceId]
        if (!previousDirectories) {
          // Migration is seed-only: never interpret the first inventory as a mass delete.
          state.localDirectories[workspaceId] = scannedDirectories
          await save()
        } else {
          const missing = Object.keys(previousDirectories).filter(
            (relative) => !Object.hasOwn(scannedDirectories!, relative)
          )
          const added = Object.keys(scannedDirectories).filter(
            (relative) => !Object.hasOwn(previousDirectories, relative)
          )
          const movedDirectoryPaths = new Set<string>()
          // Preserve cloud identity for a local folder rename/move when inode identity is unique.
          for (const oldPath of missing) {
            const identity = previousDirectories[oldPath]
            if (!identity) continue
            const destinations = added.filter(
              (relative) => scannedDirectories![relative] === identity
            )
            if (destinations.length !== 1) continue
            const toPath = destinations[0]
            const remoteFolder = (knownRemoteTree ?? []).find(
              (file) => file.kind === 'folder' && file.path === oldPath
            )
            if (!remoteFolder) continue
            const operationId = randomUUID()
            const result = await request<{ acceptedRevision?: number; conflictCopyPath?: string }>(
              `/api/workspaces/${encodeURIComponent(workspaceId)}/operations`,
              'POST',
              {
                operationId,
                baseRevision: nextSyncRevision ?? 0,
                clientId: 'desktop-sync-bridge',
                operation: { type: 'move', fileId: remoteFolder.id, toPath }
              }
            )
            const actualPath = result.conflictCopyPath ?? toPath
            const remap = (value: string) =>
              value === oldPath || value.startsWith(`${oldPath}/`)
                ? `${actualPath}${value.slice(oldPath.length)}`
                : value
            knownRemoteTree = (knownRemoteTree ?? []).map((file) =>
              file.path === oldPath || file.path.startsWith(`${oldPath}/`)
                ? {
                    ...file,
                    path: remap(file.path),
                    revision: result.acceptedRevision ?? file.revision
                  }
                : file
            )
            for (const file of Object.values(knownRemoteFiles ?? {}))
              if (file.path === oldPath || file.path.startsWith(`${oldPath}/`)) {
                file.path = remap(file.path)
                file.revision = result.acceptedRevision ?? file.revision
              }
            for (const [relative, baseline] of Object.entries(baselines))
              if (relative === oldPath || relative.startsWith(`${oldPath}/`)) {
                delete baselines[relative]
                baselines[remap(relative)] = baseline
              }
            nextSyncRevision = Math.max(nextSyncRevision ?? 0, result.acceptedRevision ?? 0)
            movedDirectoryPaths.add(oldPath)
            appendStartupLog('pkms_local_folder_move', {
              workspaceId,
              fromPath: oldPath,
              toPath: actualPath,
              operationId
            })
          }
          const missingAfterMoves = missing.filter((relative) => !movedDirectoryPaths.has(relative))
          const missingRoots = missingAfterMoves.filter(
            (relative) =>
              !missingAfterMoves.some(
                (candidate) => candidate !== relative && relative.startsWith(`${candidate}/`)
              )
          )
          const pending = (state.pendingDeletes[workspaceId] ??= {})
          for (const relative of missingRoots) {
            const remote = (knownRemoteTree ?? []).find(
              (file) => file.kind === 'folder' && file.path === relative
            )
            if (
              !remote ||
              isReservedSyncPath(relative) ||
              matchesExclusion(relative, config.excludedPaths ?? [])
            )
              continue
            if (!pending[relative]) {
              pending[relative] = {
                kind: 'folder',
                path: relative,
                fileId: remote.id,
                operationId: randomUUID(),
                baseRevision: nextSyncRevision ?? 0,
                firstObservedAt: Date.now(),
                attempts: 0
              }
              state.remoteTreeVersions[workspaceId] =
                (state.remoteTreeVersions[workspaceId] ?? 0) + 1
              setItemState(workspaceId, relative, 'pending')
              notifyLocalTreeChanged(workspaceId, relative)
            }
            appendStartupLog('pkms_local_delete_queued', {
              workspaceId,
              kind: 'folder',
              path: relative,
              operationId: pending[relative].operationId
            })
          }
          // Retain identities for remote folders that have not yet been materialized.
          state.localDirectories[workspaceId] = scannedDirectories
          await save()
        }
      }
      const onlyNewLocalMarkdown =
        scannedLocalPaths.length > 0 &&
        scannedLocalPaths.every(
          (relative) =>
            relative.toLowerCase().endsWith('.md') &&
            !baselines[relative] &&
            !Object.values(knownRemoteFiles ?? {}).some((file) => file.path === relative)
        )
      // A new local file can be created immediately. The server checks the
      // path atomically and assigns a conflict path if another device created
      // the same name, so a serial change-feed request adds latency without
      // improving correctness.
      const skipRemoteChangeFeed = !fullScan && onlyNewLocalMarkdown
      const needsRemoteHashMetadata =
        !!knownRemoteFiles &&
        Object.values(knownRemoteFiles).some(
          (file) => file.revision === 0 && file.sha === undefined
        )
      const backgroundCheck =
        !fullScan &&
        scannedLocalPaths.length === 0 &&
        !!knownRemoteFiles &&
        nextSyncRevision !== undefined &&
        !needsRemoteHashMetadata
      if (!backgroundCheck)
        setStatus(workspaceId, { state: 'syncing', stage: 'scanning', progress: null, error: null })
      if (!backgroundCheck) setStatus(workspaceId, { stage: 'loading-remote-list' })
      if (
        !knownRemoteFiles ||
        nextSyncRevision === undefined ||
        needsRemoteHashMetadata ||
        !knownRemoteTree
      ) {
        const snapshot = await readRemoteSnapshot(workspaceId)
        knownRemoteTree = snapshot.files
        state.remoteTrees[workspaceId] = snapshot.files
        state.remoteTreeVersions[workspaceId] = Math.max(
          (state.remoteTreeVersions[workspaceId] ?? -1) + 1,
          snapshot.revision
        )
        await save()
        knownRemoteFiles = Object.fromEntries(
          snapshot.files.filter((file) => file.kind === 'markdown').map((file) => [file.id, file])
        )
        nextSyncRevision = snapshot.revision
        fullScan = true
      } else if (!skipRemoteChangeFeed) {
        try {
          const page = await readRemoteChanges(workspaceId, nextSyncRevision)
          const treeById = new Map(
            (knownRemoteTree ?? Object.values(knownRemoteFiles)).map((file) => [file.id, file])
          )
          for (const change of page.changes) {
            treeById.delete(change.id)
            if (!change.deleted && (change.kind === 'markdown' || change.kind === 'folder'))
              treeById.set(change.id, change)
            const previous = knownRemoteFiles[change.id]
            if (previous) remoteChangedPaths.add(previous.path)
            delete knownRemoteFiles[change.id]
            if (!change.deleted && change.kind === 'markdown') {
              knownRemoteFiles[change.id] = change
              remoteChangedPaths.add(change.path)
            }
          }
          knownRemoteTree = [...treeById.values()]
          state.remoteTrees[workspaceId] = knownRemoteTree
          state.remoteTreeVersions[workspaceId] = Math.max(
            (state.remoteTreeVersions[workspaceId] ?? -1) + 1,
            page.nextRevision
          )
          nextSyncRevision = page.nextRevision
        } catch (error) {
          if (!(error instanceof PkmsBridgeRequestError) || error.code !== 'invalid_sync_cursor')
            throw error

          // A cursor can outlive the server's retained change feed. Recover from
          // an authoritative snapshot, then reconcile it against the complete
          // local inventory so pending local edits are preserved as conflicts.
          appendStartupLog('pkms_remote_cursor_invalid', {
            workspaceId,
            cursor: nextSyncRevision
          })
          state.pendingFullScans[workspaceId] = true
          await save()
          const snapshot = await readRemoteSnapshot(workspaceId)
          knownRemoteTree = snapshot.files
          state.remoteTrees[workspaceId] = snapshot.files
          state.remoteTreeVersions[workspaceId] = Math.max(
            (state.remoteTreeVersions[workspaceId] ?? -1) + 1,
            snapshot.revision
          )
          knownRemoteFiles = Object.fromEntries(
            snapshot.files
              .filter((file) => file.kind === 'markdown')
              .map((file) => [file.id, file])
          )
          nextSyncRevision = snapshot.revision
          fullScan = true
          appendStartupLog('pkms_remote_cursor_recovered', {
            workspaceId,
            snapshotRevision: snapshot.revision,
            files: Object.keys(knownRemoteFiles).length
          })
        }
      }
      const pendingDeletes = (state.pendingDeletes[workspaceId] ??= {})
      const deletedFolderRoots = Object.values(pendingDeletes).filter(
        (item) => item.kind === 'folder'
      )
      for (const deletion of deletedFolderRoots) {
        if (scannedDirectories && Object.hasOwn(scannedDirectories, deletion.path)) {
          delete pendingDeletes[deletion.path]
          state.remoteTreeVersions[workspaceId] = (state.remoteTreeVersions[workspaceId] ?? 0) + 1
          setItemState(workspaceId, deletion.path, null)
          continue
        }
        const remote = (knownRemoteTree ?? []).find(
          (file) => file.id === deletion.fileId && file.kind === 'folder'
        )
        if (!remote || remote.path !== deletion.path) {
          delete pendingDeletes[deletion.path]
          state.remoteTreeVersions[workspaceId] = (state.remoteTreeVersions[workspaceId] ?? 0) + 1
          setItemState(workspaceId, deletion.path, null)
          continue
        }
        deletion.attempts++
        deletion.baseRevision = nextGuardedFolderDeleteRevision(
          nextSyncRevision,
          deletion.baseRevision
        )
        await save()
        try {
          const result = await request<{ acceptedRevision?: number }>(
            `/api/workspaces/${encodeURIComponent(workspaceId)}/operations`,
            'POST',
            {
              operationId: deletion.operationId,
              baseRevision: deletion.baseRevision,
              clientId: 'desktop-sync-bridge',
              operation: { type: 'delete', fileId: deletion.fileId, protectSubtree: true }
            }
          )
          const under = (candidate: string) =>
            candidate === deletion.path || candidate.startsWith(`${deletion.path}/`)
          knownRemoteTree = (knownRemoteTree ?? []).filter((file) => !under(file.path))
          for (const [id, file] of Object.entries(knownRemoteFiles ?? {}))
            if (under(file.path)) delete knownRemoteFiles![id]
          for (const relative of Object.keys(baselines))
            if (under(relative)) delete baselines[relative]
          for (const relative of Object.keys(pendingDeletes))
            if (under(relative)) delete pendingDeletes[relative]
          state.remoteTreeVersions[workspaceId] = (state.remoteTreeVersions[workspaceId] ?? 0) + 1
          state.localDirectories[workspaceId] = Object.fromEntries(
            Object.entries(state.localDirectories[workspaceId] ?? {}).filter(
              ([relative]) => !under(relative)
            )
          )
          nextSyncRevision = Math.max(nextSyncRevision ?? 0, result.acceptedRevision ?? 0)
          appendStartupLog('pkms_local_delete_ack', {
            workspaceId,
            kind: 'folder',
            path: deletion.path,
            operationId: deletion.operationId
          })
          setItemState(workspaceId, deletion.path, null)
          notifyLocalTreeChanged(workspaceId, deletion.path)
        } catch (error) {
          if (
            error instanceof PkmsBridgeRequestError &&
            error.code === 'folder_changed_since_base'
          ) {
            delete pendingDeletes[deletion.path]
            state.remoteTreeVersions[workspaceId] = (state.remoteTreeVersions[workspaceId] ?? 0) + 1
            appendStartupLog('pkms_local_delete_conflict', {
              workspaceId,
              kind: 'folder',
              path: deletion.path,
              operationId: deletion.operationId
            })
            setItemState(workspaceId, deletion.path, 'attention')
            const latest = await readRemoteSnapshot(workspaceId)
            knownRemoteTree = latest.files
            knownRemoteFiles = Object.fromEntries(
              latest.files.filter((file) => file.kind === 'markdown').map((file) => [file.id, file])
            )
            nextSyncRevision = latest.revision
            fullScan = true
            state.localDirectories[workspaceId] ??= {}
            const restore = latest.files.filter(
              (file) =>
                file.kind === 'folder' &&
                (file.path === deletion.path || file.path.startsWith(`${deletion.path}/`))
            )
            for (const folder of restore.sort(
              (a, b) => a.path.split('/').length - b.path.split('/').length
            )) {
              if (!Object.hasOwn(scannedDirectories ?? {}, folder.path)) {
                await fs.mkdir(safePath(root, folder.path), { recursive: true })
                const stat = await fs.lstat(safePath(root, folder.path), { bigint: true })
                ;(state.localDirectories[workspaceId] ??= {})[folder.path] =
                  `${stat.dev}:${stat.ino}`
              }
            }
            continue
          }
          appendStartupLog('pkms_local_delete_retry', {
            workspaceId,
            kind: 'folder',
            path: deletion.path,
            operationId: deletion.operationId,
            message: error instanceof Error ? error.message : 'unknown'
          })
          throw error
        }
      }
      state.remoteTrees[workspaceId] = knownRemoteTree ?? []
      state.remoteFiles[workspaceId] = knownRemoteFiles ?? {}
      state.syncCursors[workspaceId] = nextSyncRevision ?? 0
      await save()
      // Folder metadata is cheap and the manifest is already cached. Materialize
      // remote folders locally; local watcher paths create the corresponding
      // cloud entries. Folder deletions are intentionally not inferred from a
      // single OS delete event (recursive watcher events are ambiguous).
      for (const folder of (knownRemoteTree ?? [])
        .filter((file) => file.kind === 'folder')
        .sort((a, b) => a.path.split('/').length - b.path.split('/').length)) {
        if (
          isReservedSyncPath(folder.path) ||
          matchesExclusion(folder.path, config.excludedPaths ?? [])
        )
          continue
        if (
          Object.values(pendingDeletes).some(
            (item) =>
              item.kind === 'folder' &&
              (folder.path === item.path || folder.path.startsWith(`${item.path}/`))
          )
        )
          continue
        const target = safePath(root, folder.path)
        try {
          await assertSafeParentDirectories(root, folder.path)
          const stat = await fs.lstat(target)
          if (stat.isSymbolicLink() || !stat.isDirectory()) continue
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
          await fs.mkdir(target, { recursive: true })
          const createdStat = await fs.lstat(target, { bigint: true })
          ;(state.localDirectories[workspaceId] ??= {})[folder.path] =
            `${createdStat.dev}:${createdStat.ino}`
          notifyLocalTreeChanged(workspaceId, folder.path)
        }
      }
      const foldersToReconcile = folderPathsToReconcile(
        Object.keys(scannedDirectories ?? {}),
        knownRemoteTree ?? [],
        scanDirectories || fullScan,
        scannedLocalPaths
      )
      for (const relative of foldersToReconcile) {
        if (
          !relative ||
          isReservedSyncPath(relative) ||
          matchesExclusion(relative, config.excludedPaths ?? [])
        )
          continue
        const target = safePath(root, relative)
        let stat
        try {
          stat = await fs.lstat(target)
        } catch {
          continue
        }
        if (!stat.isDirectory()) continue
        const remoteAtPath = (knownRemoteTree ?? []).find((file) => file.path === relative)
        if (remoteAtPath) continue
        const pendingFolders = (state.pendingFolderCreates[workspaceId] ??= {})
        const operationId = (pendingFolders[relative] ??= randomUUID())
        await save()
        const result = await request<{
          acceptedRevision?: number
          conflictCopyPath?: string
          path?: string
          fileId?: string
        }>(`/api/workspaces/${encodeURIComponent(workspaceId)}/operations`, 'POST', {
          operationId,
          baseRevision: nextSyncRevision,
          clientId: 'desktop-sync-bridge',
          operation: { type: 'create-folder', path: relative }
        })
        delete pendingFolders[relative]
        const cloudPath = result.path ?? result.conflictCopyPath ?? relative
        const folder = {
          id: result.fileId ?? `folder-${cloudPath}`,
          path: cloudPath,
          kind: 'folder',
          revision: result.acceptedRevision ?? 0
        }
        knownRemoteTree = [
          ...(knownRemoteTree ?? []).filter((file) => file.path !== cloudPath),
          folder
        ]
        state.remoteTrees[workspaceId] = knownRemoteTree
        nextSyncRevision = Math.max(nextSyncRevision ?? 0, result.acceptedRevision ?? 0)
        await save()
      }
      if (!fullScan && scannedLocalPaths.length === 0 && remoteChangedPaths.size === 0) {
        // The fast revision poll is intentionally frequent. Avoid rescanning
        // the vault and rewriting the multi-megabyte baseline JSON when nothing
        // relevant changed; persist only cursor movement from non-Markdown rows.
        if (nextSyncRevision !== state.syncCursors[workspaceId]) {
          state.remoteFiles[workspaceId] = knownRemoteFiles
          if (knownRemoteTree) state.remoteTrees[workspaceId] = knownRemoteTree
          state.remoteTreeVersions[workspaceId] = Math.max(
            (state.remoteTreeVersions[workspaceId] ?? -1) + 1,
            nextSyncRevision
          )
          state.syncCursors[workspaceId] = nextSyncRevision
          await save()
        }
        setStatus(workspaceId, {
          state: 'synced',
          stage: null,
          enabled: true,
          folderPath: root,
          lastScannedAt: Date.now(),
          pendingFiles: 0,
          error: null
        })
        return
      }
      setStatus(workspaceId, { state: 'syncing', stage: 'scanning', progress: null, error: null })
      const local = fullScan
        ? await markdownFiles(root, config.excludedPaths ?? [])
        : await markdownFilesAt(
            root,
            new Set([...scannedLocalPaths, ...remoteChangedPaths]),
            config.excludedPaths ?? []
          )
      const remoteByPath = new Map(Object.values(knownRemoteFiles).map((file) => [file.path, file]))
      const createAndRememberRemoteFile = async (
        relative: string,
        content: string
      ): Promise<BridgeFile> => {
        const created = await createRemoteFile(workspaceId, nextSyncRevision, relative, content)
        knownRemoteFiles[created.id] = created
        knownRemoteTree = [...(knownRemoteTree ?? []), created]
        remoteByPath.set(created.path, created)
        return created
      }
      const preserveConflictCopy = async (
        relative: string,
        content: string
      ): Promise<BridgeFile> => {
        const sourceExtension = path.posix.extname(relative)
        const ext = sourceExtension || '.md'
        const base = sourceExtension ? relative.slice(0, -sourceExtension.length) : relative
        const prefix = `${base}.local-conflict-`
        const contentHash = hash(content)
        const existingPath = [...local].find(
          ([candidate, existing]) =>
            candidate.startsWith(prefix) &&
            candidate.endsWith(ext) &&
            hash(existing) === contentHash
        )?.[0]
        if (existingPath) {
          const remoteCopy = remoteByPath.get(existingPath)
          if (remoteCopy) return remoteCopy
          return createAndRememberRemoteFile(existingPath, content)
        }
        const conflict = await conflictCopy(root, relative, content)
        local.set(conflict, content)
        return createAndRememberRemoteFile(conflict, content)
      }
      const changedPaths = fullScan
        ? [...local.keys(), ...remoteByPath.keys(), ...Object.keys(baselines)]
        : [
            ...local.keys(),
            ...remoteChangedPaths,
            ...scannedLocalPaths.flatMap((changedPath) => [
              ...(changedPath.toLowerCase().endsWith('.md') ||
              baselines[changedPath] ||
              remoteByPath.has(changedPath)
                ? [changedPath]
                : []),
              ...Object.keys(baselines).filter((relative) =>
                relative.startsWith(`${changedPath}/`)
              ),
              ...remoteByPath.keys().filter((relative) => relative.startsWith(`${changedPath}/`))
            ])
          ]
      const paths = [...new Set(changedPaths)].filter(
        (relative) =>
          !isReservedSyncPath(relative) && !matchesExclusion(relative, config.excludedPaths ?? [])
      )
      let completed = 0
      const total = paths.length
      const filesToRead = paths.flatMap((relative) => {
        const remote = remoteByPath.get(relative)
        const baseline = baselines[relative]
        const localText = local.get(relative)
        // Imported GitHub files carry Git's content-addressed blob SHA. When
        // local bytes still match that hash, seed the baseline without
        // downloading the document body. Edited cloud files have a revision > 0
        // and always take the normal content reconciliation path.
        const matchesGitBlob =
          remote?.revision === 0 &&
          !!remote.sha &&
          localText !== undefined &&
          gitBlobHash(localText) === remote.sha
        return remote &&
          (!baseline || baseline.fileId !== remote.id || baseline.revision !== remote.revision) &&
          !matchesGitBlob
          ? [remote]
          : []
      })
      const totalWork = filesToRead.length + total
      const reportProgress = () =>
        setStatus(workspaceId, {
          state: 'syncing',
          stage: 'reconciling',
          progress: {
            completed: filesToRead.length + completed,
            total: totalWork,
            percent: totalWork
              ? Math.floor(((filesToRead.length + completed) / totalWork) * 100)
              : 100
          }
        })
      setStatus(workspaceId, {
        stage: 'downloading-remote-files',
        progress: { completed: 0, total: totalWork, percent: totalWork ? 0 : 100 }
      })
      const remoteBatch = await readRemoteTexts(workspaceId, filesToRead, (downloaded) =>
        setStatus(workspaceId, {
          state: 'syncing',
          stage: 'downloading-remote-files',
          progress: {
            completed: downloaded,
            total: totalWork,
            percent: totalWork ? Math.floor((downloaded / totalWork) * 100) : 100
          }
        })
      )
      for (const file of filesToRead) {
        if (!remoteBatch.missingIds.has(file.id)) continue
        delete knownRemoteFiles[file.id]
        remoteByPath.delete(file.path)
        remoteChangedPaths.add(file.path)
      }
      const remoteReads = remoteBatch.documents
      completed = 0
      reportProgress()
      const reconcilePath = async (relative: string): Promise<void> => {
        let itemComplete = false
        let deletionConflictRecovered = false
        setItemState(workspaceId, relative, 'syncing')
        try {
          const localText = local.get(relative)
          const remote = remoteByPath.get(relative)
          const baseline = baselines[relative]
          if (!remote && localText !== undefined) {
            if (baseline) {
              if (hash(localText) !== baseline.hash) {
                const created = await preserveConflictCopy(relative, localText)
                baselines[created.path] = {
                  fileId: created.id,
                  hash: created.localHash ?? hash(localText),
                  revision: created.revision
                }
              }
              await removeLocalFile(root, relative, hash(localText))
              delete baselines[relative]
            } else {
              const created = await createAndRememberRemoteFile(relative, localText)
              baselines[created.path] = {
                fileId: created.id,
                hash: created.localHash ?? hash(localText),
                revision: created.revision
              }
            }
            itemComplete = true
            return
          }
          if (!remote) {
            delete baselines[relative]
            const pending = state.pendingDeletes[workspaceId]?.[relative]
            if (pending) {
              delete state.pendingDeletes[workspaceId][relative]
              state.remoteTreeVersions[workspaceId] =
                (state.remoteTreeVersions[workspaceId] ?? 0) + 1
            }
            itemComplete = true
            return
          }
          if (
            !baseline &&
            remote.revision === 0 &&
            remote.sha &&
            localText !== undefined &&
            gitBlobHash(localText) === remote.sha
          ) {
            baselines[relative] = {
              fileId: remote.id,
              hash: hash(localText),
              revision: remote.revision
            }
            itemComplete = true
            return
          }
          const remoteNeedsRead =
            !baseline || baseline.fileId !== remote.id || baseline.revision !== remote.revision
          const remoteContent = remoteNeedsRead
            ? (remoteReads.get(remote.id) ?? (await readRemoteText(workspaceId, remote)))
            : null
          const remoteText = remoteContent?.text
          const actualLocal = localText
          if (actualLocal === undefined) {
            if (!(await localPathIsAbsent(root, relative))) {
              throw new Error(`A non-file item occupies the synced Markdown path: ${relative}`)
            }
            if (baseline) {
              const remoteChanged = remoteChangedSinceBaseline(
                { id: remote.id, revision: remoteContent?.revision ?? remote.revision },
                baseline
              )
              if (remoteChanged) {
                const latestText = remoteText ?? (await readRemoteText(workspaceId, remote)).text
                // A local deletion is valid only against the exact remote version
                // in its baseline. If the cloud changed, restore that version at
                // its original path and cancel any stale delete intent. Creating
                // a conflict copy and then deleting the source would strand the
                // latest cloud content under a new path and break replica parity.
                await writeAtomic(root, relative, latestText, null)
                baselines[relative] = {
                  fileId: remote.id,
                  hash: hash(latestText),
                  revision: remoteContent?.revision ?? remote.revision
                }
                delete (state.pendingDeletes[workspaceId] ?? {})[relative]
                nextSyncRevision = Math.max(
                  nextSyncRevision ?? 0,
                  remoteContent?.revision ?? remote.revision
                )
                deletionConflictRecovered = true
                itemComplete = true
                appendStartupLog('pkms_local_delete_conflict', {
                  workspaceId,
                  kind: 'markdown',
                  path: relative,
                  outcome: 'restored_remote_revision',
                  remoteRevision: remoteContent?.revision ?? remote.revision
                })
                return
              }
              const pending = (state.pendingDeletes[workspaceId] ??= {})
              const isNewDeletion = !pending[relative]
              const deletion = (pending[relative] ??= {
                kind: 'markdown',
                path: relative,
                fileId: remote.id,
                operationId: randomUUID(),
                baseRevision: nextSyncRevision ?? 0,
                expectedItemRevision: remote.revision,
                firstObservedAt: Date.now(),
                attempts: 0
              })
              deletion.attempts++
              if (isNewDeletion)
                state.remoteTreeVersions[workspaceId] =
                  (state.remoteTreeVersions[workspaceId] ?? 0) + 1
              await save()
              appendStartupLog('pkms_local_delete_queued', {
                workspaceId,
                kind: 'markdown',
                path: relative,
                operationId: deletion.operationId
              })
              try {
                const result = await request<{ acceptedRevision?: number }>(
                  `/api/workspaces/${encodeURIComponent(workspaceId)}/operations`,
                  'POST',
                  {
                    operationId: deletion.operationId,
                    baseRevision: deletion.baseRevision,
                    clientId: 'desktop-sync-bridge',
                    operation: {
                      type: 'delete',
                      fileId: remote.id,
                      expectedRevision: deletion.expectedItemRevision
                    }
                  }
                )
                delete pending[relative]
                state.remoteTreeVersions[workspaceId] =
                  (state.remoteTreeVersions[workspaceId] ?? 0) + 1
                delete knownRemoteFiles[remote.id]
                knownRemoteTree = (knownRemoteTree ?? []).filter((file) => file.id !== remote.id)
                remoteByPath.delete(relative)
                nextSyncRevision = Math.max(nextSyncRevision ?? 0, result.acceptedRevision ?? 0)
                appendStartupLog('pkms_local_delete_ack', {
                  workspaceId,
                  kind: 'markdown',
                  path: relative,
                  operationId: deletion.operationId
                })
              } catch (error) {
                if (
                  error instanceof PkmsBridgeRequestError &&
                  error.code === 'file_changed_since_base'
                ) {
                  delete pending[relative]
                  state.remoteTreeVersions[workspaceId] =
                    (state.remoteTreeVersions[workspaceId] ?? 0) + 1
                  const latestTree = await readRemoteSnapshot(workspaceId)
                  const latest = latestTree.files.find(
                    (file) => file.path === relative && file.kind === 'markdown'
                  )
                  if (latest) {
                    const text = (await readRemoteText(workspaceId, latest)).text
                    await writeAtomic(root, relative, text, null)
                    knownRemoteFiles[latest.id] = latest
                    knownRemoteTree = latestTree.files
                    baselines[relative] = {
                      fileId: latest.id,
                      hash: hash(text),
                      revision: latest.revision
                    }
                    nextSyncRevision = latestTree.revision
                  }
                  setItemState(workspaceId, relative, 'attention')
                  appendStartupLog('pkms_local_delete_conflict', {
                    workspaceId,
                    kind: 'markdown',
                    path: relative,
                    operationId: deletion.operationId
                  })
                  return
                }
                appendStartupLog('pkms_local_delete_retry', {
                  workspaceId,
                  kind: 'markdown',
                  path: relative,
                  operationId: deletion.operationId,
                  message: error instanceof Error ? error.message : 'unknown'
                })
                throw error
              }
              delete baselines[relative]
            } else {
              const text = remoteText ?? (await readRemoteText(workspaceId, remote)).text
              await writeAtomic(root, relative, text, null)
              baselines[relative] = {
                fileId: remote.id,
                hash: hash(text),
                revision: remoteContent?.revision ?? remote.revision
              }
            }
            itemComplete = true
            return
          }
          const localHash = hash(actualLocal)
          if (!baseline) {
            if (localHash === hash(remoteText ?? '')) {
              baselines[relative] = {
                fileId: remote.id,
                hash: localHash,
                revision: remoteContent?.revision ?? remote.revision
              }
            } else {
              const created = await preserveConflictCopy(relative, actualLocal)
              baselines[created.path] = {
                fileId: created.id,
                hash: created.localHash ?? localHash,
                revision: created.revision
              }
              await writeAtomic(root, relative, remoteText ?? '', localHash)
              baselines[relative] = {
                fileId: remote.id,
                hash: hash(remoteText ?? ''),
                revision: remoteContent?.revision ?? remote.revision
              }
            }
            itemComplete = true
            return
          }
          const localChanged = localHash !== baseline.hash
          const remoteChanged =
            remote.id !== baseline.fileId ||
            (remoteContent !== null && remoteContent.revision !== baseline.revision)
          if (localChanged && remoteChanged) {
            const created = await preserveConflictCopy(relative, actualLocal)
            baselines[created.path] = {
              fileId: created.id,
              hash: created.localHash ?? localHash,
              revision: created.revision
            }
            const text = remoteText ?? (await readRemoteText(workspaceId, remote)).text
            await writeAtomic(root, relative, text, localHash)
            baselines[relative] = {
              fileId: remote.id,
              hash: hash(text),
              revision: remoteContent?.revision ?? remote.revision
            }
          } else if (localChanged) {
            const nextRevision = await replaceRemoteText(
              workspaceId,
              remote,
              remoteText ?? (await readRemoteText(workspaceId, remote)).text,
              actualLocal
            )
            baselines[relative] = { fileId: remote.id, hash: localHash, revision: nextRevision }
          } else if (remoteChanged) {
            const text = remoteText ?? (await readRemoteText(workspaceId, remote)).text
            await writeAtomic(root, relative, text, localHash)
            baselines[relative] = {
              fileId: remote.id,
              hash: hash(text),
              revision: remoteContent?.revision ?? remote.revision
            }
          }
          itemComplete = true
        } finally {
          if (itemComplete) {
            completed++
            setItemState(
              workspaceId,
              relative,
              deletionConflictRecovered
                ? 'attention'
                : dirtyLocalPaths.get(workspaceId)?.has(relative)
                  ? 'pending'
                  : null
            )
          }
          reportProgress()
        }
      }
      let nextPath = 0
      let firstError: unknown
      const worker = async () => {
        while (true) {
          const index = nextPath++
          if (index >= total) return
          try {
            await reconcilePath(paths[index])
          } catch (error) {
            setItemState(workspaceId, paths[index], 'attention')
            firstError ??= error
          }
        }
      }
      await Promise.all(Array.from({ length: Math.min(6, total) }, () => worker()))
      await save()
      if (firstError) throw firstError
      state.remoteFiles[workspaceId] = knownRemoteFiles
      if (knownRemoteTree) state.remoteTrees[workspaceId] = knownRemoteTree
      state.remoteTreeVersions[workspaceId] = Math.max(
        (state.remoteTreeVersions[workspaceId] ?? -1) + 1,
        nextSyncRevision
      )
      state.syncCursors[workspaceId] = nextSyncRevision
      delete state.pendingFullScans[workspaceId]
      for (const [relative, create] of Object.entries(state.pendingCreates[workspaceId] ?? {})) {
        if (Object.values(baselines).some((baseline) => baseline.fileId === create.fileId))
          delete state.pendingCreates[workspaceId][relative]
      }
      await save()
      retryAttempts.delete(workspaceId)
      const conflictFiles = [...new Set([...local.keys(), ...Object.keys(baselines)])].filter(
        (relative) => /\.local-conflict-[^/]+\.md$/i.test(relative)
      )
      setStatus(workspaceId, {
        state: 'synced',
        stage: null,
        progress: { completed: total, total, percent: 100 },
        enabled: true,
        folderPath: root,
        lastScannedAt: Date.now(),
        lastSyncedAt: Date.now(),
        pendingFiles: 0,
        conflictFiles,
        error: null
      })
      const pendingPaths = new Set(state.pendingPaths[workspaceId] ?? [])
      for (const relative of scannedLocalPaths)
        if (!dirtyLocalPaths.get(workspaceId)?.has(relative)) pendingPaths.delete(relative)
      state.pendingPaths[workspaceId] = [...pendingPaths]
      await save()
    } catch (error) {
      if (fullScan) fullScanRequests.add(workspaceId)
      if (scanDirectories) directoryScanRequests.add(workspaceId)
      if (scannedLocalPaths.length) {
        const pending = dirtyLocalPaths.get(workspaceId) ?? new Set<string>()
        for (const relative of scannedLocalPaths) pending.add(relative)
        dirtyLocalPaths.set(workspaceId, pending)
      }
      await save().catch(() => {})
      const message = error instanceof Error ? error.message : 'Folder sync failed'
      const folderBusy = message === 'editing_folder_in_use'
      const retryable =
        folderBusy ||
        message === 'local_file_changed_retry' ||
        message === 'remote_changed_retry' ||
        /\b(?:429|5\d\d)\b|rate.?limit|temporar|timed? ?out/i.test(message)
      if (retryable) {
        setStatus(workspaceId, {
          state: 'syncing',
          stage: 'scanning',
          enabled: true,
          folderPath: config.folderPath,
          pendingFiles: 1,
          error: folderBusy
            ? 'This editing folder is already syncing in another Workspace instance.'
            : null
        })
        const previousRetry = retryTimers.get(workspaceId)
        if (previousRetry) clearTimeout(previousRetry)
        const attempts = (retryAttempts.get(workspaceId) ?? 0) + 1
        retryAttempts.set(workspaceId, attempts)
        const delay = Math.min(60_000, 1_000 * 2 ** Math.min(attempts - 1, 6))
        retryTimers.set(
          workspaceId,
          setTimeout(() => {
            retryTimers.delete(workspaceId)
            schedule(workspaceId)
          }, delay)
        )
      } else {
        setStatus(workspaceId, {
          state: /fetch|network|offline|connection/i.test(message) ? 'offline' : 'error',
          stage: null,
          enabled: true,
          folderPath: config.folderPath,
          lastScannedAt: Date.now(),
          pendingFiles: 1,
          error: message
        })
      }
    }
  })().finally(() => {
    running.delete(workspaceId)
    // Baseline hashes make watcher events caused by our own atomic writes
    // idempotent, so there is no multi-second suppression window that could
    // delay a real edit made immediately afterward.
    if (
      (fullScanRequests.has(workspaceId) ||
        directoryScanRequests.has(workspaceId) ||
        dirtyLocalPaths.has(workspaceId)) &&
      !timers.has(workspaceId)
    ) {
      schedule(workspaceId, fullScanRequests.has(workspaceId))
    }
  })
  running.set(workspaceId, job)
  return job
}

function schedule(workspaceId: string, fullScan = false, localPath?: string): void {
  if (fullScan) fullScanRequests.add(workspaceId)
  if (localPath) {
    const pending = dirtyLocalPaths.get(workspaceId) ?? new Set<string>()
    pending.add(localPath)
    dirtyLocalPaths.set(workspaceId, pending)
    void load()
      .then(async (state) => {
        const queued = new Set(state.pendingPaths[workspaceId] ?? [])
        queued.add(localPath)
        state.pendingPaths[workspaceId] = [...queued]
        await save()
      })
      .catch(() => {})
    if (!isReservedSyncPath(localPath)) setItemState(workspaceId, localPath, 'pending')
  }
  if (running.has(workspaceId)) return
  if (status(workspaceId).state === 'error') return
  const previous = timers.get(workspaceId)
  if (previous) clearTimeout(previous)
  // Coalesce atomic-save event bursts while keeping one file edit under a
  // second from reaching the cloud.
  timers.set(
    workspaceId,
    setTimeout(() => {
      timers.delete(workspaceId)
      void syncOnce(workspaceId)
    }, 25)
  )
}
async function stopRuntime(workspaceId: string, releaseLock = true): Promise<void> {
  watchers.get(workspaceId)?.close()
  watchers.delete(workspaceId)
  const poll = pollers.get(workspaceId)
  if (poll) clearInterval(poll)
  pollers.delete(workspaceId)
  stopCloudWakeup(workspaceId)
  const fullScan = fullScanners.get(workspaceId)
  if (fullScan) clearInterval(fullScan)
  fullScanners.delete(workspaceId)
  const timer = timers.get(workspaceId)
  if (timer) clearTimeout(timer)
  timers.delete(workspaceId)
  const retryTimer = retryTimers.get(workspaceId)
  if (retryTimer) clearTimeout(retryTimer)
  retryTimers.delete(workspaceId)
  retryAttempts.delete(workspaceId)
  if (releaseLock) {
    await running.get(workspaceId)?.catch(() => {})
    // A sync already in flight may have scheduled its retry timer while the
    // stop above was waiting for it. Clear again so disconnect/reconfigure
    // cannot leave a delayed pass behind.
    const retryAfterRun = retryTimers.get(workspaceId)
    if (retryAfterRun) clearTimeout(retryAfterRun)
    retryTimers.delete(workspaceId)
    retryAttempts.delete(workspaceId)
    const timerAfterRun = timers.get(workspaceId)
    if (timerAfterRun) clearTimeout(timerAfterRun)
    timers.delete(workspaceId)
    const lock = folderLocks.get(workspaceId)
    if (lock) {
      folderLocks.delete(workspaceId)
      await releaseFolderSyncLock(lock).catch(() => {})
    }
  }
}
async function startRuntime(workspaceId: string, folderPath: string): Promise<void> {
  if (starting.has(workspaceId)) return
  starting.add(workspaceId)
  try {
    await stopRuntime(workspaceId)
    fullScanRequests.delete(workspaceId)
    dirtyLocalPaths.delete(workspaceId)
    try {
      const watcher = watch(folderPath, { recursive: true }, (eventType, filename) => {
        if (filename === null) {
          directoryScanRequests.add(workspaceId)
          schedule(workspaceId, true)
          notifyLocalTreeChanged(workspaceId, null)
          return
        }
        const relative = path.posix.normalize(filename.toString().replaceAll('\\', '/'))
        if (
          !relative ||
          relative === '.' ||
          relative.startsWith('../') ||
          relative.startsWith('/')
        ) {
          schedule(workspaceId, true)
          notifyLocalTreeChanged(workspaceId, null)
          return
        }
        if (eventType === 'rename') directoryScanRequests.add(workspaceId)
        schedule(workspaceId, false, relative)
        notifyLocalTreeChanged(workspaceId, relative)
      })
      watcher.on('error', () => {
        watcher.close()
        watchers.delete(workspaceId)
        directoryScanRequests.add(workspaceId)
        schedule(workspaceId, true)
        notifyLocalTreeChanged(workspaceId, null)
      })
      watchers.set(workspaceId, watcher)
    } catch {
      /* Polling remains available if native recursive watching is unsupported. */
    }
    pollers.set(
      workspaceId,
      setInterval(() => schedule(workspaceId), REMOTE_CHANGE_POLL_INTERVAL_MS)
    )
    void startCloudWakeup(workspaceId)
    fullScanners.set(
      workspaceId,
      setInterval(() => {
        if (!running.has(workspaceId)) {
          directoryScanRequests.add(workspaceId)
          schedule(workspaceId, true)
        }
      }, FULL_LOCAL_SCAN_INTERVAL_MS)
    )
    schedule(workspaceId, true)
  } finally {
    starting.delete(workspaceId)
  }
}

export async function configurePkmsSyncBridge(
  workspaceId: string,
  folderPath: string,
  excludedPaths: string[] = []
): Promise<PkmsSyncBridgeStatus> {
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(workspaceId)) throw new Error('invalid_workspace_id')
  const root = await fs.realpath(path.resolve(folderPath))
  const stat = await fs.stat(root)
  if (!stat.isDirectory()) throw new Error('folder_required')
  const state = await load()
  const duplicate = Object.entries(state.configs).find(
    ([configuredWorkspaceId, config]) =>
      configuredWorkspaceId !== workspaceId && path.resolve(config.folderPath) === root
  )
  if (duplicate) throw new Error('local_folder_already_connected')
  if (state.configs[workspaceId] && path.resolve(state.configs[workspaceId].folderPath) !== root) {
    resetRootScopedState(state, workspaceId)
    appendStartupLog('pkms_sync_root_changed', {
      workspaceId,
      outcome: 'reset_local_replica_baseline'
    })
  }
  state.configs[workspaceId] = {
    folderPath: root,
    excludedPaths: excludedPaths
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 100)
  }
  state.baselines[workspaceId] ??= {}
  await save()
  setStatus(workspaceId, {
    enabled: true,
    folderPath: root,
    excludedPaths: state.configs[workspaceId].excludedPaths,
    state: 'syncing',
    error: null
  })
  await startRuntime(workspaceId, root)
  return status(workspaceId)
}
export async function disconnectPkmsSyncBridge(workspaceId: string): Promise<PkmsSyncBridgeStatus> {
  await stopRuntime(workspaceId)
  fullScanRequests.delete(workspaceId)
  dirtyLocalPaths.delete(workspaceId)
  const state = await load()
  delete state.configs[workspaceId]
  await save()
  return setStatus(workspaceId, {
    enabled: false,
    folderPath: null,
    excludedPaths: [],
    state: 'disconnected',
    progress: null,
    pendingFiles: 0,
    conflictFiles: [],
    error: null
  })
}
export async function getPkmsSyncBridgeStatus(workspaceId: string): Promise<PkmsSyncBridgeStatus> {
  const config = (await load()).configs[workspaceId]
  if (config && !pollers.has(workspaceId) && !starting.has(workspaceId)) {
    setStatus(workspaceId, {
      enabled: true,
      folderPath: config.folderPath,
      excludedPaths: config.excludedPaths ?? [],
      state: 'offline'
    })
    void startRuntime(workspaceId, config.folderPath).catch((error) =>
      setStatus(workspaceId, {
        state: 'error',
        error: error instanceof Error ? error.message : 'Could not start cloud sync.'
      })
    )
  }
  return status(workspaceId)
}
export async function getPkmsSyncBridgeTree(
  workspaceId: string,
  knownRevision = -1
): Promise<{ revision: number; files?: BridgeFile[] }> {
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(workspaceId)) throw new Error('invalid_workspace_id')
  const state = await load()
  const revision = state.remoteTreeVersions[workspaceId] ?? -1
  if (knownRevision === revision) return { revision }
  const baselines = state.baselines[workspaceId] ?? {}
  const pendingDeletes = Object.values(state.pendingDeletes[workspaceId] ?? {})
  return {
    revision,
    files: (state.remoteTrees[workspaceId] ?? [])
      .filter(
        (file) =>
          !pendingDeletes.some(
            (item) =>
              file.path === item.path ||
              (item.kind === 'folder' && file.path.startsWith(`${item.path}/`))
          )
      )
      .map((file) => ({
        ...file,
        upToDate:
          file.kind === 'markdown'
            ? baselines[file.path]?.fileId === file.id &&
              baselines[file.path]?.revision === file.revision
            : undefined
      }))
  }
}
export async function scanPkmsSyncBridge(workspaceId: string): Promise<PkmsSyncBridgeStatus> {
  fullScanRequests.add(workspaceId)
  directoryScanRequests.add(workspaceId)
  await syncOnce(workspaceId)
  return status(workspaceId)
}
export async function updatePkmsSyncBridgeExclusions(
  workspaceId: string,
  excludedPaths: string[]
): Promise<PkmsSyncBridgeStatus> {
  const state = await load()
  const config = state.configs[workspaceId]
  if (!config) throw new Error('sync_bridge_not_connected')
  config.excludedPaths = excludedPaths
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 100)
  await save()
  setStatus(workspaceId, { excludedPaths: config.excludedPaths })
  schedule(workspaceId, true)
  return status(workspaceId)
}

export async function startConfiguredPkmsSyncBridges(): Promise<void> {
  const config = await load()
  for (const [workspaceId, value] of Object.entries(config.configs)) {
    try {
      await fs.access(value.folderPath)
      setStatus(workspaceId, {
        enabled: true,
        folderPath: value.folderPath,
        excludedPaths: value.excludedPaths ?? [],
        state: 'syncing'
      })
      await startRuntime(workspaceId, value.folderPath)
    } catch {
      setStatus(workspaceId, {
        enabled: true,
        folderPath: value.folderPath,
        excludedPaths: value.excludedPaths ?? [],
        state: 'error',
        error: 'Connected folder is unavailable.'
      })
    }
  }
}
export async function stopPkmsSyncBridges(): Promise<void> {
  const workspaceIds = [
    ...new Set([
      ...watchers.keys(),
      ...pollers.keys(),
      ...fullScanners.keys(),
      ...folderLocks.keys()
    ])
  ]
  await Promise.all(workspaceIds.map((workspaceId) => stopRuntime(workspaceId, false)))
}
