# PKMS local deletion sync — SDD

This is the implementation contract for propagating local file and folder deletion to the PKMS cloud tree. The broader outcome and reconciliation model is in [Desktop folder sync](./README.md), with baseline rules in [reconciliation](./reconciliation.md).

## Status

**Implemented in source; awaiting deployed migration and macOS runtime acceptance.**

## Problem and observed failure

The connected local folder is the user's edit source. Deleting a file or directory in Finder or another editor must automatically remove it from the cloud tree.

Observed on `engineering`:

1. The local directory and its notes were removed or moved.
2. The bridge processed missing Markdown paths, but empty remote folder records remained.
3. `syncOnce()` materialized each remote folder with `mkdir(..., { recursive: true })` before reconciling local paths.
4. The directory reappeared locally as empty folders and remained in the PKMS tree.

This was the failure observed before the durable deletion implementation. The source now includes directory inventory and pending delete intents; the remaining deployment and runtime checks are listed below. The historical incident is not the current source implementation status.

The `engineering` cleanup preserved the three non-empty robotics notes under `로봇/연구/TM 협동로봇 소프트웨어/`, removed the placeholder notes and exact duplicate conflict copies, and committed the local Git change as `976631f`. The cloud still has empty `engineering` folder metadata and rematerialized empty local directories. This is the outstanding case the implementation must resolve; do not consider the cleanup complete until the remote folder tombstone is acknowledged.

## Current source implementation

In `apps/workspace-app/src/main/pkms/syncBridge.ts`:

- The bridge now persists a directory identity inventory and uses watcher rename/drop events plus periodic scans to detect folder absence.
- Pending file and folder deletes retain their operation ID, hide the row from the bridge tree, and prune cached state after acknowledgement.
- Stable directory identities are used to send a cloud move when a local folder is renamed.
- The server validates file `expectedRevision`. Folder deletes with `protectSubtree` currently use a conservative workspace revision equality guard: any concurrent workspace mutation can reject the delete, even when outside the target subtree. This is stricter than the target-only guard in the design and favors preserving remote data. A future operation-path index can narrow this guard.
- The folder bridge currently syncs Markdown documents and folder metadata. Other local file types and binary attachments are not in this deletion contract until they are added to the bridge's manifest and transfer protocol.

Watcher ambiguity means one callback is insufficient evidence. It does not justify never detecting deletion. Events are hints; a complete local directory inventory is the evidence.

## Goals and invariants

1. Local Markdown-file and folder deletion reaches the cloud automatically after verified local scans.
2. A deleted file or folder is not recreated from stale cached metadata while deletion is pending or acknowledged.
3. Scan failures, missing roots, excluded paths, and dropped watcher events never become deletes.
4. File and folder deletion is durable and idempotent across restart, timeout, and offline retry.
5. A remote change to a file or inside a folder after the local sync cursor is not silently destroyed by a stale local delete.
6. A deleted parent folder is sent once; its descendant files are not individually tombstoned as well.
7. Initial connection never interprets unmaterialized cloud folders as local deletions.
8. A pending local delete is hidden immediately and stays pending or attention-marked until resolved.

## Required durable evidence

The outcome contract requires the client to retain a complete prior directory inventory and delete intents across process restart. The persisted data shape below is a **candidate versioned schema for that requirement**, not a claim about the current JSON layout. The source currently stores `localDirectories[workspaceId]` as a plain `relativePath -> device:inode|null` map and does not store the `version`, `generation`, or `completedAt` fields shown here. See [implementation status](./implementation-status.md) before assuming migration support.

### Candidate local directory inventory

Persist a complete local inventory per connected workspace in `pkms-sync-bridge.json`:

```ts
type LocalDirectoryEntry = {
  path: string;
  identity: string | null; // device + inode when the platform supplies a stable identity
};

type LocalDirectoryInventory = {
  version: 1;
  generation: number;
  completedAt: number;
  directories: Record<string, LocalDirectoryEntry>;
};
```

Store relative paths only. Exclude `.git`, `.obsidian`, `node_modules`, `.pkms`, configured exclusions, and symlinks under the same policy as content scans. A scan is complete only if the root and every traversed directory were readable. Any traversal error makes the pass incomplete and forbids delete inference.

