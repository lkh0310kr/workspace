# TODO

MVP Phase 1 기능은 대체로 동작함. Phase 2는 **완성도·안정성·리팩토링** 위주.

---

## Platform / Electron

- [x] macOS 콘솔 경고 `representedObject is not a WeakPtrToElectronMenuModelAsNSObject` — Electron #50389: `role:` 메뉴 상호작용 시 AppKit이 남기는 **무해한 진단 로그**. `buildAppMenu`는 `whenReady`에서 1회만 호출. Electron **≥41** 업그레이드 시 로그 제거됨(PR #50608). 앱 코드 변경 불필요.
- [ ] `webPreferences.sandbox: false` — `<webview>` + node-pty 때문에 현실적으로 꺼져 있음. preload 경계·`contextIsolation`·IPC allowlist 점검하고, 가능한 범위에서 sandbox 복구 또는 위협 모델 문서화.
- [ ] macOS TCC / Full Disk Access — Terminal `ls Operation not permitted`, `EPERM` 내부 에러는 앱 코드가 아니라 Documents 보호 폴더 + dev Electron 바이너리 권한 문제. **해결:** 시스템 설정에서 권한 부여 + **배포 빌드(`workspace-app`)용 entitlements/서명 가이드** README에 정리. dev/prod 바이너리 경로가 다르면 권한을 각각 줘야 함.

---

## 구조 / 리팩토링 (우선순위 높음)

### 가시성·입력 정책이 4겹으로 겹침

한 pane이 화면에 보이는지/클릭 가능한지가 여러 레이어에 분산돼 있어 회귀가 반복됨 (최근 browser popover/drag 이슈도 여기서 파생).

| 레이어 | 담당 |
|--------|------|
| `WorkspaceLayoutHost` + `embedPolicy.workspaceTabHostStyle` | workspace tab `visibility` / `pointerEvents` |
| `PaneGroup` `.pane-group-content-item` | pane 내 chip `visibility` / `pointerEvents` |
| `usePaneVisibility` + flexlayout `tabNode.isVisible()` | pane live content 여부 |
| `InteractionCoordinator` | webview `display` / `pointer-events` (overlay·portal·drag) |
| `BrowserContent` | webview `visibility` + `setBrowserPaneVisible` |

- [x] **단일 embed policy로 통합** — `embedPolicy.ts`로 pane chip visibility 규칙 중앙화 (PaneGroup 적용). webview display/portal/drag는 IC.
- [x] `docs/architecture/04-interaction-coordinator.md`, `06-browser-embeds.md` IC policy 동기화 (2026-08-26).
- [x] `InteractionDebugPanel` / `dbgLog` / `layoutLog` → `import.meta.env.DEV` 게이트.
- [x] `layoutMovePolicy.ts` — App.tsx MOVE_NODE/rebalance 분리.
- [x] IC `activeBrowserPaneNodeId` dead code 제거.

### App.tsx 비대화 (~650줄 → ~155줄)

layout factory, flexlayout `onAction`/`onModelChange`, chip drop, splitter overlay, shortcut wiring, settings portal, debug probe가 한 파일에 있음.

- [x] `workspaceLayoutModels.ts` — flexlayout Model Map을 store 밖 모듈로 분리 (2026-08-26).
- [x] `useLayoutHostCallbacks`, `useTabChipWindowDrop`, `useSplitterDragOverlay` — App.tsx ~200줄 축소.
- [x] `layoutChipWindowDrop.ts` — chip window drop 로직 분리.
- [x] `browserEmbedSupport.ts` — focus relay + `reloadFocusedBrowser` 단일 진입점.
- [x] main NDJSON 로그 — `!app.isPackaged`일 때만 기록 (`debugLogSink.ts`).
- [x] `AppTitlebar`, `WorkspaceLayoutHost`, `useAppShellState`, `useAppBootstrap`, `useAppShortcuts`, `useLayoutHostLifecycle`, `useVisibleWorkspaceTab` — shell/layout UI·lifecycle hooks 분리 (2026-08-26).
- [ ] `useFlexlayoutDragPolicy()` 등 drag orchestration 추가 분리 (optional).
- [x] chip/pane split drop — `LayoutTabDropOverlay` + `layoutTabDrop.ts` + `useTabChipWindowDrop`; App window `drop` fallback 제거됨.

### 모듈 전역 mutable state

`tabDrag.ts`, `layoutRef.ts`(Map + activeTabId), `activeBrowserWebview.ts`, IC singleton — React/Zustand 밖에서 상태가 흩어져 있어 디버깅·테스트가 어려움.

- [x] drag 상태(`tab-chip-drag`, `pane-strip-drag`, `splitter-drag`) — `dragSession.ts`에서 overlay push/pop + tab chip payload 중앙화 (2026-08-26).
- [x] `activeBrowserWebview` — `browserEmbedSupport.ts`로 reload/focus setup 단일화 (2026-08-26). guest-focus IPC 실사용 검증은 미완.

### Zustand 마이그레이션 미완

`docs/architecture/07-future-phases.md` Phase 2는 "완료"로 표시돼 있으나:

