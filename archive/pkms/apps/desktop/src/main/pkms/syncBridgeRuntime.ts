import { watch, type FSWatcher } from 'node:fs'
import path from 'node:path'
import type { FolderSyncLock } from './folderSyncLock'

type RuntimeDependencies = {
  timers: Map<string, ReturnType<typeof setTimeout>>
  retryTimers: Map<string, ReturnType<typeof setTimeout>>
  retryAttempts: Map<string, number>
  pollers: Map<string, ReturnType<typeof setInterval>>
  fullScanners: Map<string, ReturnType<typeof setInterval>>
  watchers: Map<string, FSWatcher>
  running: Map<string, Promise<void>>
  folderLocks: Map<string, FolderSyncLock>
  starting: Set<string>
  runtimeGenerations: Map<string, number>
  fullScanRequests: Set<string>
  directoryScanRequests: Set<string>
  dirtyLocalPaths: Map<string, Set<string>>
  load: () => Promise<{ pendingPaths: Record<string, string[]> }>
  save: () => Promise<void>
  status: (workspaceId: string) => { state: string }
  setItemState: (workspaceId: string, relativePath: string, state: 'pending') => void
  isReservedSyncPath: (relativePath: string) => boolean
  notifyLocalTreeChanged: (workspaceId: string, relativePath: string | null) => void
  syncOnce: (workspaceId: string) => Promise<void>
  startCloudWakeup: (workspaceId: string) => void
  stopCloudWakeup: (workspaceId: string) => void
  releaseFolderSyncLock: (lock: FolderSyncLock) => Promise<void>
}
type SyncBridgeRuntime = {
  schedule: (workspaceId: string, fullScan?: boolean, localPath?: string) => void
  startRuntime: (workspaceId: string, folderPath: string) => Promise<void>
  stopRuntime: (
    workspaceId: string,
    releaseLock?: boolean,
    cancelStarting?: boolean
  ) => Promise<void>
}

const REMOTE_CHANGE_POLL_INTERVAL_MS = 5_000
const FULL_LOCAL_SCAN_INTERVAL_MS = 15 * 60_000

export function createSyncBridgeRuntime(deps: RuntimeDependencies): SyncBridgeRuntime {
  function schedule(workspaceId: string, fullScan = false, localPath?: string): void {
    if (fullScan) deps.fullScanRequests.add(workspaceId)
    if (localPath) {
      const pending = deps.dirtyLocalPaths.get(workspaceId) ?? new Set<string>()
      pending.add(localPath)
      deps.dirtyLocalPaths.set(workspaceId, pending)
      void deps
        .load()
        .then(async (state) => {
          const queued = new Set(state.pendingPaths[workspaceId] ?? [])
          queued.add(localPath)
          state.pendingPaths[workspaceId] = [...queued]
          await deps.save()
        })
        .catch(() => {})
      if (!deps.isReservedSyncPath(localPath)) deps.setItemState(workspaceId, localPath, 'pending')
    }
    if (deps.running.has(workspaceId) || deps.retryTimers.has(workspaceId)) return
    if (deps.status(workspaceId).state === 'error') return
    const previous = deps.timers.get(workspaceId)
    if (previous) clearTimeout(previous)
    // Coalesce atomic-save event bursts while keeping one file edit under a
    // second from reaching the cloud.
    deps.timers.set(
      workspaceId,
      setTimeout(() => {
        deps.timers.delete(workspaceId)
        void deps.syncOnce(workspaceId)
      }, 25)
    )
  }

  async function stopRuntime(
    workspaceId: string,
    releaseLock = true,
    cancelStarting = true
  ): Promise<void> {
    if (cancelStarting)
      deps.runtimeGenerations.set(workspaceId, (deps.runtimeGenerations.get(workspaceId) ?? 0) + 1)
    deps.watchers.get(workspaceId)?.close()
    deps.watchers.delete(workspaceId)
    const poll = deps.pollers.get(workspaceId)
    if (poll) clearInterval(poll)
    deps.pollers.delete(workspaceId)
    deps.stopCloudWakeup(workspaceId)
    const fullScan = deps.fullScanners.get(workspaceId)
    if (fullScan) clearInterval(fullScan)
    deps.fullScanners.delete(workspaceId)
    const timer = deps.timers.get(workspaceId)
    if (timer) clearTimeout(timer)
    deps.timers.delete(workspaceId)
    const retryTimer = deps.retryTimers.get(workspaceId)
    if (retryTimer) clearTimeout(retryTimer)
    deps.retryTimers.delete(workspaceId)
    deps.retryAttempts.delete(workspaceId)
    if (releaseLock) {
      await deps.running.get(workspaceId)?.catch(() => {})
      // A sync already in flight may have scheduled its retry timer while the
      // stop above was waiting for it. Clear again so disconnect/reconfigure
      // cannot leave a delayed pass behind.
      const retryAfterRun = deps.retryTimers.get(workspaceId)
      if (retryAfterRun) clearTimeout(retryAfterRun)
      deps.retryTimers.delete(workspaceId)
      deps.retryAttempts.delete(workspaceId)
      const timerAfterRun = deps.timers.get(workspaceId)
      if (timerAfterRun) clearTimeout(timerAfterRun)
      deps.timers.delete(workspaceId)
      const lock = deps.folderLocks.get(workspaceId)
      if (lock) {
        deps.folderLocks.delete(workspaceId)
        await deps.releaseFolderSyncLock(lock).catch(() => {})
      }
    }
  }

  async function startRuntime(workspaceId: string, folderPath: string): Promise<void> {
    if (deps.starting.has(workspaceId)) return
    const generation = (deps.runtimeGenerations.get(workspaceId) ?? 0) + 1
    deps.runtimeGenerations.set(workspaceId, generation)
    deps.starting.add(workspaceId)
    try {
      await stopRuntime(workspaceId, true, false)
      if (deps.runtimeGenerations.get(workspaceId) !== generation) return
      deps.fullScanRequests.delete(workspaceId)
      deps.dirtyLocalPaths.delete(workspaceId)
      try {
        const watcher = watch(folderPath, { recursive: true }, (eventType, filename) => {
          if (filename === null) {
            deps.directoryScanRequests.add(workspaceId)
            schedule(workspaceId, true)
            deps.notifyLocalTreeChanged(workspaceId, null)
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
            deps.notifyLocalTreeChanged(workspaceId, null)
            return
          }
          if (eventType === 'rename') deps.directoryScanRequests.add(workspaceId)
          schedule(workspaceId, false, relative)
          deps.notifyLocalTreeChanged(workspaceId, relative)
        })
        watcher.on('error', () => {
          watcher.close()
          deps.watchers.delete(workspaceId)
          deps.directoryScanRequests.add(workspaceId)
          schedule(workspaceId, true)
          deps.notifyLocalTreeChanged(workspaceId, null)
        })
        deps.watchers.set(workspaceId, watcher)
      } catch {
        /* Polling remains available if native recursive watching is unsupported. */
      }
      deps.pollers.set(
        workspaceId,
        setInterval(() => schedule(workspaceId), REMOTE_CHANGE_POLL_INTERVAL_MS)
      )
      deps.startCloudWakeup(workspaceId)
      deps.fullScanners.set(
        workspaceId,
        setInterval(() => {
          if (!deps.running.has(workspaceId)) {
            deps.directoryScanRequests.add(workspaceId)
            schedule(workspaceId, true)
          }
        }, FULL_LOCAL_SCAN_INTERVAL_MS)
      )
      schedule(workspaceId, true)
    } finally {
      deps.starting.delete(workspaceId)
    }
  }

  return { schedule, startRuntime, stopRuntime }
}
