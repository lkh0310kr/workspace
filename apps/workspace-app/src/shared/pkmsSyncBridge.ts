export type PkmsSyncBridgeState = "disconnected" | "syncing" | "synced" | "offline" | "error";
export type PkmsSyncBridgeStage = "scanning" | "loading-remote-list" | "downloading-remote-files" | "reconciling";
export type PkmsSyncItemState = "pending" | "syncing" | "attention";

export interface PkmsSyncBridgeStatus {
  workspaceId: string;
  enabled: boolean;
  folderPath: string | null;
  excludedPaths: string[];
  state: PkmsSyncBridgeState;
  progress: { completed: number; total: number; percent: number } | null;
  stage?: PkmsSyncBridgeStage | null;
  lastScannedAt: number | null;
  lastSyncedAt: number | null;
  pendingFiles: number;
  conflictFiles: string[];
  itemStates: Record<string, PkmsSyncItemState>;
  error: string | null;
}

export type PkmsSyncBridgeConnectResult =
  | { canceled: true }
  | { canceled: false; status: PkmsSyncBridgeStatus };
