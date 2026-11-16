import { ipcMain } from 'electron'
import type { Workspace } from '../workspace'
import { resolveUserSelectedRootPath } from '../wslPaths'
import { saveConfig } from '../persistence'
import { registerWorkspaceSearchIpc } from './workspaceSearch'

function assertExpectedTabRoot(
  workspace: Workspace,
  tabId: number,
  expectedRootPath?: string
): void {
  if (expectedRootPath !== undefined) workspace.assertTabRoot(tabId, expectedRootPath)
}

/** Register tab, filesystem, search, and workspace-scoped media IPC handlers. */
export function registerWorkspaceIpc(getWorkspace: () => Workspace, persist: () => void): void {
  ipcMain.handle('workspace:get-state', () => getWorkspace().state())
  ipcMain.handle('workspace:add-tab', () => {
    const id = getWorkspace().addTab()
    persist()
    return id
  })
  ipcMain.handle('workspace:close-tab', (_event, tabId: number) => {
    getWorkspace().closeTab(tabId)
    persist()
  })
  ipcMain.handle('workspace:select-tab', (_event, tabId: number) => {
    getWorkspace().selectTab(tabId)
    persist()
  })
  ipcMain.handle('workspace:rename-tab', (_event, tabId: number, title: string) => {
    getWorkspace().renameTab(tabId, title)
    persist()
  })
  ipcMain.handle('workspace:reorder-tabs', (_event, orderedIds: number[]) => {
    getWorkspace().reorderTabs(orderedIds)
    persist()
  })
  ipcMain.handle('workspace:set-tab-layout', (_event, tabId: number, layoutJson: string) => {
    getWorkspace().setTabLayout(tabId, layoutJson)
    persist()
  })
  ipcMain.handle('workspace:set-tab-root-path', (_event, tabId: number, rootPath: string) => {
    const workspace = getWorkspace()
    const nativeRoot = resolveUserSelectedRootPath(rootPath)
    workspace.setTabRootPath(tabId, nativeRoot)
    if (tabId === workspace.state().activeTabId) {
      workspace.defaultRootPath = nativeRoot
      saveConfig({ rootPath: nativeRoot })
    }
    persist()
    return workspace.state()
  })

  ipcMain.handle('fs:list-dir', (_event, tabId: number, rel: string, expectedRootPath?: string) => {
    const workspace = getWorkspace()
    assertExpectedTabRoot(workspace, tabId, expectedRootPath)
    return workspace.listDir(tabId, rel)
  })
  ipcMain.handle(
    'fs:read-file',
    (_event, tabId: number, rel: string, expectedRootPath?: string) => {
      const workspace = getWorkspace()
      assertExpectedTabRoot(workspace, tabId, expectedRootPath)
      return workspace.readFile(tabId, rel)
    }
  )
  ipcMain.handle('fs:read-file-binary-preview', (_event, tabId: number, rel: string) =>
    getWorkspace().readFileBinaryPreview(tabId, rel)
  )
  ipcMain.handle(
    'fs:write-file',
    (_event, tabId: number, rel: string, content: string, expectedRootPath?: string) => {
      const workspace = getWorkspace()
      assertExpectedTabRoot(workspace, tabId, expectedRootPath)
      return workspace.writeFile(tabId, rel, content)
    }
  )
  ipcMain.handle(
    'fs:write-file-if-unchanged',
    (
      _event,
      tabId: number,
      rel: string,
      expected: string,
      content: string,
      expectedRootPath?: string
    ) => {
      const workspace = getWorkspace()
      assertExpectedTabRoot(workspace, tabId, expectedRootPath)
      return workspace.writeFileIfUnchanged(tabId, rel, expected, content)
    }
  )
  ipcMain.handle(
    'fs:create-dir',
    (_event, tabId: number, rel: string, expectedRootPath?: string) => {
      const workspace = getWorkspace()
      assertExpectedTabRoot(workspace, tabId, expectedRootPath)
      return workspace.createDir(tabId, rel)
    }
  )
  ipcMain.handle(
    'fs:delete-path',
    (_event, tabId: number, rel: string, expectedRootPath?: string) => {
      const workspace = getWorkspace()
      assertExpectedTabRoot(workspace, tabId, expectedRootPath)
      return workspace.deletePath(tabId, rel)
    }
  )
  ipcMain.handle(
    'fs:rename-path',
    (_event, tabId: number, fromRel: string, toRel: string, expectedRootPath?: string) => {
      const workspace = getWorkspace()
      assertExpectedTabRoot(workspace, tabId, expectedRootPath)
      return workspace.renamePath(tabId, fromRel, toRel)
    }
  )

  registerWorkspaceSearchIpc(getWorkspace)
  ipcMain.handle('fs:list-all-files', (_event, tabId: number, expectedRootPath?: string) => {
    const workspace = getWorkspace()
    assertExpectedTabRoot(workspace, tabId, expectedRootPath)
    return workspace.listAllFiles(tabId)
  })
  ipcMain.handle(
    'media:get-url',
    (_event, tabId: number, rel: string, expectedRootPath?: string) => {
      const workspace = getWorkspace()
      assertExpectedTabRoot(workspace, tabId, expectedRootPath)
      return workspace.mediaUrl(tabId, rel)
    }
  )
}
