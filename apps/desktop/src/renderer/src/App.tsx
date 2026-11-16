import { AppSettingsDialog, AppTitlebar, LoadingWorkspace } from './features/app-shell'
import { AgentUsageStatusBar } from './features/agent-usage'
import { loadUsageMeterSettings, saveUsageMeterSettings } from './features/agent-usage/usageApi'
import { onHomeShortcut } from './features/app-shell/shellShortcuts'
import { onQuickOpenShortcut } from './features/editor/runtime/editorShortcuts'
import {
  DEFAULT_USAGE_METER_SETTINGS,
  type UsageMeterSettings
} from '../../shared/usage-meter-settings'
import { ErrorLogPanel, InteractionDebugPanel } from './features/diagnostics'
import { EditorToastViewport, QuickOpen } from './features/editor'
import { LayoutTabDropOverlay, WorkspaceLayoutHost } from './features/pane-system'
import { SettingsDialog } from './features/workspace'
import { HomeView } from '@workspace/home'
import { readSystemSummary } from './adapters/home/systemSummary'
import {
  useAppBootstrap,
  useAppShellState,
  useAppShortcuts,
  useDismissPortalsOnWorkspaceSwitch,
  useHtmlFullscreen
} from './features/app-shell'
import { useShortcutDispatcher } from './shortcuts/useShortcutDispatcher'
import {
  useLayoutHostCallbacks,
  useLayoutRevisions,
  useEnsureDefaultTerminals,
  useLayoutHostLifecycle,
  useSplitterDragOverlay,
  useTabChipWindowDrop,
  useVisibleWorkspaceTab
} from './features/pane-system'
import { useWorkspace, useWorkspaceTabHotkeys } from './features/workspace'
import { useWorkspaceScope } from './features/workspace/useWorkspaceScope'
import { switchToHome } from '@renderer/features/workspace/navigationApi'
import { applyThemePreference, setStoredThemePreference } from './theme'
import { useWorkspaceStore } from '@renderer/features/workspace/stateApi'
import type { Model, TabNode, TabSetNode } from 'flexlayout-react'
import { readPaneGroupConfig, resolveActivePaneTab } from './features/pane-system/layout/layoutSession'
import { openEditorFileInPaneGroup } from './features/editor'
import { setActiveTabInGroup } from './features/pane-system/layout/layoutActions'
import { useEffect, useCallback, useState } from 'react'
import { syncAgentPaneRegistryFromLayouts } from './adapters/terminal'
import 'flexlayout-react/style/combined.css'
import './assets/styles.css'
import '@workspace/editor/tree.css'

if (typeof document !== 'undefined' && window.api?.platform) {
  document.documentElement.dataset.platform = window.api.platform
  if (window.api.isWsl) document.documentElement.dataset.wsl = '1'
}

// Cmd+P's "open in the active pane" — mirrors PaneGroup's openOrSwitchToFile,
// but called from Quick Open (not scoped to one PaneGroup instance).
async function openFileInActivePane(
  model: Model,
  workspaceTabId: number,
  path: string,
  kind: 'code' | 'markdown' | 'viewer',
  bumpLayout: (tabId: number) => void,
  focusedTabSetId?: string
): Promise<void> {
  const focusedNode = focusedTabSetId ? model.getNodeById(focusedTabSetId) : undefined
  const tabset =
    focusedNode?.getType() === 'tabset' ? (focusedNode as TabSetNode) : model.getActiveTabset()
  const tabNode = tabset?.getSelectedNode()
  if (!tabNode || tabNode.getType() !== 'tab') return
  const nodeId = tabNode.getId()
  const config = readPaneGroupConfig(tabNode as TabNode)
  const existing = config.tabs.find((t) => t.filePath === path)
  if (existing) {
    setActiveTabInGroup(model, nodeId, existing.id)
    bumpLayout(workspaceTabId)
    return
  }
  const id = await openEditorFileInPaneGroup(model, nodeId, path, kind)
  if (!id) return
  setActiveTabInGroup(model, nodeId, id)
  bumpLayout(workspaceTabId)
}


