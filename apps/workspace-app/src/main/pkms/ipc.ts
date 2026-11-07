import { ipcMain, shell } from "electron";
import type { PkmsRequestOptions } from "../../shared/pkmsClient";
import { fetchPkmsAsset, parsePkmsVerificationUrl, parseServiceOAuthUrl, requestPkmsApi, requestWorkspaceHomeApi } from "./api";

function assertTrustedSender(event: Electron.IpcMainInvokeEvent): void {
  const rawUrl = event.senderFrame?.url;
  if (!rawUrl) throw new Error("untrusted_renderer");
  const url = new URL(rawUrl);
  const trusted = url.protocol === "file:" ||
    (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname));
  if (!trusted) throw new Error("untrusted_renderer");
}

export function registerPkmsIpc(): void {
  ipcMain.handle("pkms:request", (event, pathName: string, options: PkmsRequestOptions) => {
    assertTrustedSender(event);
    return requestPkmsApi(pathName, options);
  });
  ipcMain.handle("pkms:fetch-asset", (event, pathName: string) => {
    assertTrustedSender(event);
    return fetchPkmsAsset(pathName);
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
