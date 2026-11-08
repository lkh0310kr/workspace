export type PkmsSyncBridgeState = "disconnected" | "syncing" | "synced" | "offline" | "error";

export interface PkmsSyncBridgeStatus {
  workspaceId: string;
  enabled: boolean;
  folderPath: string | null;
  excludedPaths: string[];
  state: PkmsSyncBridgeState;
  lastScannedAt: number | null;
  lastSyncedAt: number | null;
  pendingFiles: number;
  conflictFiles: string[];
  error: string | null;
}

export type PkmsSyncBridgeConnectResult =
  | { canceled: true }
  | { canceled: false; status: PkmsSyncBridgeStatus };
