// Port of ref-proj/orca/src/renderer/src/lib/worktree-status.ts (workspace tab chips).

import { containsAgentSpinnerGlyph } from '../../../shared/agent/agent-title-core'
import { isSyntheticAgentPermissionTitle } from '../../../shared/synthetic-agent-permission-title'
import type { TuiAgent } from '../../../shared/agent/tui-agent'
import { resolveExplicitTerminalTitleAgentType } from '../../../shared/agent/terminal-title-agent-type'
import type { LiveAgentWorkspaceTabStatus } from './workspace-activity-state'
import { classifyTitleActivity } from './pane-agent-evidence'

export type WorkspaceTabStatus =
  | 'active'
  | 'working'
  | 'monitoring'
  | 'permission'
  | 'failed'
  | 'interrupted'
  | 'unconfirmed'
  | 'done'
  | 'inactive'

export type WorkspaceTerminalPaneSnapshot = {
  paneTabId: string
  title?: string
  terminalAgent?: TuiAgent
  terminalId?: number
  live: boolean
}

const STATUS_LABELS: Record<WorkspaceTabStatus, string> = {
  active: 'Active',
  working: 'Working',
  monitoring: 'Monitoring background tasks',
  permission: 'Needs permission',
  failed: 'Failed',
  interrupted: 'Interrupted',
  unconfirmed: "Couldn't confirm",
  done: 'Done',
  inactive: 'Inactive',
}

type HeuristicOptions = {
  liveAgentStatus?: LiveAgentWorkspaceTabStatus
  /** Pane tab ids with a fresh explicit agent-status row (hook or title-derived). */
  agentStatusCoveredPaneTabIds?: ReadonlySet<string>
  /** Stale explicit rows — suppress synthetic permission titles only. */
  stalePaneTabIds?: ReadonlySet<string>
  runtimePaneTitlesByPaneTabId?: Record<string, string>
}

export function getWorkspaceTabStatus(
  terminalPanes: readonly WorkspaceTerminalPaneSnapshot[],
  browserPaneCount: number,
  options: HeuristicOptions = {},
): WorkspaceTabStatus {
  const livePanes = terminalPanes.filter((p) => p.live)

  const hasStatus = (status: 'permission' | 'working'): boolean =>
    livePanes.some((pane) => paneHasStatus(pane, status, options))

  if (options.liveAgentStatus === 'permission' || hasStatus('permission')) {
    return 'permission'
  }
  if (options.liveAgentStatus === 'working' || hasStatus('working')) {
    return 'working'
  }
  if (options.liveAgentStatus === 'monitoring') {
    return 'monitoring'
  }
  if (livePanes.length > 0 || browserPaneCount > 0) {
    return 'active'
  }
  return 'inactive'
}

function paneHasStatus(
  pane: WorkspaceTerminalPaneSnapshot,
  status: 'permission' | 'working',
  options: HeuristicOptions,
): boolean {
  const covered = options.agentStatusCoveredPaneTabIds
  const runtimeTitle = options.runtimePaneTitlesByPaneTabId?.[pane.paneTabId]
  const title = runtimeTitle ?? pane.title ?? ''
  const suppressTitle =
    status === 'permission'
      ? suppressingPaneForPermission(pane.paneTabId, title, options)
      : covered?.has(pane.paneTabId) ?? false
  if (title) {
    if (suppressTitle) {
      return false
    }
    if (
      classifyTitleActivity(title) === status &&
      titleStatusIsAgentAttributable(title, pane.terminalAgent)
    ) {
      return true
    }
    return false
  }
  if (
    (status === 'permission'
      ? suppressingPaneForPermission(pane.paneTabId, pane.title ?? '', options)
      : covered?.has(pane.paneTabId)) ??
    false
  ) {
    return false
  }
  return (
    classifyTitleActivity(pane.title ?? '') === status &&
    titleStatusIsAgentAttributable(pane.title ?? '', pane.terminalAgent)
  )
}

function suppressingPaneForPermission(
  paneTabId: string,
  title: string,
  options: HeuristicOptions,
): boolean {
  const covered = options.agentStatusCoveredPaneTabIds?.has(paneTabId) ?? false
  const stale = options.stalePaneTabIds?.has(paneTabId) ?? false
  if (isSyntheticAgentPermissionTitle(title)) {
    return covered || stale
  }
  return covered
}

function titleStatusIsAgentAttributable(title: string, launchAgent?: TuiAgent | null): boolean {
  if (resolveExplicitTerminalTitleAgentType(title) !== null) {
    return true
  }
  return containsAgentSpinnerGlyph(title) && Boolean(launchAgent)
}

export function getWorkspaceTabStatusLabel(status: WorkspaceTabStatus): string {
  return STATUS_LABELS[status]
}

export function resolveWorkspaceTabStatus(args: {
  terminalPanes: readonly WorkspaceTerminalPaneSnapshot[]
  browserPaneCount: number
  runtimePaneTitlesByPaneTabId?: Record<string, string>
  agentStatusCoveredPaneTabIds?: ReadonlySet<string>
  stalePaneTabIds?: ReadonlySet<string>
  hasPermission: boolean
  hasLiveWorking: boolean
  hasLiveMonitoring?: boolean
  hasFailed?: boolean
  hasInterrupted?: boolean
  hasUnconfirmed?: boolean
  hasLiveDone: boolean
  hasRetainedDone: boolean
  hasRetainedFailed?: boolean
}): WorkspaceTabStatus {
  const heuristic = getWorkspaceTabStatus(args.terminalPanes, args.browserPaneCount, {
    agentStatusCoveredPaneTabIds: args.agentStatusCoveredPaneTabIds,
    stalePaneTabIds: args.stalePaneTabIds,
    runtimePaneTitlesByPaneTabId: args.runtimePaneTitlesByPaneTabId,
  })
  if (args.hasPermission) return 'permission'
  if (heuristic === 'permission') return 'permission'
  if (args.hasFailed) return 'failed'
  if (args.hasLiveWorking || heuristic === 'working') return 'working'
  if (args.hasLiveMonitoring || heuristic === 'monitoring') return 'monitoring'
  if (args.hasRetainedFailed) return 'failed'
  if (args.hasUnconfirmed) return 'unconfirmed'
  if (args.hasInterrupted) return 'interrupted'
  if (args.hasLiveDone || args.hasRetainedDone) return 'done'
  return heuristic
}
