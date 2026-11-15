# `@pkms/google-drive`

Shared Google Drive API and workspace repository used by PKMS platform adapters.

- `GoogleDriveClient` owns Drive v3 requests, authentication-token injection, bounded rate-limit retries, immutable operation upload recovery, and change-feed paging.
- `GoogleDriveWorkspaceRepository` maps one explicitly selected Drive folder to a recursive PKMS tree and exposes file, folder, move, rename, and trash operations.
- `IndexedDbDriveOutbox` stores stable, ordered operations and content bytes locally; an operation remains pending until its caller confirms durable Drive acknowledgement.
- OAuth consent, token persistence, durable local outbox, Yjs operation orchestration, and platform UI belong to the Web, Desktop, and iOS adapters. This package does not use a PKMS server or Worker.

The target storage and synchronization contract is documented in [Google Drive direct sync](../../docs/architecture/pkms/google-drive-direct-sync.md). The package is a shared foundation; its existence alone does not switch a product client away from the current PKMS API.
