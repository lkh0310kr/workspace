# PKMS architecture

PKMS-specific architecture documents live here. Keep the system-wide process and app-boundary documents in the parent architecture directory.

## Read by concern

- [Integration overview](./overview.md) — Web, Desktop, iOS, Worker, IPC, and shared client boundaries.
- [Desktop folder sync](./folder-sync.md) — current algorithm, target data flow, local tree UX, and rollout steps.

The overview explains where sync belongs in the product. The folder-sync document owns its algorithm and interaction contract. Do not duplicate sync timings or reconciliation rules in the overview.
