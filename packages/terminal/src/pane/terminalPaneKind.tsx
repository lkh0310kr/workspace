import type { AgentStatus } from '../agent/agent-title-core'
import { detectAgentStatusFromTitle, normalizeTerminalTitle } from '../agent/agent-title-status'
import { AgentIcon, getAgentLabel } from '../agent/ui/agent-catalog'
import { TerminalPane } from './TerminalPane'
import type { TerminalPaneHost } from './TerminalPaneHost'
import type { TuiAgent } from '../types/tuiAgent'

interface TerminalPaneItem {
  id: string
  kind: 'terminal'
  terminalId?: number
  title?: string
  terminalAgent?: TuiAgent
  terminalAgentStatus?: AgentStatus
}

type TerminalPaneItemShape = Omit<TerminalPaneItem, 'kind'> & { kind: string }

interface TerminalPaneRenderContext<TItem extends TerminalPaneItemShape> {
  workspaceTabId: number
  rootPath: string
  item: TItem
  chipShown: boolean
  active: boolean
  zoom: number
  updateItem: (patch: Partial<TerminalPaneItem>) => void
}

function terminalTabLabel(item: TerminalPaneItemShape): string {
  const title = item.title?.trim()
  if (title) {
    const normalized = normalizeTerminalTitle(title)
    if (normalized) return normalized
  }
  if (item.terminalAgent) return getAgentLabel(item.terminalAgent)
  return 'Terminal'
}

/** Builds Terminal's pane integration; Desktop supplies only PTY/runtime capabilities. */
export function createTerminalPaneKind<
  TItem extends TerminalPaneItemShape = TerminalPaneItemShape
>(
  runtimeHost: TerminalPaneHost
) {
  return {
    kind: 'terminal' as const,
    label: 'Terminal',
    icon: 'terminal',
    pickerEntries: [{ label: 'Terminal', icon: 'terminal' }],
    async createItem(id: string, _source?: Partial<TerminalPaneItemShape>, workspaceTabId?: number) {
      return {
        id,
        kind: 'terminal' as const,
        terminalId: await runtimeHost.spawnTerminal(120, 40, workspaceTabId)
      }
    },
    tabLabel: terminalTabLabel,
    renderTabIcon(item: TerminalPaneItemShape, size: number) {
      return item.terminalAgent ? <AgentIcon agent={item.terminalAgent} size={size - 2} /> : null
    },
    render(ctx: TerminalPaneRenderContext<TItem>) {
      return (
        <TerminalPane
          runtimeHost={runtimeHost}
          terminalId={ctx.item.terminalId ?? 0}
          workspaceTabId={ctx.workspaceTabId}
          paneTabId={ctx.item.id}
          rootPath={ctx.rootPath}
          visible={ctx.chipShown}
          active={ctx.active}
          zoom={ctx.zoom}
          terminalAgent={ctx.item.terminalAgent}
          onTerminalTabUpdate={(patch) => {
            const next: Partial<TerminalPaneItem> = {
              ...(patch.title !== undefined ? { title: patch.title } : {}),
              ...(patch.terminalAgent !== undefined
                ? { terminalAgent: patch.terminalAgent ?? undefined }
                : {})
            }
            if (patch.title !== undefined) {
              next.terminalAgentStatus = detectAgentStatusFromTitle(patch.title) ?? undefined
            }
            if (Object.keys(next).length > 0) ctx.updateItem(next)
          }}
        />
      )
    }
  }
}
