import { useCallback, useEffect, useState } from "react";
import { desktopBridge, type PkmsSyncBridgeStatus } from "../platform/desktopApi";

interface Props {
  workspaceId: string;
  githubStatus: "synced" | "pending" | "failed" | "external-change";
  githubLastCommitAt?: string;
  githubPendingFiles: number;
  githubMessage?: string;
}

function stateLabel(status: PkmsSyncBridgeStatus | null): string {
  if (!status) return "Loading";
  return ({ disconnected: "Not connected", syncing: "Syncing", synced: "Up to date", offline: "Offline", error: "Needs attention" } as const)[status.state];
}

export function SyncBridgePanel({ workspaceId, githubStatus, githubLastCommitAt, githubPendingFiles, githubMessage }: Props) {
  const bridge = desktopBridge();
  const [status, setStatus] = useState<PkmsSyncBridgeStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [excludedDraft, setExcludedDraft] = useState("");
  const refresh = useCallback(async () => {
    if (!bridge) return;
    try { setStatus(await bridge.syncBridgeStatus(workspaceId)); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not read folder sync status."); }
  }, [bridge, workspaceId]);
  const excludedKey = status?.excludedPaths.join("\n") ?? "";
  useEffect(() => setExcludedDraft(excludedKey), [workspaceId, excludedKey]);

  useEffect(() => {
    setStatus(null);
    void refresh();
    if (!bridge) return;
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => window.clearInterval(timer);
  }, [bridge, refresh]);

  const run = async (action: () => Promise<PkmsSyncBridgeStatus>) => {
    setBusy(true); setMessage("");
    try { setStatus(await action()); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Folder sync failed."); }
    finally { setBusy(false); }
  };
  const connect = async () => {
    if (!bridge) return;
    setBusy(true); setMessage("");
    try {
      const result = await bridge.connectSyncBridge(workspaceId);
      if (!result.canceled) setStatus(result.status);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not connect the folder."); }
    finally { setBusy(false); }
  };

  return (
    <section className="sync-bridge-panel" aria-label="Folder sync">
      <div className="sync-bridge-heading">
        <div><span className={`sync-bridge-indicator sync-bridge-indicator--${status?.state ?? "loading"}`} /> <span className="eyebrow">Folder sync</span></div>
        <span className="sync-bridge-state">{bridge ? stateLabel(status) : "Desktop only"}</span>
      </div>
      {bridge ? <>
        {status?.folderPath && <div className="sync-bridge-path" title={status.folderPath}>{status.folderPath}</div>}
        <div className="sync-bridge-meta">
          {status?.lastSyncedAt ? `Last synced ${new Date(status.lastSyncedAt).toLocaleTimeString()}` : status?.enabled ? "Preparing initial sync…" : "Markdown files sync with this workspace. Differing files are preserved as conflict copies."}
          {status?.pendingFiles ? ` · ${status.pendingFiles} pending` : ""}
        </div>
        {(status?.error || message) && <div className="sync-bridge-error">{status?.error ?? message}</div>}
        {status?.conflictFiles.length ? <div className="sync-bridge-conflicts"><strong>{status.conflictFiles.length} conflict copy{status.conflictFiles.length === 1 ? "" : "ies"}</strong><span>{status.conflictFiles.slice(0, 3).join(", ")}{status.conflictFiles.length > 3 ? ` and ${status.conflictFiles.length - 3} more` : ""}</span></div> : null}
        {status?.enabled && <div className="sync-bridge-exclusions">
          <label htmlFor={`sync-bridge-exclusions-${workspaceId}`}>Exclude paths (one pattern per line)</label>
          <textarea id={`sync-bridge-exclusions-${workspaceId}`} value={excludedDraft} onChange={(event) => setExcludedDraft(event.target.value)} placeholder={"**/drafts/**\nprivate/*.md"} rows={2} />
          {excludedDraft !== excludedKey && <button type="button" disabled={busy} onClick={() => void run(() => bridge.updateSyncBridgeExclusions(workspaceId, excludedDraft.split("\n")))}>Save exclusions</button>}
        </div>}
        <div className="sync-bridge-actions">
          {status?.enabled ? <>
            <button type="button" disabled={busy} onClick={() => void run(() => bridge.scanSyncBridge(workspaceId))}>Sync now</button>
            <button type="button" disabled={busy} onClick={() => void run(() => bridge.disconnectSyncBridge(workspaceId))}>Disconnect</button>
          </> : <button type="button" disabled={busy} onClick={() => void connect()}>Connect folder</button>}
        </div>
      </> : <div className="sync-bridge-meta">Connect a folder from Workspace Desktop to sync Markdown files and AI agent edits.</div>}
      <div className="sync-bridge-github"><span>GitHub backup</span><strong className={`sync-bridge-github-state is-${githubStatus}`}>{githubStatus === "external-change" ? "External change" : githubStatus === "failed" ? "Needs attention" : githubStatus === "pending" ? "Pending" : "Up to date"}</strong></div>
      <div className="sync-bridge-meta">{githubStatus === "synced" && githubLastCommitAt ? `Last commit ${new Date(githubLastCommitAt).toLocaleString()}` : githubPendingFiles ? `${githubPendingFiles} files awaiting backup` : githubMessage ?? "GitHub backup is separate from cloud sync."}</div>
    </section>
  );
}
