# TODO

Phase 2 (구조·안정성·리팩토링)는 **완료**. 이 문서는 Phase 3+ 백로그와 제품 방향만 추적한다.

상세 아키텍처: [docs/architecture/07-future-phases.md](docs/architecture/07-future-phases.md)  
수동 QA: [docs/manual-qa-checklist.md](docs/manual-qa-checklist.md)

---

## Phase 3 — Embed 예산 & 세션 (다음 우선순위)

**목표:** workspace tab / pane 수가 늘어도 메모리·CPU가 선형 폭발하지 않게.

| 영역 | 방향 |
|------|------|
| Browser | `WebviewRegistry` + LRU(~4 live guests). 백그라운드 tab은 `display:none` 유지 vs cold destroy 정책 결정 |
| Terminal | pane hidden 30s 후 xterm unmount, main `PtySession` 유지 (Orca cold-park) |
| Workspace tab | 비활성 tab layout host는 mounted 유지하되 embed만 park |

**선행 작업:** browser+browser split에서 한쪽만 live로 둘지 제품 정책 문서화.

---

## Browser — Orca 패리티 (UX)

현재: 주소창 히스토리/자동완성, favicon, zoom, downloads bar, reload/stop.  
부족한 것 (우선순위 제안):

1. **세션 복원** — workspace 재시작 시 browser tab URL 복원 검증 (layout JSON에 이미 저장됨)
2. **북마크 / pinned tabs** — pane tab kind 확장 또는 별도 store
3. **탭 그룹 UX** — chip drag 외 “새 창으로 분리” 명시적 메뉴
4. **Cmd+R/Cmd+L 포커스** — `browser:guest-focus` + active registry 실사용 시나리오 테스트 ([manual QA](docs/manual-qa-checklist.md))
5. **주소창** — 검색 엔진 설정, 도메인 자동완성 품질

참고 구현: `legacy-tauri/ui/src/panes/browser/` (아카이브, 포팅 시 Electron API로 변환).

---

## Platform

- [ ] **Sandbox / threat model** — `webPreferences.sandbox: false` 유지 이유, preload IPC allowlist, 문서화
- [ ] **macOS TCC / 배포 가이드** — Full Disk Access, entitlements, dev vs `workspace-app` 바이너리별 권한 README 정리
- [ ] **Electron 43+** — 42.x 지원 종료 전 상위 버전 마이그레이션 (42로 올림 완료 시)

---

## Layout / drag

- [ ] chip drag vs pane-strip drag preview — `resolveSplitDropPreview()` 단일화 (geometry + flexlayout outline)
- [ ] `layoutRef.startPaneDrag` synthetic dragover — E2E 또는 통합 테스트로 회귀 방지
- [ ] flexlayout 버전 pin + 업그레이드 스모크 (native tab bar CSS 숨김)

---

## Persistence (Phase 4)

- [ ] layout JSON **Zod + salvage** — corrupt JSON이 startup을 죽이지 않게
- [ ] `PaneGroupConfig` 스키마 버전 필드
- [ ] layout export to `./.workspace/layout.json`

---

## Terminal / Editor

- [ ] `lib/pane-manager/*` — dead code vs `TerminalPane` 경계 문서화
- [ ] 터미널 GPU/WebGL 설정 노출
- [ ] Editor — multi-root, watcher↔dirty, markdown 대용량 성능

---

## 구조 (낮은 우선순위)

- [ ] `PaneGroup` dirty / explorer width → zustand slice (선택)
- [ ] `useFlexlayoutDragPolicy()` — drag orchestration 추가 분리 (선택)
- [ ] `layoutRef` / IC singleton — 테스트용 injectable facade (선택)

---

## UX polish

- [ ] IPC 실패 toast 일관성 (`ErrorLogPanel` 연동)
- [ ] Command palette / shortcut discoverability
- [ ] `AppSettingsDialog` 테마·폰트 확장

---

## 테스트 자동화

현재 unit: `embedPolicy`, `dragSession`, `workspaceScope`, `webviewPolicy`, `layoutTabDrop`, `layoutChipWindowDrop`, `layoutSplitPolicy`, `layoutActions.split`, `terminal-shortcut-policy`.

- [ ] Playwright/Electron driver smoke (workspace tab switch + chip drop)
- [ ] IC reconcile integration test (mock webview style application)

---

## 방향 요약 (2026-08)

```text
Phase 2 ✅  App 슬림화, embed/IC policy, zustand layoutRevisions, dragSession, workspaceScope
Phase 3 ⏳  WebviewRegistry LRU + terminal cold-park + embed 예산
Phase 4 ⏳  Layout Zod salvage + 스키마 버전
Product   ⏳  Browser Orca 패리티, 배포/TCC 가이드, QA 자동화 일부
```

**원칙:** 가시성/입력 정책은 `embedPolicy` + `webviewPolicy` + IC 한 경로로만 변경. 새 overlay/drag 종류는 `dragSession`에 등록.
