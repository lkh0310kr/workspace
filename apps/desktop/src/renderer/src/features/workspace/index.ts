export { SettingsDialog } from './SettingsDialog'
export { WorkspaceTabRail } from './WorkspaceTabRail'
export { useWorkspace } from './useWorkspace'
export { computeWorkspaceTabActivityStatus } from './useWorkspaceTabActivityStatus'
export { useWorkspaceTabHotkeys } from './useWorkspaceTabHotkeys'
export type { TabInfo, WorkspaceState } from './runtime/workspaceApi'
export {
  addTab,
  closeTab,
  getWorkspaceState,
  onWorkspaceUpdated,
  renameTab,
  reorderTabs,
  selectTab,
  setTabLayout,
  setTabRootPath
} from './runtime/workspaceApi'
