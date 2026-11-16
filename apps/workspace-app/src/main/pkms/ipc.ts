import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import type { PkmsRequestOptions } from '../../shared/pkmsClient'
import {
  fetchPkmsAsset,
  parsePkmsVerificationUrl,
  parseServiceOAuthUrl,
  requestPkmsApi,
  requestWorkspaceHomeApi
} from './api'
import {
  configurePkmsSyncBridge,
  createPkmsLocalItem,
  deletePkmsLocalItems,
  disconnectPkmsSyncBridge,
  getPkmsSyncBridgeStatus,
  getPkmsSyncBridgeTree,
  getPkmsLocalFile,
  listPkmsLocalDirectory,
  movePkmsLocalItems,
  readPkmsLocalMarkdown,
  renamePkmsLocalItem,
  resolvePkmsLocalItemAbsolutePath,
  scanPkmsSyncBridge,
  startConfiguredPkmsSyncBridges,
  updatePkmsSyncBridgeExclusions,
  writePkmsLocalMarkdown
} from './syncBridge'
import { appendStartupLog } from '../startupLog'
import {
  googleDriveDesktopOAuth,
  googleDriveDesktopOAuthConfiguration
} from './googleDriveDesktopOAuthRuntime'
import { GoogleDriveDesktopWorkspaceService } from './googleDriveDesktopWorkspace'

let googleDriveWorkspaceService: GoogleDriveDesktopWorkspaceService | undefined

function driveWorkspaceService(): GoogleDriveDesktopWorkspaceService {
  googleDriveWorkspaceService ??= new GoogleDriveDesktopWorkspaceService()
  return googleDriveWorkspaceService
}

function assertDriveId(value: string): void {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(value))
    throw new Error('invalid_google_drive_id')
}

function assertTrustedSender(event: Electron.IpcMainInvokeEvent): void {
  const rawUrl = event.senderFrame?.url
  if (!rawUrl) throw new Error('untrusted_renderer')
  const url = new URL(rawUrl)
  const trusted =
    url.protocol === 'file:' ||
    (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))
  if (!trusted) throw new Error('untrusted_renderer')
}

