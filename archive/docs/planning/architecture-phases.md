# 향후 아키텍처 단계

Phase 1(InteractionCoordinator) 이후에 계획한 작업을 기록합니다. Phase 1은 **구현 완료** 상태이며, 별도 표시가 없는 아래 항목은 아직 운영 환경에 반영되지 않았습니다.

## Phase 2 — Zustand workspace 범위 store

**상태:** 구현 완료 (2026-08-25).

**목표:** 흩어진 React ref와 effect를 명시적인 scope key 기반 상태로 바꿉니다.

### 계획한 store 형태 (개략)

```typescript
type WorkspaceScopeState = {
  tabs: Record<number, WorkspaceTabRecord>;
  activeTabId: number;
  // per tab: layoutModelEpoch, paneActiveTabIds, ...
};
```

### 이전 순서

1. `useWorkspace.ts` → hydrate store from `workspace:updated`
2. `App.tsx` `modelsRef` / `modelEpoch` → layout slice
3. `PaneGroup` `localActiveId` → `activePaneTabByNodeId` in store
4. InteractionCoordinator subscribes to `activeTabId` (remove duplicate effects)

### 기대 효과

- Workspace 전환을 부수 효과 연쇄가 아니라 projection으로 처리
- 같은 탭을 다시 활성화할 때 reconcile을 건너뛰는 no-op guard
- 디버깅을 위한 단일 snapshot

**참고:** Orca의 `active-worktree-surface.ts`, worktree별 key map.

## Phase 3 — Session과 mount 분리 및 embed 예산

**목표:** session 기록은 유지하면서 비용이 큰 UI를 unmount하고, guest/terminal mount 수에 상한을 둡니다.

| Embed | Session (지속 상태) | Mount (예산 적용) |
|-------|-------------------|------------------|
| Terminal | Main `PtySession` + replay | xterm instance; cold-park after ~30s hidden |
| Browser | URL + history in layout JSON | `WebviewRegistry` outside React; LRU ~4 guests |

### 계획한 모듈

- `embeds/WebviewRegistry.ts` — Map by pane tab id, LRU eviction
- `embeds/TerminalMountRegistry.ts` — park/unpark with hysteresis

비활성 workspace 탭에서는 모든 embed를 unmount할 수 있으며, 다시 열면 session에서 복원합니다.

**참고:** Orca의 `terminal-hidden-view-parking.ts`, `webview-registry.ts`, `browser-guest-worktree-retention.ts`.

## Phase 4 — 영속성 경계

**상태:** Zod salvage, `PaneGroupConfig.schemaVersion`, root별 `.workspace/layout.json` 내보내기 **구현 완료** (2026-08-26).

**목표:** 손상된 layout JSON 때문에 앱 시작이 실패하지 않도록 합니다.

- Zod schema at read boundary
- Per-entry salvage (drop bad tab, keep rest)
- Split workspace session vs UI chrome persistence

**Reference:** Orca `workspace-session-schema.ts`, `zod-salvage.ts`.

## 명시적으로 범위에서 제외 (현재)

- Replacing flexlayout-react
- Orca full PaneManager (internal splits/dividers beyond flexlayout)
- Agent detection, remote SSH, native chat
- Full Orca cold-park + hidden WebGL retention

## 성공 지표 (Phase 1 — 목표 달성)

| 지표 | 목표 |
|--------|--------|
| Workspace switch click failure | 0 over 10 consecutive switches |
| Browser click after splitter drag | Immediate |
| Orphan body portals after switch | 0 in coordinator registry |
| Stuck overlay block | IC panel shows count 0 |

## 관련 문서

- [04-interaction-coordinator.md](../architecture/04-interaction-coordinator.md) — 현재 안정화 계층
- [roadmap.md](./roadmap.md) — 제품 단계
