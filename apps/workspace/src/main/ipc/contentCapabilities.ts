import { dialog, ipcMain } from 'electron'
import { Workspace } from '../workspace'
import { toMediaUrlBrowsed } from '../mediaProtocol'
import { fetchDashboardEconomy, fetchDashboardWeather } from '../dashboardData'
import { model3dLog, readModel3dLogs } from '../model3d/model3dLog'
import { openEpubAbsolute } from '../epub'
import { getEbookState, saveEbookState } from '../ebookState'
import { hardwareSimManager } from '../hardwareSim'
import type { AssetOpenRequest } from '../../shared/model3d/types'

export function registerContentCapabilityIpc(getWorkspace: () => Workspace): void {
  ipcMain.handle('media:get-url-absolute', (_event, absolutePath: string) => toMediaUrlBrowsed(absolutePath))
  ipcMain.handle('dashboard:fetch-weather', async (_event, lat: number, lon: number) => {
    try { return await fetchDashboardWeather(lat, lon) }
    catch (err) { console.error('[dashboard] weather fetch failed:', err); throw err }
  })
  ipcMain.handle('dashboard:fetch-economy', async () => {
    try { return await fetchDashboardEconomy() }
    catch (err) { console.error('[dashboard] economy fetch failed:', err); throw err }
  })
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
  ipcMain.handle('engine:get-bundle-url', (_event, tabId: number, rel: string, entry?: string) => {
    try { return getWorkspace().resolveEngineBundle(tabId, rel, entry) }
    catch (err) { return { ok: false as const, error: err instanceof Error ? err.message : String(err) } }
  })
  ipcMain.handle('project:register-app', (_event, tabId: number, kind: string, rel: string, title?: string) => getWorkspace().registerProjectApp(tabId, kind, rel, title))
  ipcMain.handle('engine:export-godot-web', (_event, tabId: number, rel: string) => getWorkspace().exportGodotWeb(tabId, rel))
  ipcMain.handle('worldEngine:launch', async (_event, tabId: number, rel: string) => {
    const result = await getWorkspace().launchWorldEngine(tabId, rel)
    if (!result.ok) dialog.showErrorBox('World Engine', result.error ?? 'Failed to launch World Engine.')
    return result
  })
  ipcMain.handle('hardwareSim:start', (event, tabId: number, rel: string) => hardwareSimManager.start(
    getWorkspace().hardwareSimProjectPath(tabId, rel),
    (sessionId, state) => { if (!event.sender.isDestroyed()) event.sender.send('hardwareSim:runtime', { sessionId, state }) },
    (update) => { if (!event.sender.isDestroyed()) event.sender.send('hardwareSim:status', update) },
  ))
  ipcMain.handle('hardwareSim:reload', (_event, sessionId: number, reason: import('../../shared/hardwareSim').HardwareSimReloadReason) => hardwareSimManager.reload(sessionId, reason))
  ipcMain.handle('hardwareSim:set-button', (_event, sessionId: number, id: string, pressed: boolean) => hardwareSimManager.setButton(sessionId, id, pressed))
  ipcMain.handle('hardwareSim:stop', (_event, sessionId: number) => { hardwareSimManager.stop(sessionId) })
}
