import { useEffect } from 'react'
import { Actions, type Model, type TabNode, type TabSetNode } from 'flexlayout-react'
import { closeActivePaneTab } from '../layout/layoutActions'
import { dismissWorkspacePortals } from '../workspacePortalDismiss'
import { onClosePaneTabShortcut } from '../electron'
import { dispatchLocalBrowserZoom } from '../browser/browserZoom'
import type { WorkspaceSettingsTarget } from './useAppShellState'
import { readPaneGroupConfig, resolveActivePaneTab } from '../layout/layoutSession'
import { useWorkspaceStore } from '../store/workspaceStore'
import { registerShortcut } from '../shortcuts/shortcutRegistry'

const ZOOM_MIN = 0.5
const ZOOM_MAX = 2.5
const ZOOM_STEP = 0.1

function resolveFocusedTabSet(model: Model, focusedTabSetId?: string): TabSetNode | undefined {
  if (focusedTabSetId) {
    const node = model.getNodeById(focusedTabSetId)
    if (node?.getType() === 'tabset') return node as TabSetNode
  }
  return model.getActiveTabset()
}

function zoomActivePane(model: Model, focusedTabSetId: string | undefined, delta: number): void {
  const tabset = resolveFocusedTabSet(model, focusedTabSetId)
  const tabNode = tabset?.getSelectedNode()
  if (!tabNode || tabNode.getType() !== 'tab') return
  const config = readPaneGroupConfig(tabNode as TabNode)
  const activeItem = resolveActivePaneTab(config)
  if (activeItem?.kind === 'browser') return
  const nextZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, (config.zoom ?? 1) + delta))
  if (nextZoom === (config.zoom ?? 1)) return
  model.doAction(
    Actions.updateNodeAttributes(tabNode.getId(), { config: { ...config, zoom: nextZoom } })
  )
}

type ClosePaneDeps = {
  activeTabId: number
  getModel: (tabId: number) => Model | undefined
  bumpLayout: (tabId: number) => void
  appSettingsOpen: boolean
  settingsTarget: WorkspaceSettingsTarget | null
  dismissShellPortals: () => void
}

export function useAppShortcuts({
  activeTabId,
  getModel,
  bumpLayout,
  appSettingsOpen,
  settingsTarget,
  dismissShellPortals
}: ClosePaneDeps): void {
  const focusedTabSetId = useWorkspaceStore(
    (s) => s.focusedPaneGroupTabSetByWorkspaceTab[activeTabId]
  )

  useEffect(
    () =>
      onClosePaneTabShortcut(() => {
        if (appSettingsOpen) {
          dismissShellPortals()
          return
        }
        if (settingsTarget) {
          dismissShellPortals()
          return
        }
        const model = getModel(activeTabId)
        if (!model) return
        void closeActivePaneTab(model, focusedTabSetId).then((closed) => {
          if (closed) bumpLayout(activeTabId)
        })
      }),
    [
      activeTabId,
      bumpLayout,
      appSettingsOpen,
      settingsTarget,
      dismissShellPortals,
      getModel,
      focusedTabSetId
    ]
  )

  useEffect(() => {
    return registerShortcut({
      id: 'pane-zoom',
      scope: 'app',
      priority: 10,
      handle: (e) => {
        if (!(e.metaKey || e.ctrlKey)) return false
        if (e.key !== '=' && e.key !== '+' && e.key !== '-' && e.key !== '_') return false
        const model = getModel(activeTabId)
        if (!model) return false
        const tabset = resolveFocusedTabSet(model, focusedTabSetId)
        const tabNode = tabset?.getSelectedNode()
        if (!tabNode || tabNode.getType() !== 'tab') return false
        const config = readPaneGroupConfig(tabNode as TabNode)
        const activeItem = resolveActivePaneTab(config)
        if (activeItem?.kind === 'browser') {
          dispatchLocalBrowserZoom(e.key === '=' || e.key === '+' ? 'in' : 'out')
          return true
        }
        const grow = e.key === '=' || e.key === '+'
        zoomActivePane(model, focusedTabSetId, grow ? ZOOM_STEP : -ZOOM_STEP)
        return true
      },
    })
  }, [activeTabId, getModel, focusedTabSetId])
}

export function useDismissPortalsOnWorkspaceSwitch(
  activeTabId: number,
  dismissShellPortals: () => void
): void {
  useEffect(() => {
    dismissShellPortals()
    dismissWorkspacePortals()
  }, [activeTabId, dismissShellPortals])
}
