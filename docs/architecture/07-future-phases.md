# Future architecture phases

Documented planned work beyond Phase 1 (InteractionCoordinator). Phase 1 is **implemented**; items below are **not** yet in production unless noted.

## Phase 2 — Zustand workspace-scope store

**Status:** Implemented (2026-08-25).

**Goal:** Replace scattered React refs and effects with explicit scope-keyed state.

### Planned store shape (sketch)

```typescript
type WorkspaceScopeState = {
  tabs: Record<number, WorkspaceTabRecord>;
  activeTabId: number;
  // per tab: layoutModelEpoch, paneActiveTabIds, ...
};
```

### Migration order

1. `useWorkspace.ts` → hydrate store from `workspace:updated`
2. `App.tsx` `modelsRef` / `modelEpoch` → layout slice
3. `PaneGroup` `localActiveId` → `activePaneTabByNodeId` in store
4. InteractionCoordinator subscribes to `activeTabId` (remove duplicate effects)

### Benefits

- Workspace switch = projection, not side-effect chains
- Re-activation no-op guard (skip reconcile when same tab)
- Single snapshot for debugging

**Reference:** Orca `active-worktree-surface.ts`, per-worktree keyed maps.

## Phase 3 — Session vs mount + embed budgets

**Goal:** Unmount expensive UI while keeping session records; cap guest/terminal mount count.

| Embed | Session (durable) | Mount (budgeted) |
|-------|-------------------|------------------|
| Terminal | Main `PtySession` + replay | xterm instance; cold-park after ~30s hidden |
| Browser | URL + history in layout JSON | `WebviewRegistry` outside React; LRU ~4 guests |

### Planned modules

- `embeds/WebviewRegistry.ts` — Map by pane tab id, LRU eviction
- `embeds/TerminalMountRegistry.ts` — park/unpark with hysteresis

Inactive workspace tabs could unmount all embeds; revisit rebuilds from session.

**Reference:** Orca `terminal-hidden-view-parking.ts`, `webview-registry.ts`, `browser-guest-worktree-retention.ts`.

## Phase 4 — Persistence boundary

**Status:** Zod salvage, `PaneGroupConfig.schemaVersion`, and per-root `.workspace/layout.json` export **implemented** (2026-08-26).

**Goal:** Corrupt layout JSON must not crash startup.

- Zod schema at read boundary
- Per-entry salvage (drop bad tab, keep rest)
- Split workspace session vs UI chrome persistence

**Reference:** Orca `workspace-session-schema.ts`, `zod-salvage.ts`.

## Explicitly out of scope (for now)

- Replacing flexlayout-react
- Orca full PaneManager (internal splits/dividers beyond flexlayout)
- Agent detection, remote SSH, native chat
- Full Orca cold-park + hidden WebGL retention

## Success metrics (Phase 1 — achieved target)

| Metric | Target |
|--------|--------|
| Workspace switch click failure | 0 over 10 consecutive switches |
| Browser click after splitter drag | Immediate |
| Orphan body portals after switch | 0 in coordinator registry |
| Stuck overlay block | IC panel shows count 0 |

## Related docs

- [04-interaction-coordinator.md](./04-interaction-coordinator.md) — current stability layer
- [ROADMAP.md](../ROADMAP.md) — product phases