An existing install without this inventory seeds it from the first complete local scan. That migration pass infers no deletes, avoiding removal of cloud-only folders during first materialization.

### Pending delete intent

Persist a candidate before network I/O:

```ts
type PendingDelete = {
  kind: "markdown" | "folder";
  path: string;
  fileId: string;
  operationId: string;
  baseRevision: number;
  expectedItemRevision?: number;
  firstObservedAt: number;
  attempts: number;
};
```

Retry the same operation ID and payload. Exclude pending paths and descendants from the merged cloud tree. After acknowledgement, remove the file or folder subtree from `remoteTrees`, `remoteFiles`, baselines, and the local directory inventory before advancing the durable cursor.

## Server concurrency guard

Keep the existing `delete` operation. For a Markdown file, the server must compare the target's current revision with `expectedItemRevision`. For a folder, it must reject atomically if the folder or any descendant changed after `baseRevision`. Return stable errors such as `file_changed_since_base` or `folder_changed_since_base`; make no partial deletion.

File deletes check the target revision. Folder deletes currently require the workspace revision to equal the submitted base revision because legacy operation rows do not retain affected paths. This safely rejects a concurrent unrelated change too; narrow subtree-only checking after the operation journal records paths.

On a stale-revision conflict, cancel the pending delete and catch up the remote cursor. For a file, preserve the latest cloud version as a conflict copy before retrying or restore it and mark `attention`. For a folder, restore the latest cloud subtree locally and set the folder to `attention`. The user can delete again after the restored copy has a current baseline. This rare path preserves remote edits instead of silently destroying them.

## Reconciliation algorithm

1. **Use watcher events as hints.** Persist changed paths. A `rename` event, null filename, watcher error, or missing path schedules directory verification. Never infer intent from one callback.
2. **Scan before cloud hydration.** Complete the local directory scan before the loop that creates remote folders. Reconcile the local Markdown set against persisted baselines in the same pass. If either scan fails, retain the last committed inventory and fail closed.
3. **Seed on migration.** With no prior inventory, save the first complete inventory and continue normal cloud hydration. Create no delete intents in that pass.
4. **Diff files and directories.** A missing Markdown path is a candidate only when it has a committed remote baseline. A missing directory is a candidate only when it was in the prior complete inventory and has a live remote folder record. If parent and child are both absent, select only the shallowest parent and let the server cascade the delete.
5. **Protect exclusions.** If a candidate intersects an excluded path or reserved sync path, do not infer deletion.
6. **Recognize directory moves.** Match a missing directory to a new directory by stable `(device, inode)` identity and issue one recursive move. If identity is unavailable or ambiguous, do not guess; use conservative delete/create handling.
7. **Persist intent and hide the row.** Save the operation ID, item path, target ID, and revision guard. Suppress the candidate and, for a folder, its descendants from the merged tree immediately.
8. **Delete remotely.** Submit a conditional file or folder delete. The server atomically tombstones the file or the folder subtree only if its revision guard passes.
9. **Commit on acknowledgement.** Prune cached metadata and baselines and advance the cursor to the accepted revision. On transient errors, retain the pending intent and retry without recreating the path.
10. **Resolve stale-delete conflicts.** Apply remote changes, preserve or restore the latest cloud version, clear the pending delete, and show `attention`.
11. **Recover missed events.** Startup and periodic complete scans use the same inventory diff. A watcher drop or error forces a full directory scan.

| Condition | Result |
|---|---|
| First complete scan; no prior inventory | Seed inventory; hydrate cloud-only folders; no deletion |
| Baseline Markdown file absent from a complete scan | Queue conditional file delete |
| Previously observed folder absent from a complete scan | Queue conditional folder delete |
| Root missing, traversal failed, or scan incomplete | Keep prior inventory; retry; no deletion |
| Candidate is excluded or reserved | Do not infer deletion |
| Remote file revision still matches its baseline | Tombstone the file atomically |
| Remote folder subtree unchanged since the client cursor | Tombstone the folder and descendants atomically |
| Remote file/subtree changed after the cursor | Reject atomically; preserve/restore the current cloud version and show attention |
| Same directory identity appears at a new path | Issue one move operation |
| Identity unavailable or ambiguous | Do not guess a move |

