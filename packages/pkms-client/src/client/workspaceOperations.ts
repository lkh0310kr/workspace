import { createOperationId } from "../domain/encoding";
import type { Workspace } from "../domain/types";

type Api = <T = unknown>(path: string, init?: RequestInit) => Promise<T>;

export type WorkspaceFileOperation =
  | { type: "create-file"; path: string; fileId: string; content: string }
  | { type: "create-folder"; path: string }
  | { type: "move"; fileId: string; toPath: string }
  | { type: "delete"; fileId: string };

export interface WorkspaceOperationResult {
  acceptedRevision?: number;
  conflictCopyPath?: string;
}

/** Send a revisioned file-tree operation using the shared PKMS wire envelope. */
export function submitWorkspaceOperation(
  api: Api,
  workspace: Pick<Workspace, "id" | "revision">,
  operation: WorkspaceFileOperation,
  clientId = `web-${createOperationId()}`,
): Promise<WorkspaceOperationResult> {
  return api<WorkspaceOperationResult>(`/api/workspaces/${workspace.id}/operations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      operationId: createOperationId(),
      baseRevision: workspace.revision,
      clientId,
      operation,
    }),
  });
}