export function registerPkmsIpc(): void {
  void startConfiguredPkmsSyncBridges()
  ipcMain.handle('pkms-google-drive:oauth:status', (event) => {
    assertTrustedSender(event)
    return googleDriveDesktopOAuthConfiguration()
  })
  ipcMain.handle('pkms-google-drive:oauth:connect', async (event) => {
    assertTrustedSender(event)
    await googleDriveDesktopOAuth.connect()
    return googleDriveDesktopOAuthConfiguration()
  })
  ipcMain.handle('pkms-google-drive:oauth:disconnect', (event) => {
    assertTrustedSender(event)
    googleDriveDesktopOAuth.disconnect()
  })
  ipcMain.handle('pkms-google-drive:workspace:roots', (event) => {
    assertTrustedSender(event)
    return driveWorkspaceService().listRoots()
  })
  ipcMain.handle('pkms-google-drive:workspace:create-root', (event) => {
    assertTrustedSender(event)
    return driveWorkspaceService().createWorkspace()
  })
  ipcMain.handle('pkms-google-drive:workspace:connect', (event, rootId: string) => {
    assertTrustedSender(event)
    assertDriveId(rootId)
    return driveWorkspaceService().connect(rootId)
  })
  ipcMain.handle(
    'pkms-google-drive:workspace:directory',
    (event, rootId: string, parentItemId: string | null) => {
      assertTrustedSender(event)
      assertDriveId(rootId)
      if (parentItemId !== null) assertDriveId(parentItemId)
      return driveWorkspaceService().listDirectory(rootId, parentItemId)
    }
  )
  ipcMain.handle(
    'pkms-google-drive:workspace:search',
    (event, rootId: string, query: string, pageToken?: string) => {
      assertTrustedSender(event)
      assertDriveId(rootId)
      if (pageToken !== undefined && (typeof pageToken !== 'string' || pageToken.length > 4096))
        throw new Error('invalid_google_drive_page_token')
      return driveWorkspaceService().search(rootId, query, pageToken)
    }
  )
  ipcMain.handle(
    'pkms-google-drive:workspace:open-markdown',
    (
      event,
      rootId: string,
      fileId: string,
      knownEntry?: import('@pkms/google-drive').GoogleDriveWorkspaceEntry
    ) => {
      assertTrustedSender(event)
      assertDriveId(rootId)
      assertDriveId(fileId)
      if (knownEntry && (knownEntry.id !== fileId || typeof knownEntry.path !== 'string'))
        throw new Error('invalid_google_drive_item')
      return driveWorkspaceService().openMarkdown(rootId, fileId, knownEntry)
    }
  )
  ipcMain.handle(
    'pkms-google-drive:workspace:save-markdown',
    (event, rootId: string, fileId: string, text: string, flushSync?: boolean) => {
      assertTrustedSender(event)
      assertDriveId(rootId)
      assertDriveId(fileId)
      if (typeof text !== 'string') throw new Error('invalid_markdown_content')
      if (flushSync !== undefined && typeof flushSync !== 'boolean')
        throw new Error('invalid_sync_option')
      return driveWorkspaceService().saveMarkdown(rootId, fileId, text, flushSync)
    }
  )
  ipcMain.handle('pkms-google-drive:workspace:sync', (event, rootId: string) => {
    assertTrustedSender(event)
    assertDriveId(rootId)
    return driveWorkspaceService().sync(rootId)
  })
  ipcMain.handle(
    'pkms-google-drive:workspace:create',
    (
      event,
      rootId: string,
      parentPath: string,
      kind: 'markdown' | 'folder',
      name: string,
      itemId?: string,
      parentItemId?: string
    ) => {
      assertTrustedSender(event)
      assertDriveId(rootId)
      if (
        typeof parentPath !== 'string' ||
        !['markdown', 'folder'].includes(kind) ||
        typeof name !== 'string' ||
        !name.trim()
      )
        throw new Error('invalid_google_drive_item')
      if (itemId !== undefined) assertDriveId(itemId)
      if (parentItemId !== undefined) assertDriveId(parentItemId)
      return driveWorkspaceService().createItem(
        rootId,
        parentPath,
        kind,
        name.trim(),
        itemId,
        parentItemId
      )
    }
  )
  ipcMain.handle(
    'pkms-google-drive:workspace:rename',
    (
      event,
      rootId: string,
      fileId: string,
      name: string,
      currentEntry?: import('@pkms/google-drive').GoogleDriveWorkspaceEntry
    ) => {
      assertTrustedSender(event)
      assertDriveId(rootId)
      assertDriveId(fileId)
      if (typeof name !== 'string' || !name.trim()) throw new Error('invalid_google_drive_name')
      if (currentEntry && (currentEntry.id !== fileId || typeof currentEntry.path !== 'string'))
        throw new Error('invalid_google_drive_item')
      return driveWorkspaceService().rename(rootId, fileId, name.trim(), currentEntry)
    }
  )
  ipcMain.handle('pkms-google-drive:workspace:trash', (event, rootId: string, fileId: string) => {
    assertTrustedSender(event)
    assertDriveId(rootId)
    assertDriveId(fileId)
    return driveWorkspaceService().trash(rootId, fileId)
  })
  ipcMain.handle(
    'pkms-google-drive:workspace:move',
    (event, rootId: string, fileIds: string[], targetPath: string) => {
      assertTrustedSender(event)
      assertDriveId(rootId)
      if (!Array.isArray(fileIds) || fileIds.length > 100)
        throw new Error('invalid_google_drive_items')
      fileIds.forEach(assertDriveId)
      if (
        typeof targetPath !== 'string' ||
        (targetPath !== '' &&
          targetPath.split('/').some((part) => !part || part === '.' || part === '..'))
      )
        throw new Error('invalid_google_drive_path')
      return driveWorkspaceService().move(rootId, fileIds, targetPath)
    }
  )
  ipcMain.handle('pkms-google-drive:workspace:disconnect', (event, rootId: string) => {
    assertTrustedSender(event)
    assertDriveId(rootId)
    return driveWorkspaceService().disconnect(rootId)
  })
  ipcMain.handle('pkms:request', (event, pathName: string, options: PkmsRequestOptions) => {
    assertTrustedSender(event)
    return requestPkmsApi(pathName, options)
  })
  ipcMain.handle('pkms:fetch-asset', (event, pathName: string) => {
    assertTrustedSender(event)
    return fetchPkmsAsset(pathName)
  })
  ipcMain.handle('pkms:sync-bridge:status', (event, workspaceId: string) => {
    assertTrustedSender(event)
    return getPkmsSyncBridgeStatus(workspaceId)
  })
  ipcMain.handle('pkms:sync-bridge:tree', (event, workspaceId: string, knownRevision?: number) => {
    assertTrustedSender(event)
    return getPkmsSyncBridgeTree(workspaceId, knownRevision)
  })
  ipcMain.handle('pkms:sync-bridge:connect', async (event, workspaceId: string) => {
    assertTrustedSender(event)
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(workspaceId)) throw new Error('invalid_workspace_id')
    const owner = BrowserWindow.fromWebContents(event.sender)
    const options = {
      properties: ['openDirectory', 'createDirectory'] as Array<'openDirectory' | 'createDirectory'>
    }
    const picked = owner
      ? await dialog.showOpenDialog(owner, options)
      : await dialog.showOpenDialog(options)
    if (picked.canceled || !picked.filePaths[0]) return { canceled: true }
    return {
      canceled: false,
      status: await configurePkmsSyncBridge(workspaceId, picked.filePaths[0])
    }
  })
  ipcMain.handle('pkms:sync-bridge:disconnect', (event, workspaceId: string) => {
    assertTrustedSender(event)
    return disconnectPkmsSyncBridge(workspaceId)
  })
  ipcMain.handle('pkms:sync-bridge:scan', (event, workspaceId: string) => {
    assertTrustedSender(event)
    return scanPkmsSyncBridge(workspaceId)
  })
  ipcMain.handle('pkms:sync-bridge:exclusions', (event, workspaceId: string, paths: string[]) => {
    assertTrustedSender(event)
    if (!Array.isArray(paths) || paths.some((item) => typeof item !== 'string'))
      throw new Error('invalid_exclusions')
    return updatePkmsSyncBridgeExclusions(workspaceId, paths)
  })
  ipcMain.handle(
    'pkms:local-file:read',
    async (event, workspaceId: string, relativePath: string) => {
      assertTrustedSender(event)
      return readPkmsLocalMarkdown(workspaceId, relativePath)
    }
  )
  ipcMain.handle(
    'pkms:local-file:list',
    async (event, workspaceId: string, relativePath: string) => {
      assertTrustedSender(event)
      return listPkmsLocalDirectory(workspaceId, relativePath)
    }
  )
  ipcMain.handle('pkms:local-file:get', async (event, workspaceId: string, id: string) => {
    assertTrustedSender(event)
    return getPkmsLocalFile(workspaceId, id)
  })
  ipcMain.handle(
    'pkms:local-item:reveal',
    async (event, workspaceId: string, relativePath: string) => {
      assertTrustedSender(event)
      if (!/^[A-Za-z0-9_-]{1,100}$/.test(workspaceId) || typeof relativePath !== 'string')
        throw new Error('invalid_local_item')
      const item = await resolvePkmsLocalItemAbsolutePath(workspaceId, relativePath)
      if (item.kind === 'folder') {
        const error = await shell.openPath(item.path)
        if (error) throw new Error(error)
      } else {
        shell.showItemInFolder(item.path)
      }
    }
  )
  ipcMain.handle(
    'pkms:local-item:create',
    async (
      event,
      workspaceId: string,
      parent: string,
      kind: 'markdown' | 'folder',
      name: string
    ) => {
      assertTrustedSender(event)
      if (kind !== 'markdown' && kind !== 'folder') throw new Error('invalid_local_item_kind')
      return createPkmsLocalItem(workspaceId, parent, kind, name)
    }
  )
  ipcMain.handle(
    'pkms:local-item:rename',
    async (event, workspaceId: string, id: string, name: string) => {
      assertTrustedSender(event)
      return renamePkmsLocalItem(workspaceId, id, name)
    }
  )
  ipcMain.handle(
    'pkms:local-item:move',
    async (
      event,
      workspaceId: string,
      ids: string[],
      parent: string,
      overwritePaths?: string[]
    ) => {
      assertTrustedSender(event)
      if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string'))
        throw new Error('invalid_local_item_ids')
      if (
        overwritePaths !== undefined &&
        (!Array.isArray(overwritePaths) || overwritePaths.some((item) => typeof item !== 'string'))
      )
        throw new Error('invalid_local_overwrite_paths')
      return movePkmsLocalItems(workspaceId, ids, parent, overwritePaths)
    }
  )
  ipcMain.handle('pkms:local-item:delete', async (event, workspaceId: string, ids: string[]) => {
    assertTrustedSender(event)
    if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string'))
      throw new Error('invalid_local_item_ids')
    const paths = (await Promise.all(ids.map((id) => getPkmsLocalFile(workspaceId, id))))
      .filter(Boolean)
      .map((file) => file!.path)
    appendStartupLog('pkms_local_delete_started', { workspaceId, paths })
    try {
      await deletePkmsLocalItems(workspaceId, ids)
      appendStartupLog('pkms_local_delete_completed', { workspaceId, paths })
    } catch (error) {
      appendStartupLog('pkms_local_delete_failed', {
        workspaceId,
        paths,
        error: error instanceof Error ? error.message : String(error)
      })
      throw error
    }
  })
  ipcMain.handle(
    'pkms:local-file:write',
    async (event, workspaceId: string, relativePath: string, text: string, revision: string) => {
      assertTrustedSender(event)
      if (typeof text !== 'string' || typeof revision !== 'string')
        throw new Error('invalid_local_file_write')
      return writePkmsLocalMarkdown(workspaceId, relativePath, text, revision)
    }
  )
  ipcMain.handle(
    'workspace-home:request',
    (event, pathName: string, options: PkmsRequestOptions) => {
      assertTrustedSender(event)
      return requestWorkspaceHomeApi(pathName, options)
    }
  )
  ipcMain.handle('pkms:open-verification', (event, rawUrl: string) => {
    assertTrustedSender(event)
    return shell.openExternal(parsePkmsVerificationUrl(rawUrl))
  })
  ipcMain.handle('pkms:open-service-oauth', (event, rawUrl: string) => {
    assertTrustedSender(event)
    return shell.openExternal(parseServiceOAuthUrl(rawUrl))
  })
}