## Tree and diagnostics

- Hide a pending deletion from the Files tree immediately; stale cloud metadata must not re-add it.
- A successful operation removes empty folder rows from all clients through the existing revision feed.
- A remote-change conflict restores the folder with an attention marker and an explanation.
- Main-process logs record lifecycle events without note contents: `pkms_local_delete_queued`, `pkms_local_delete_ack`, `pkms_local_delete_conflict`, `pkms_local_delete_retry`, `pkms_local_folder_move`, and `pkms_local_scan_incomplete` where a scan cannot complete. They include workspace ID, relative path, item kind, operation ID, and error message where applicable.

## Source, deployment, acceptance status

| Slice | Source status | Operational status |
|---|---|---|
| Complete directory inventory + seed-only migration | present in `syncBridge.ts` | macOS watcher/drop/permission acceptance pending |
| Durable file/folder delete intent + pending tree suppression | present in `syncBridge.ts` | restart/offline response-loss test pending |
| Atomic file revision and conservative folder subtree guards | present in Worker SQL migration and handler | target database migration application unverified |
| Scan → remote cursor → conditional delete → remaining folder materialization order | present in current `syncOnce` | end-to-end concurrent-delete test pending |
| Stable directory identity move | present when `(dev,ino)` uniquely identifies destination | cross-volume/identity unavailable fallback acceptance pending |
| Structured lifecycle logs | source emits queued/ack/conflict/retry/move/incomplete events | log delivery/retention and privacy review pending |

The migration and source implementation do not prove the deployed target is protected. Require DB migration version and runtime evidence before declaring destructive deletion accepted.

Do not fix this by disabling folder materialization. Remote-only and empty cloud folders must still appear locally. The bridge must decide whether a folder is missing locally before it recreates that folder.

## Acceptance criteria

1. Deleting a synced Markdown file in Finder removes it from disk and the PKMS tree; it stays absent through two cursor polls and restart.
2. Deleting an empty synced folder has the same durable result.
3. Deleting a populated folder sends one recursive operation and no descendant delete storm.
4. Offline file/folder deletion stays hidden and pending, retries after reconnect with the same operation ID, and is not recreated from cached metadata.
5. A remote edit to a file or descendant after the local cursor causes an atomic rejection; the latest cloud version is preserved and marked attention.
6. An incomplete or unreadable file/directory scan causes no cloud deletion.
7. Excluded paths are not deleted by absence inference.
8. A macOS directory rename with stable inode identity uses one move and creates no conflict copies.
9. First sync with an empty local folder and populated cloud tree seeds the inventory and materializes the remote tree.
10. A local-only Markdown file created and deleted before upload is removed from the pending-create queue and never appears remotely.
11. Restart at every pending-delete phase retries or completes the same operation; no stale item is resurrected.
12. Logs identify candidate, acknowledgement, retry, conflict, and incomplete scan without document content.
13. Replacing the connected local root never deletes remote items solely because they are absent from the new root; migration/seed requires explicit confirmation and a complete new inventory.

## Research basis

- Node.js documents that `fs.watch()` varies by platform, filenames may be missing, and rename notifications do not provide a durable operation journal. Verify with a scan rather than treating events as truth. [Node.js `fs.watch()`](https://nodejs.org/api/fs.html#fswatchfilename-options-listener)
- Apple File Provider uses synchronization anchors to enumerate changes after a durable synchronization point. This supports committing inventories and cursors only after complete, acknowledged passes. [Apple `NSFileProviderSyncAnchor`](https://developer.apple.com/documentation/fileprovider/nsfileprovidersyncanchor) and [Tracking File Provider Changes](https://developer.apple.com/documentation/fileprovider/tracking-your-file-provider-s-changes)
- macOS FSEvents reports dropped-event conditions that require a recursive rescan. Node's watcher abstraction does not expose a durable per-item deletion journal, so periodic inventory reconciliation is required for recovery. [Apple FSEvents dropped events](https://developer.apple.com/documentation/coreservices/kfseventstreameventflaguserdropped)

These platform APIs do not imply PKMS should adopt File Provider. They support the design principle: events wake the engine; durable inventories and revision cursors establish truth.