export default function App() {
  const workspace = useWorkspace()
  const layoutRevisions = useLayoutRevisions()
  const storeGetModel = useWorkspaceStore((s) => s.getModel)
  const layoutCallbacks = useLayoutHostCallbacks()
  const { bumpLayout, ensureTerminal } = layoutCallbacks

  const shell = useAppShellState()
  const {
    settingsTarget,
    setSettingsTarget,
    appSettingsAnchor,
    setAppSettingsAnchor,
    appSettingsButtonRef,
    themePreference,
    setThemePreference,
    toggleAppSettings,
    dismissPortals
  } = shell

  const activeTabId = workspace?.active_tab_id ?? 0
  const { homeActive } = useWorkspaceScope()
  const visibleWorkspaceTabId = useVisibleWorkspaceTab()
  const activeModel = storeGetModel(activeTabId)
  const visibleModel = storeGetModel(visibleWorkspaceTabId)
  const focusedPaneGroupId = useWorkspaceStore(
    (s) => s.focusedPaneGroupTabSetByWorkspaceTab[visibleWorkspaceTabId]
  )
  const focusedPaneNode = focusedPaneGroupId
    ? visibleModel?.getNodeById(focusedPaneGroupId)
    : undefined
  const focusedPaneTabSet =
    focusedPaneNode?.getType() === 'tabset'
      ? (focusedPaneNode as TabSetNode)
      : visibleModel?.getActiveTabset()
  const focusedPaneNodeTab = focusedPaneTabSet?.getSelectedNode()
  const focusedPaneItem =
    focusedPaneNodeTab?.getType() === 'tab'
      ? resolveActivePaneTab(readPaneGroupConfig(focusedPaneNodeTab as TabNode))
      : undefined
  const editorPaneActive =
    focusedPaneItem?.kind === 'code' ||
    focusedPaneItem?.kind === 'markdown' ||
    focusedPaneItem?.kind === 'viewer'
  useEffect(() => window.api.shortcuts.setEditorPaneActive(editorPaneActive), [editorPaneActive])
  const [quickOpenOpen, setQuickOpenOpen] = useState(false)
  const openQuickOpenForFocusedPane = useCallback(() => {
    if (homeActive || !editorPaneActive) return
    setQuickOpenOpen(true)
  }, [editorPaneActive, homeActive])
  const [usageMeterSettings, setUsageMeterSettings] = useState<UsageMeterSettings>(
    DEFAULT_USAGE_METER_SETTINGS
  )

  useEffect(() => {
    loadUsageMeterSettings()
      .then(setUsageMeterSettings)
      .catch(() => {})
  }, [])

  const handleUsageMeterSettingsChange = useCallback((next: UsageMeterSettings) => {
    setUsageMeterSettings(next)
    void saveUsageMeterSettings(next)
  }, [])
  const htmlFullscreen = useHtmlFullscreen()

  useAppBootstrap()
  useShortcutDispatcher()
  useSplitterDragOverlay()
  useTabChipWindowDrop(activeTabId)
  useLayoutHostLifecycle(activeTabId)
  useEnsureDefaultTerminals(workspace?.tabs, layoutRevisions, ensureTerminal)
  useWorkspaceTabHotkeys(workspace?.tabs ?? [])
  useDismissPortalsOnWorkspaceSwitch(activeTabId, dismissPortals)
  useAppShortcuts({
    activeTabId,
    getModel: storeGetModel,
    bumpLayout,
    appSettingsOpen: appSettingsAnchor !== null,
    settingsTarget,
    dismissShellPortals: dismissPortals
  })

  useEffect(() => applyThemePreference(themePreference), [themePreference])

  useEffect(() => {
    if (!workspace?.tabs) return
    syncAgentPaneRegistryFromLayouts(workspace.tabs, storeGetModel)
  }, [workspace?.tabs, layoutRevisions, storeGetModel])

  useEffect(() => {
    const offHome = onHomeShortcut(() => switchToHome())
    const offQuickOpen = onQuickOpenShortcut(openQuickOpenForFocusedPane)
    function onKeyDown(e: KeyboardEvent) {
      if (e.defaultPrevented || !(e.metaKey || e.ctrlKey) || e.shiftKey) return
      if (e.key.toLowerCase() !== 'p') return
      e.preventDefault()
      e.stopImmediatePropagation()
      openQuickOpenForFocusedPane()
    }
    // Run before editor keymaps and embedded surfaces can consume the event.
    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      offHome()
      offQuickOpen()
      window.removeEventListener('keydown', onKeyDown, true)
    }
  }, [openQuickOpenForFocusedPane])

  const handleThemeChange = useCallback(
    (preference: typeof themePreference) => {
      setStoredThemePreference(preference)
      setThemePreference(preference)
    },
    [setThemePreference]
  )

  if (!workspace || !activeModel) {
    return <LoadingWorkspace />
  }

  return (
    <div className={`app-root${htmlFullscreen ? ' html-fullscreen' : ''}`}>
      <AppTitlebar
        appSettingsOpen={appSettingsAnchor !== null}
        appSettingsButtonRef={appSettingsButtonRef}
        onToggleAppSettings={(anchor) => toggleAppSettings(anchor)}
        workspaceTabs={workspace.tabs}
        activeWorkspaceTabId={visibleWorkspaceTabId}
        homeActive={homeActive}
        onOpenWorkspaceTabSettings={(tabId, anchorRect) => setSettingsTarget({ tabId, anchorRect })}
        getModel={storeGetModel}
        layoutRevisions={layoutRevisions}
      />
      <div className="app-shell">
        {homeActive ? <HomeView readSystemSummary={readSystemSummary} /> : null}
        <WorkspaceLayoutHost
          tabs={workspace.tabs}
          visibleWorkspaceTabId={visibleWorkspaceTabId}
          homeActive={homeActive}
          getModel={storeGetModel}
          {...layoutCallbacks}
        />
        {settingsTarget && (
          <SettingsDialog
            anchorRect={settingsTarget.anchorRect}
            onClose={() => setSettingsTarget(null)}
            tabId={settingsTarget.tabId}
            tabTitle={workspace.tabs.find((t) => t.id === settingsTarget.tabId)?.title ?? ''}
            rootPath={workspace.tabs.find((t) => t.id === settingsTarget.tabId)?.root_path ?? ''}
          />
        )}
        {appSettingsAnchor && (
          <AppSettingsDialog
            anchorRect={appSettingsAnchor}
            onClose={() => setAppSettingsAnchor(null)}
            themePreference={themePreference}
            onThemeChange={handleThemeChange}
            usageMeterSettings={usageMeterSettings}
            onUsageMeterSettingsChange={handleUsageMeterSettingsChange}
          />
        )}
      </div>
      {quickOpenOpen && !homeActive && (
        <QuickOpen
          tabId={visibleWorkspaceTabId}
          rootPath={
            workspace?.tabs.find((tab) => tab.id === visibleWorkspaceTabId)?.root_path ?? ''
          }
          onOpenFile={(path, kind) => {
            const model = storeGetModel(visibleWorkspaceTabId)
            if (model)
              void openFileInActivePane(
                model,
                visibleWorkspaceTabId,
                path,
                kind,
                bumpLayout,
                focusedPaneGroupId
              )
          }}
          onClose={() => setQuickOpenOpen(false)}
        />
      )}
      <AgentUsageStatusBar
        meterSettings={usageMeterSettings}
        onMeterSettingsChange={handleUsageMeterSettingsChange}
        onOpenAppSettings={() => toggleAppSettings()}
      />
      <LayoutTabDropOverlay />
      <ErrorLogPanel />
      <InteractionDebugPanel />
      <EditorToastViewport />
    </div>
  )
}
