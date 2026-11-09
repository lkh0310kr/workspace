import { BrowserWindow, dialog, ipcMain, shell } from "electron";
import type { PkmsRequestOptions } from "../../shared/pkmsClient";
import { fetchPkmsAsset, parsePkmsVerificationUrl, parseServiceOAuthUrl, requestPkmsApi, requestWorkspaceHomeApi } from "./api";
import { configurePkmsSyncBridge, createPkmsLocalItem, deletePkmsLocalItems, disconnectPkmsSyncBridge, getPkmsSyncBridgeStatus, getPkmsLocalFile, listPkmsLocalDirectory, movePkmsLocalItems, readPkmsLocalMarkdown, renamePkmsLocalItem, scanPkmsSyncBridge, startConfiguredPkmsSyncBridges, updatePkmsSyncBridgeExclusions, writePkmsLocalMarkdown } from "./syncBridge";

function assertTrustedSender(event: Electron.IpcMainInvokeEvent): void {
  const rawUrl = event.senderFrame?.url;
  if (!rawUrl) throw new Error("untrusted_renderer");
  const url = new URL(rawUrl);
  const trusted = url.protocol === "file:" ||
    (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname));
  if (!trusted) throw new Error("untrusted_renderer");
}

export function registerPkmsIpc(): void {
  void startConfiguredPkmsSyncBridges();
  ipcMain.handle("pkms:request", (event, pathName: string, options: PkmsRequestOptions) => {
    assertTrustedSender(event);
    return requestPkmsApi(pathName, options);
  });
  ipcMain.handle("pkms:fetch-asset", (event, pathName: string) => {
    assertTrustedSender(event);
    return fetchPkmsAsset(pathName);
  });
  ipcMain.handle("pkms:sync-bridge:status", (event, workspaceId: string) => {
    assertTrustedSender(event);
    return getPkmsSyncBridgeStatus(workspaceId);
  });
  ipcMain.handle("pkms:sync-bridge:connect", async (event, workspaceId: string) => {
    assertTrustedSender(event);
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(workspaceId)) throw new Error("invalid_workspace_id");
    const owner = BrowserWindow.fromWebContents(event.sender);
    const options = { properties: ["openDirectory", "createDirectory"] as Array<"openDirectory" | "createDirectory"> };
    const picked = owner ? await dialog.showOpenDialog(owner, options) : await dialog.showOpenDialog(options);
    if (picked.canceled || !picked.filePaths[0]) return { canceled: true };
    return { canceled: false, status: await configurePkmsSyncBridge(workspaceId, picked.filePaths[0]) };
  });
  ipcMain.handle("pkms:sync-bridge:disconnect", (event, workspaceId: string) => {
    assertTrustedSender(event);
    return disconnectPkmsSyncBridge(workspaceId);
  });
  ipcMain.handle("pkms:sync-bridge:scan", (event, workspaceId: string) => {
    assertTrustedSender(event);
    return scanPkmsSyncBridge(workspaceId);
  });
  ipcMain.handle("pkms:sync-bridge:exclusions", (event, workspaceId: string, paths: string[]) => {
    assertTrustedSender(event);
    if (!Array.isArray(paths) || paths.some((item) => typeof item !== "string")) throw new Error("invalid_exclusions");
    return updatePkmsSyncBridgeExclusions(workspaceId, paths);
  });
  ipcMain.handle("pkms:local-file:read", async (event, workspaceId: string, relativePath: string) => {
    assertTrustedSender(event);
    return readPkmsLocalMarkdown(workspaceId, relativePath);
  });
  ipcMain.handle("pkms:local-file:list", async (event, workspaceId: string, relativePath: string) => {
    assertTrustedSender(event);
    return listPkmsLocalDirectory(workspaceId, relativePath);
  });
  ipcMain.handle("pkms:local-file:get", async (event, workspaceId: string, id: string) => {
    assertTrustedSender(event);
    return getPkmsLocalFile(workspaceId, id);
  });
  ipcMain.handle("pkms:local-item:create", async (event, workspaceId: string, parent: string, kind: "markdown" | "folder", name: string) => {
    assertTrustedSender(event);
    if (kind !== "markdown" && kind !== "folder") throw new Error("invalid_local_item_kind");
    return createPkmsLocalItem(workspaceId, parent, kind, name);
  });
  ipcMain.handle("pkms:local-item:rename", async (event, workspaceId: string, id: string, name: string) => {
    assertTrustedSender(event);
    return renamePkmsLocalItem(workspaceId, id, name);
  });
  ipcMain.handle("pkms:local-item:move", async (event, workspaceId: string, ids: string[], parent: string) => {
    assertTrustedSender(event);
    if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string")) throw new Error("invalid_local_item_ids");
    return movePkmsLocalItems(workspaceId, ids, parent);
  });
  ipcMain.handle("pkms:local-item:delete", async (event, workspaceId: string, ids: string[]) => {
    assertTrustedSender(event);
    if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string")) throw new Error("invalid_local_item_ids");
    return deletePkmsLocalItems(workspaceId, ids);
  });
  ipcMain.handle("pkms:local-file:write", async (event, workspaceId: string, relativePath: string, text: string, revision: string) => {
    assertTrustedSender(event);
    if (typeof text !== "string" || typeof revision !== "string") throw new Error("invalid_local_file_write");
    return writePkmsLocalMarkdown(workspaceId, relativePath, text, revision);
  });
  ipcMain.handle("workspace-home:request", (event, pathName: string, options: PkmsRequestOptions) => {
    assertTrustedSender(event);
    return requestWorkspaceHomeApi(pathName, options);
  });
  ipcMain.handle("pkms:open-verification", (event, rawUrl: string) => {
    assertTrustedSender(event);
    return shell.openExternal(parsePkmsVerificationUrl(rawUrl));
  });
  ipcMain.handle("pkms:open-service-oauth", (event, rawUrl: string) => {
    assertTrustedSender(event);
    return shell.openExternal(parseServiceOAuthUrl(rawUrl));
  });
}
