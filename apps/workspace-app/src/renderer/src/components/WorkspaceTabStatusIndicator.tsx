// Port of ref-proj/orca StatusIndicator.tsx (workspace tab chip subset).

import type { WorkspaceTabStatus } from '../lib/workspace-tab-status'
import { getWorkspaceTabStatusLabel } from '../lib/workspace-tab-status'

type Props = {
  status: WorkspaceTabStatus
}

export function WorkspaceTabStatusIndicator({ status }: Props) {
  const label = getWorkspaceTabStatusLabel(status)
  if (status === 'working') {
    return (
      <span
        className="workspace-tab-rail-agent-indicator workspace-tab-rail-agent-indicator--working"
        title={label}
        aria-label={label}
      />
    )
  }
  if (status === 'monitoring') {
    return (
      <span
        className="workspace-tab-rail-agent-indicator workspace-tab-rail-agent-indicator--monitoring"
        title={label}
        aria-label={label}
      />
    )
  }
  if (status === 'permission') {
    return (
      <span
        className="workspace-tab-rail-agent-indicator workspace-tab-rail-agent-indicator--permission"
        title={label}
        aria-label={label}
      />
    )
  }
  if (status === 'failed') {
    return (
      <span
        className="workspace-tab-rail-agent-indicator workspace-tab-rail-agent-indicator--failed"
        title={label}
        aria-label={label}
      />
    )
  }
  if (status === 'interrupted' || status === 'unconfirmed') {
    return (
      <span
        className="workspace-tab-rail-agent-indicator workspace-tab-rail-agent-indicator--muted"
        title={label}
        aria-label={label}
      />
    )
  }
  const dotClass =
    status === 'done' || status === 'active'
      ? 'workspace-tab-rail-agent-indicator--idle'
      : 'workspace-tab-rail-agent-indicator--inactive'
  return (
    <span className={`workspace-tab-rail-agent-indicator ${dotClass}`} title={label} aria-label={label} />
  )
}
