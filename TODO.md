# TODO

Phase 2 ✅ · Phase 3 embed budget **보류** (chip 전환 회귀로 WebviewRegistry/cold-park 되돌림)

아키텍처: [docs/architecture/07-future-phases.md](docs/architecture/07-future-phases.md)  
수동 QA: [docs/manual-qa-checklist.md](docs/manual-qa-checklist.md)

---

## Phase 3 — Embed 예산 (보류)

chip 전환 안정성 확인 전까지 pane당 webview 항상 마운트, chip은 visibility만.

- [ ] WebviewRegistry LRU — 설계 재검토
- [ ] Terminal cold-park 30s
- [ ] browser+browser split 제품 정책

---

## Phase 4 — Persistence & schema (진행 중)

- [x] layout JSON **Zod + salvage** — corrupt JSON이 startup을 죽이지 않게 (`src/shared/layoutSalvage.ts`)
- [ ] `PaneGroupConfig` / `PaneTabItem` 스키마 버전 필드 + 마이그레이션
- [ ] layout export to `./.workspace/layout.json`

---

## Browser — Orca 패리티

- [x] trackpad 좌우 스와이프 history back/forward (main guest `input-event`)
- [ ] 세션 복원 실사용 검증 (layout JSON URL → guest reload)
- [ ] 북마크 / pinned tabs
- [ ] 탭 그룹 UX (명시적 “새 pane으로 분리”)
- [ ] Cmd+R/Cmd+L 포커스 시나리오 ([manual QA](docs/manual-qa-checklist.md))
- [ ] 주소창 검색 엔진 설정, 도메인 자동완성 품질
- [ ] LRU capacity 설정 노출 (WebviewRegistry 도입 시)

---

## Platform

- [ ] Sandbox / threat model 문서화 (`webPreferences.sandbox: false`)
- [ ] macOS TCC / 배포 entitlements 가이드 (README)
- [ ] Electron 43+ (42.x EOL 전)

---

## Layout / drag

- [ ] `resolveSplitDropPreview()` — chip vs pane-strip preview 단일화
- [ ] `layoutRef.startPaneDrag` E2E 회귀
- [ ] flexlayout 버전 pin + 스모크

---

## Terminal / Editor

- [ ] `lib/pane-manager/*` dead code vs `TerminalPane` 경계 문서화
- [ ] 터미널 GPU/WebGL 설정
- [ ] Editor multi-root, dirty/watcher 갭
- [ ] Markdown 대용량 성능

---

## 구조 (선택)

- [ ] `PaneGroup` dirty / explorer width → zustand slice
- [ ] 비활성 workspace tab embed park (Phase 3)

---

## UX polish

- [ ] IPC 실패 toast + `ErrorLogPanel`
- [ ] Command palette
- [ ] `AppSettingsDialog` 테마·폰트

---

## 테스트 자동화

Unit: embedPolicy, dragSession, workspaceScope, webviewPolicy, layoutTabDrop, layoutChipWindowDrop, layoutSplitPolicy, layoutActions.split, layoutSalvage, browserSwipeNavPolicy, terminal-shortcut-policy.

- [ ] Playwright/Electron smoke
- [ ] IC reconcile integration test

---

## 방향 요약

```text
Phase 3 ⏸  Embed budget 보류 — browser chip 안정성 우선
Phase 4 ⏳  Layout Zod salvage (salvage ✅, schema version/export 남음)
Product   ⏳  Browser Orca 패리티, 배포 가이드
```

**원칙:** embed 가시성 = embedPolicy + webviewPolicy + IC. Browser guest는 chip 전환 시 destroy 하지 않음.