- [x] `modelsByTabId` Map은 module scope에 유지 (flexlayout Model 인스턴스); zustand `layoutRevisions` per-tab reactive slice로 교체해 `modelEpoch` 전역 bump 제거 (2026-08-26).
- [x] `useWorkspaceScope` / `getWorkspaceScope` — coordinator + zustand + optimistic tab을 한 snapshot으로 projection (2026-08-26).
- [ ] `PaneGroup` 내부 dirty state, explorer width 등 pane-local UI state는 zustand slice 후보

### 디버그 코드가 프로덕션 UI에 항상 켜짐

- [x] main NDJSON 로그 — packaged 빌드에서 비활성화 (2026-08-26).
- [ ] renderer → main debug IPC는 dev에서만 의미 있음; preload 노출 정리 optional

### legacy-tauri

- [ ] `legacy-tauri/` — Electron이 메인인 지금 **아카이브/삭제 여부 결정**. 중복 참조(주석, STACK.md) 정리해 신규 기여자 혼란 방지.

---

## Browser

- [ ] 이 외에 브라우저 관련 기능 **Orca 참고해서 고도화** (지금 너무 불편함) — 주소창 히스토리/자동완성, 탭 그룹 UX, 북마크, 세션 복원 등 우선순위 정리 필요.
- [ ] **"어느 탭이 포커스인지" 실사용 검증** — `browser:guest-focus` IPC + `activeBrowserWebview` registry 경로는 있음. Cmd+R/Cmd+L/줌이 **의도한 pane tab**에 적용되는지 시나리오 테스트 후 미흡하면 IC와 통합.
- [ ] **메모리: workspace tab마다 webview 동시 마운트** — 탭 N개 × browser pane이면 Chromium guest 프로세스가 그대로 N배. Phase 3 `WebviewRegistry` + LRU(~4) + 백그라운드 tab `display:none` 유지 vs cold destroy 정책 (`docs/architecture/07-future-phases.md`).
- [ ] split layout에서 browser+browser 동시 표시 — native guest가 z-index 무시하는 Electron 한계. pane `isolation`+`overflow:hidden`으로 충분한지, 한쪽만 live로 둘지 제품 정책 명시.

---

## Terminal

- [ ] `lib/pane-manager/*` — Orca에서 포팅된 xterm 파이프라인. `TerminalPane`만 사용 중이라 **경계 문서화** 또는 dead code 정리 (WebGL renderer path, GPU acceleration `"off"` 하드코딩 등).
- [ ] 터미널 **GPU/WebGL 옵션** — 설정에서 켤 수 있게 (ROADMAP Phase E 잔여).
- [ ] pane hidden 시 **cold-park** (30s 후 xterm unmount, PtySession은 main에 유지) — Phase 3. workspace tab 전환 시에도 메모리 절감.

---

## Layout / Drag-and-drop

- [ ] **HTML5 chip drag** vs **flexlayout pane strip drag** — 두 시스템이 `LayoutTabDropOverlay`에서 합쳐지지만 preview 소스가 다름(geometry vs flexlayout outline). 공통 `resolveSplitDropPreview()`로 더 단순화 가능.
- [ ] `layoutRef.startPaneDrag` synthetic dragover forwarding — flexlayout overlay/`pointer-events`와 fragile. 통합 테스트 또는 E2E로 회귀 방지.
- [ ] flexlayout native tab bar는 CSS로 숨김 — upstream 업데이트 시 깨질 수 있음. 버전 pin + 스모크 체크리스트.

---

## Editor / Markdown

- [ ] Editor pane — 파일 watcher ↔ dirty 상태, multi-root workspace 미지원 등 VS Code 대비 갭 목록화.
- [ ] Markdown live preview — wikilink/플러그인 유지보수, 큰 파일 성능.

---

## Persistence / 데이터

- [ ] **Phase 4: layout JSON Zod + salvage** — corrupt JSON이 startup을 죽이지 않게 (`07-future-phases.md`).
- [ ] layout export to `./.workspace/layout.json` (ROADMAP Phase E).
- [ ] `PaneGroupConfig` / `PaneTabItem` 스키마 버전 필드 — 마이그레이션 전략.

---

## 테스트 / QA

현재 자동 테스트: `terminal-shortcut-policy`, `embedPolicy`, `dragSession`, `workspaceScope`, `layoutTabDrop`, `layoutChipWindowDrop`.

- [x] `layoutTabDrop.resolveDockLocation`, `layoutChipWindowDrop.executeTabChipWindowDrop` unit test (2026-08-26).
- [ ] `InteractionCoordinator.resolveWebviewPolicy`, `layoutActions.moveTabToSplitPane` 등 **순수 함수 unit test** 추가
- [ ] 수동 회귀 체크리스트 문서화: workspace tab 전환, split drag over browser/terminal, popover 열린 채 browser 보임, chip reorder, Cmd+W/Cmd+R, pane close
- [ ] (선택) Playwright/Electron driver smoke test

---

## UX polish (백로그)

- [ ] 에러 표면화 — `PaneErrorBoundary` + `ErrorLogPanel` 있으나 main IPC 실패/toast 일관성
- [ ] 키보드 shortcut discoverability (title tooltip 외 command palette)
- [ ] 테마/폰트 설정 확장 (`AppSettingsDialog`)
