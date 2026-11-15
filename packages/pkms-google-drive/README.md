# PKMS Google Drive (`@pkms/google-drive`)

Shared Google Drive API and workspace repository used by PKMS platform adapters.

- `GoogleDriveClient` owns Drive v3 requests, authentication-token injection, bounded rate-limit retries, immutable operation upload recovery, and change-feed paging.
- `GoogleDriveWorkspaceRepository` maps one explicitly selected Drive folder to a recursive PKMS tree and exposes file, folder, move, rename, and trash operations. `createFolderOnce` and `createFileOnce` recover a successful Drive create after a lost response by a workspace-scoped operation marker and reject payload collisions. `resolveGoogleDriveWorkspaceRoot` discovers roots by an app-owned `appProperties` marker across devices, creates one only when none exists, and stops when roots are ambiguous.
- `IndexedDbDriveOutbox` stores stable, ordered operations and content bytes locally; an operation remains pending until its caller confirms durable Drive acknowledgement.
- `IndexedDbGoogleDriveReplica` stores per-root metadata, on-demand cached bytes, and the Drive changes cursor. It applies change pages before advancing the cursor and preserves cached descendants with pending edits when a remote folder is removed.
- `GoogleDriveOperationLog` writes immutable, checksummed operation records under the hidden `.pkms-sync/operations` folder and validates identity, schema version, and payload digest when reading them. `get(operationId)` resolves and downloads one operation by its stable ID; opening a document does not download the whole operation log.
- `GoogleDriveYjsDocumentStore` lazily opens one Markdown document at a time, seeds it from its pending create, its deterministic seed operation, or that Drive file, and queues local Yjs updates. It does not bulk-download or index all file contents. The product search index and platform adapters still need to be integrated separately.
- `GoogleDriveOperationApplier` replays create, rename, move, and trash operations through the workspace repository. It delegates Yjs document updates and binary asset replacements to required idempotent hooks so each platform can provide durable merge and conflict-preserving projection.
- `GoogleDriveSyncEngine` appends durable outbox entries to that log, replays unapplied operations through an injected idempotent reconciliation callback, and only acknowledges local work after the callback and applied checkpoints succeed. The concrete reconciliation/projection implementation is still required from a product adapter.
- `GoogleDriveWebOAuth` performs foreground-only Web authorization and keeps access tokens in memory. It requests reauthentication after expiry and does not save tokens to browser storage.
- OAuth consent, token persistence, durable local outbox, Yjs operation orchestration, and platform UI belong to the Web, Desktop, and iOS adapters. This package does not use a PKMS server or Worker.

The target storage and synchronization contract is documented in [Google Drive direct sync](../../docs/architecture/pkms/google-drive-direct-sync.md). The package is a shared foundation; its existence alone does not switch a product client away from the current PKMS API.
