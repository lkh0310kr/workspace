import { ipcMain } from 'electron'
import { Workspace } from '../workspace'
import { toMediaUrlBrowsed } from '../mediaProtocol'
import { model3dLog, readModel3dLogs } from '../model3d/model3dLog'
import { openEpubAbsolute } from '../epub'
import { getEbookState, saveEbookState } from '../ebookState'
import type { AssetOpenRequest } from '../../shared/model3d/types'

export function registerContentCapabilityIpc(getWorkspace: () => Workspace): void {
  ipcMain.handle('media:get-url-absolute', (_event, absolutePath: string) => toMediaUrlBrowsed(absolutePath))
  ipcMain.handle('model:open-preview', (_event, tabId: number, rel: string) => getWorkspace().openModelPreview(tabId, rel))
  ipcMain.handle('model:open-asset', (_event, request: AssetOpenRequest) => getWorkspace().openModelAsset(request))
  ipcMain.handle('model:import-job', (_event, jobId: string) => getWorkspace().getImportJob(jobId) ?? null)
  ipcMain.handle('model:get-url', (_event, tabId: number, rel: string) => getWorkspace().modelUrl(tabId, rel))
  ipcMain.handle('model:log', (_event, event: string, data?: Record<string, unknown>) => model3dLog(event, { source: 'renderer', ...(data ?? {}) }))
  ipcMain.handle('model:logs', (_event, limit?: number) => readModel3dLogs(limit ?? 200))
  ipcMain.handle('cad:open-file', (_event, tabId: number, rel: string) => getWorkspace().openCadViewerFile(tabId, rel))
  ipcMain.handle('epub:open', (_event, tabId: number, rel: string) => getWorkspace().openEpub(tabId, rel))
  ipcMain.handle('epub:open-absolute', (_event, absolutePath: string) => openEpubAbsolute(absolutePath))
  ipcMain.handle('epub:state-get', (_event, tabId: number | null, rel: string | null, absolutePath?: string) =>
    getEbookState(absolutePath || getWorkspace().resolveWorkspaceFile(tabId!, rel!)))
  ipcMain.handle('epub:state-save', (_event, tabId: number | null, rel: string | null, absolutePath: string | undefined, patch: import('../../shared/ebookState').EbookBookState) =>
    saveEbookState(absolutePath || getWorkspace().resolveWorkspaceFile(tabId!, rel!), patch))
}
