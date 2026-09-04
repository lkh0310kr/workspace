import { useEffect } from 'react'
import { Actions, type Model, type TabNode, type TabSetNode } from 'flexlayout-react'
import { closeActivePaneTab } from '../layout/layoutActions'
import { dismissWorkspacePortals } from '../workspacePortalDismiss'
import { onClosePaneTabShortcut } from '../electron'
import { dispatchLocalBrowserZoom } from '../browser/browserZoom'
import type { WorkspaceSettingsTarget } from './useAppShellState'
import type { PaneGroupConfig } from '../layout/paneTypes'
import { useWorkspaceStore } from '../store/workspaceStore'

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
  const config = ((tabNode as TabNode).getConfig() ?? {}) as PaneGroupConfig
  const activeItem = config.tabs.find((t) => t.id === config.activeTabId)
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
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey)) return
      if (e.key !== '=' && e.key !== '+' && e.key !== '-' && e.key !== '_') return
      const model = getModel(activeTabId)
      if (!model) return
      const tabset = resolveFocusedTabSet(model, focusedTabSetId)
      const tabNode = tabset?.getSelectedNode()
      if (!tabNode || tabNode.getType() !== 'tab') return
      const config = ((tabNode as TabNode).getConfig() ?? {}) as PaneGroupConfig
      const activeItem = config.tabs.find((t) => t.id === config.activeTabId)
      if (activeItem?.kind === 'browser') {
        e.preventDefault()
        dispatchLocalBrowserZoom(e.key === '=' || e.key === '+' ? 'in' : 'out')
        return
      }
      e.preventDefault()
      const grow = e.key === '=' || e.key === '+'
      zoomActivePane(model, focusedTabSetId, grow ? ZOOM_STEP : -ZOOM_STEP)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
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
