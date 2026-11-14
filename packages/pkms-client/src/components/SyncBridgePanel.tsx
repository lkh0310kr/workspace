import { useCallback, useEffect, useState } from 'react'
import type { SyncStatus } from '../domain/types'
import { desktopBridge, type PkmsSyncBridgeStatus } from '../platform/desktopApi'

interface Props {
  workspaceId: string
  githubStatus: 'synced' | 'pending' | 'failed' | 'external-change'
  githubLastCommitAt?: string
  githubPendingFiles: number
  githubMessage?: string
  onResumeGithubBackup: () => Promise<SyncStatus>
  onOpenConflict?: (path: string) => void
  onClose?: () => void
}

function stateLabel(status: PkmsSyncBridgeStatus | null): string {
  if (!status) return 'Loading'
  if (status.state === 'syncing' && (!status.progress || status.progress.total === 0))
    return 'Checking'
  return (
    {
      disconnected: 'Not connected',
      syncing: 'Syncing',
      synced: 'Up to date',
      offline: 'Offline',
      error: 'Needs attention'
    } as const
  )[status.state]
}

export function SyncBridgePanel({
  workspaceId,
  githubStatus,
  githubLastCommitAt,
  githubPendingFiles,
  githubMessage,
  onResumeGithubBackup,
  onOpenConflict,
  onClose
}: Props) {
  const bridge = desktopBridge()
  const [status, setStatus] = useState<PkmsSyncBridgeStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [excludedDraft, setExcludedDraft] = useState('')
  const refresh = useCallback(async () => {
    if (!bridge) return
    try {
      setStatus(await bridge.syncBridgeStatus(workspaceId))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not read cloud sync status.')
    }
  }, [bridge, workspaceId])
  const excludedKey = status?.excludedPaths.join('\n') ?? ''
  useEffect(() => setExcludedDraft(excludedKey), [workspaceId, excludedKey])

  useEffect(() => {
    setStatus(null)
    void refresh()
    if (!bridge) return
    const timer = window.setInterval(() => void refresh(), 5000)
    return () => window.clearInterval(timer)
  }, [bridge, refresh])

  const run = async (action: () => Promise<PkmsSyncBridgeStatus>) => {
    setBusy(true)
    setMessage('')
    try {
      setStatus(await action())
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Cloud sync failed.')
    } finally {
      setBusy(false)
    }
  }
  const connect = async () => {
    if (!bridge) return
    setBusy(true)
    setMessage('')
    try {
      const result = await bridge.connectSyncBridge(workspaceId)
      if (!result.canceled) setStatus(result.status)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not connect the folder.')
    } finally {
      setBusy(false)
    }
  }
  const resumeGithubBackup = async () => {
    setBusy(true)
    setMessage('')
    try {
      const result = await onResumeGithubBackup()
      if (result.githubStatus === 'external-change')
        setMessage(result.message ?? 'The branch has overlapping changes. Backup remains paused.')
      else if (result.githubStatus === 'pending')
        setMessage('GitHub branch accepted. Pending files will be backed up automatically.')
      else if (result.githubStatus === 'synced') setMessage('GitHub backup is up to date.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not resume GitHub backup.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section
      className="sync-bridge-panel"
      aria-label={bridge ? 'Editing folder and cloud sync' : 'Cloud workspace and GitHub backup'}
    >
      <div className="sync-bridge-heading">
        <div>
          <span
            className={`sync-bridge-indicator sync-bridge-indicator--${bridge ? (status?.state ?? 'loading') : 'synced'}`}
          />{' '}
          <span className="eyebrow">Sync settings</span>
        </div>
        <div>
          <span className="sync-bridge-state">{bridge ? stateLabel(status) : 'Active'}</span>
          {onClose && (
            <button
              type="button"
              className="sync-bridge-close"
              aria-label="Close sync settings"
              onClick={onClose}
            >
              ×
            </button>
          )}
        </div>
      </div>
      {bridge ? (
        <>
          {status?.folderPath && (
            <div className="sync-bridge-path" title={status.folderPath}>
              {status.folderPath}
            </div>
          )}
          <div className="sync-bridge-meta">
            {status?.state === 'syncing'
              ? !status.progress || status.progress.total === 0
                ? 'Checking for local and cloud changes…'
                : (
                    {
                      scanning: 'Checking the local folder…',
                      'loading-remote-list': 'Checking cloud files…',
                      'downloading-remote-files': 'Downloading cloud files…',
                      reconciling: 'Syncing local and cloud files…'
                    } as const
                  )[status.stage ?? 'scanning']
              : status?.lastSyncedAt
                ? `Last synced ${new Date(status.lastSyncedAt).toLocaleTimeString()}`
                : status?.enabled
                  ? (
                      {
                        scanning: 'Checking the local folder…',
                        'loading-remote-list': 'Checking cloud files…',
                        'downloading-remote-files': 'Downloading cloud files…',
                        reconciling: 'Syncing local and cloud files…'
                      } as const
                    )[status.stage ?? 'scanning']
                  : 'PKMS and external editors use this same folder. Cloud sync keeps it up to date across devices; conflicting edits are saved as conflict copies.'}
            {status?.pendingFiles ? ` · ${status.pendingFiles} pending` : ''}
          </div>
          {(status?.error || message) && (
            <div className="sync-bridge-error">{status?.error ?? message}</div>
          )}
          {status?.conflictFiles.length ? (
            <div className="sync-bridge-conflicts">
              <strong>
                {status.conflictFiles.length} preserved conflict cop
                {status.conflictFiles.length === 1 ? 'y' : 'ies'}
              </strong>
              <span>Both versions are kept. Open a copy to review it.</span>
              <div className="sync-bridge-conflict-list">
                {status.conflictFiles.slice(0, 5).map((path) => (
                  <button
                    key={path}
                    type="button"
                    className="sync-bridge-conflict-link"
                    onClick={() => onOpenConflict?.(path)}
                    disabled={!onOpenConflict}
                  >
                    {path}
                  </button>
                ))}
                {status.conflictFiles.length > 5 && (
                  <span>and {status.conflictFiles.length - 5} more</span>
                )}
              </div>
            </div>
          ) : null}
          {status?.enabled && (
            <div className="sync-bridge-exclusions">
              <label htmlFor={`sync-bridge-exclusions-${workspaceId}`}>
                Exclude paths (one pattern per line)
              </label>
              <textarea
                id={`sync-bridge-exclusions-${workspaceId}`}
                value={excludedDraft}
                onChange={(event) => setExcludedDraft(event.target.value)}
                placeholder={'**/drafts/**\nprivate/*.md'}
                rows={2}
              />
              {excludedDraft !== excludedKey && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void run(() =>
                      bridge.updateSyncBridgeExclusions(workspaceId, excludedDraft.split('\n'))
                    )
                  }
                >
                  Save exclusions
                </button>
              )}
            </div>
          )}
          <div className="sync-bridge-actions">
            {status?.enabled ? (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void run(() => bridge.scanSyncBridge(workspaceId))}
                >
                  Sync with cloud now
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void run(() => bridge.disconnectSyncBridge(workspaceId))}
                >
                  Disconnect
                </button>
              </>
            ) : (
              <button type="button" disabled={busy} onClick={() => void connect()}>
                Choose editing folder
              </button>
            )}
          </div>
        </>
      ) : (
        <div className="sync-bridge-meta">
          Web and mobile edit this cloud workspace. Desktop sync keeps its editing folder up to
          date.
        </div>
      )}
      <div className="sync-bridge-github">
        <span>Optional GitHub backup</span>
        <strong className={`sync-bridge-github-state is-${githubStatus}`}>
          {githubStatus === 'external-change'
            ? 'External change'
            : githubStatus === 'failed'
              ? 'Needs attention'
              : githubStatus === 'pending'
                ? 'Pending'
                : 'Up to date'}
        </strong>
      </div>
      <div className="sync-bridge-meta">
        {githubStatus === 'synced' && githubLastCommitAt
          ? `Last commit ${new Date(githubLastCommitAt).toLocaleString()}`
          : githubPendingFiles
            ? `${githubPendingFiles} files awaiting backup`
            : (githubMessage ?? 'This is an optional GitHub copy. It does not control cloud sync.')}
      </div>
      {githubStatus === 'external-change' && (
        <div className="sync-bridge-actions">
          <button type="button" disabled={busy} onClick={() => void resumeGithubBackup()}>
            {busy ? 'Checking branch…' : 'Check and resume backup'}
          </button>
        </div>
      )}
    </section>
  )
}
