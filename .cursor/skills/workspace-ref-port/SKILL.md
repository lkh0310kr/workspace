---
name: workspace-ref-port
description: >-
  Port solved patterns from reference apps into the Workspace Electron app —
  not scoped to any one domain (terminal/browser, vector editor interactions,
  game-hosting UX, whatever). Use whenever building or fixing a feature that a
  real open-source project has already solved, or when the user asks to copy,
  port, 베끼기, or match reference architecture.
---

# Workspace reference porting (베끼기)

**Goal:** Workspace는 이미 검증된 앱의 해결책을 **재발명하지 않고** `electron/`에 이식한다. 도메인 무관 — 터미널이든, 벡터 에디터 interaction이든, 게임 호스팅 UX든 똑같은 워크플로.

**원칙:** 참고 레포 전체를 읽지 않는다. **해당 문제를 이미 푼 파일/모듈만** 찾아서 가져온다. 필요하면 그 자리에서 새로 `git clone`해서 쓴다 — 아래 표는 이미 클론된 것들의 기록이지, "이 목록에 있는 것만 참고 가능"이라는 뜻이 아니다.

## 레포 구조

| 경로                 | 역할                                    |
| -------------------- | --------------------------------------- |
| `ref-proj/`          | **읽기 전용** 참고 구현. 커밋·수정 금지 (repo root `.gitignore`의 `/ref-proj` 규칙으로 항상 untracked) |
| `electron/`          | **실제 제품** — 여기만 수정             |
| `docs/architecture/` | 현재 Workspace 아키텍처 (이식 전 필독)  |

### ref-proj에 이미 클론된 것 (기록용 — 필요하면 새로 더 clone하면 됨)

| 참고               | 주로 베낀 영역                                                      |
| ------------------ | ------------------------------------------------------------------- |
| `ref-proj/orca/`   | 터미널(xterm/node-pty), pane-manager, WebGL, webview/IC, PTY replay |
| `ref-proj/itch/`   | Electron 안에서 HTML5/WASM 콘텐츠(Godot Web export 등) 호스팅 UX — `enter-html-full-screen`/`leave-html-full-screen` 처리 포팅 (2026-08-28) |
| `ref-proj/logseq/` | 블록 에디터, 아웃라인, 그래프 UI 패턴                               |
| `ref-proj/zed/`    | 에디터/워크스페이스 UX, 패널·포커스 철학                            |
| `ref-proj/Zettlr/` | 마크다운 WYSIWYG, 파일 트리                                         |
| `ref-proj/cef-rs/` | 브라우저 임베딩(CEF) — Electron webview와 대조용                    |

목록에 없는 프로젝트(VS Code, tldraw, Penpot 등 — tldraw/Penpot은 Vector Editor 작업 때 실제로 클론해서 쓰고 그 pane 자체는 나중에 삭제됨, 워크플로 자체의 선례로 기록만 남김)는 **문제 정의 후 그때 clone**하면 된다 — 사전 승인 필요 없음, `/ref-proj`가 이미 전역 gitignore되어 있어서 뭘 추가로 클론해도 안전.

## 베끼기 워크플로 (매 작업 동일)

```
1. 문제 정의     → Workspace에서 뭐가 안 되는지 / 뭘 만들어야 하는지
2. 참고 물색     → 이미 이 문제를 푼 실제 오픈소스가 있는가? (ref-proj에 이미
                    있으면 재사용, 없으면 그 자리에서 git clone — 라이선스
                    확인, MIT류 선호)
3. 참고 탐색     → 레포 전체를 읽지 않는다. grep으로 해당 모듈만 찾기 (아래 힌트)
4. 최소 복사     → 필요한 파일/패턴만 electron/ 동일 경로 근처에 이식
5. 어댑터 연결   → import 경로, IPC, 타입, lifecycle hook만 맞춤
6. 테스트/검증   → cd electron && npm test -- --run, typecheck, 가능하면
                    실제 아티팩트(fixture)로 동작 검증 — "타입체크 통과"만으로
                    "작동함"이라고 보고하지 않는다
7. 작업별 커밋   → 한 논리 단위당 한 커밋 (사용자 요청 시만), 커밋 메시지에
                    어느 ref-proj/모듈에서 포팅했는지 명시
```

포팅 대상이 터미널/브라우저(Orca)가 아닐 때는 아래 grep 힌트·경로표 대신
해당 ref-proj 안에서 같은 방식(문제 키워드로 grep → 특정 파일만 열기)을
반복하면 된다. 예: itch.io 포팅 때는 `rg "full-screen" ref-proj/itch/src/main`으로
`src/main/reactors/winds.ts` 하나만 찾아서 그 이벤트 핸들링 블록만 가져왔음
(파일 전체를 옮기지 않음).

### 참고 탐색 grep 힌트

```bash
# 예: 스크롤 intent
rg "scroll-intent|scrollToLine|pinnedViewport" ref-proj/orca/src/renderer

# 예: webview registry
rg "webview-registry|WebviewRegistry" ref-proj/orca/src/renderer

# 예: split scroll
rg "pane-split-scroll|pendingSplitScroll" ref-proj/orca/src/renderer
```

**Orca 터미널 스택 기준 경로:** `ref-proj/orca/src/renderer/src/lib/pane-manager/`

## 이식 규칙

### DO

- Orca 모듈을 **파일 단위**로 복사 후 Workspace 타입/IPC에 맞게 최소 수정
- 기존 `electron/src/renderer/src/lib/pane-manager/` 패턴·네이밍 유지
- `docs/architecture/05-terminal-pipeline.md` 등 문서와 실제 코드 정합성 유지
- 포팅 후 **vitest** 추가/복사 (Orca에 `.test.ts` 있으면 같이 가져오기)
- 큰 변경은 **작업별 커밋** (`refactor(pty):`, `feat(terminal):`, `fix(interaction):` 스타일)

### DON'T

- ref-proj 수정, 커밋, 서브모듈 업데이트
- 참고 앱 전체 아키텍처를 Workspace에 그대로 옮기기 (flexlayout 유지)
- tmux 래퍼 재도입 — PTY는 Orca처럼 **login shell 직접 spawn** (`electron/src/main/pty.ts`)
- 휠 이벤트를 PTY arrow key로 포워딩 — `terminal-wheel-scroll.ts`가 viewport만 처리
- webview에 `display:flex` + `pointer-events:none` — IC 정책: 비활성 시 **display:none**
- `TODO.md`, `.cursor/`, `.workspace/`, `test/` 루트 커밋

## Workspace 핵심 아키텍처 (이식 시 맞출 지점)

| 영역           | Workspace 위치                                                 | Orca 참고                     |
| -------------- | -------------------------------------------------------------- | ----------------------------- |
| PTY / replay   | `electron/src/main/pty.ts`, `ptySession.ts`                    | `orca/src/main/` PTY          |
| 터미널 마운트  | `electron/src/renderer/src/lib/pane-manager/`                  | `orca/.../pane-manager/`      |
| PTY 연결       | `electron/src/renderer/src/terminal/connectPanePty.ts`         | Orca pane PTY wiring          |
| Webview / 클릭 | `interaction/InteractionCoordinator.ts`, `webviewDomPolicy.ts` | Orca IC + webview registry    |
| 레이아웃       | flexlayout-react + `layout/`                                   | Orca 내부 split은 **범위 밖** |
| 브라우저       | `panes/BrowserContent.tsx`                                     | Orca browser guest lifecycle  |

**Session vs mount:** main의 `PtySession` + replay buffer = 세션; renderer xterm/WebGL = 마운트. 세션은 탭 전환해도 유지, 마운트만 suspend/resume.

## 이미 이식됨 (2026-08-28 기준)

- itch.io 데스크톱 클라이언트 → HTML fullscreen chrome 숨김 (`enter/leave-html-full-screen`, `src/main/reactors/winds.ts` 참고, `7d76fb9`)
- tldraw → Vector Editor interaction 버그 수정(rotation delta, resize anchor) — 이후 Vector Editor pane 자체는 삭제됐지만 포팅 방식 자체는 선례로 유효

- Orca xterm 패치 + WebGL lifecycle
- PTY: tmux 제거 → login shell 직접
- `terminal-wheel-scroll` (capture-phase, natural direction)
- IC: 비인터랙티브 webview `display:none`
- linkifier hover reset (write / mouseleave / blur)
- `pane-fit` + `pane-scroll` + `terminal-scroll-intent*` (리사이즈 시 viewport 유지)
- `pane-split-scroll` (flexlayout MOVE_NODE edge drop reparent 시 scroll/webgl restore) — `layoutSplitScrollRestore.ts` + `pane-terminal-registry.ts`로 연결
- `webview-registry` + drag passthrough (`browserWebviewRegistry.ts` + `webviewDragPassthrough.ts`) — viewport parking/zoom registry/unregisterGuest IPC는 Workspace에 대응 개념 없어 제외
- vitest 161 passed

## 남은 작업 (우선순위)

| 우선    | Orca 모듈                                                          | Workspace 갭                                                            |
| ------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| Medium  | `embeds/TerminalMountRegistry`, cold-park                          | Phase 3 — hidden terminal park                                          |
| Lower   | `terminal-ligatures-addon.ts`, `terminal-arabic-shaping-joiner.ts` | ligatures / complex script                                              |
| Product | —                                                                  | `TODO.md`: markdown 제목, Editor TreeView 무한루프, Pane Add wrapper UI |

상세 로드맵: `docs/ROADMAP.md`, `docs/architecture/07-future-phases.md`

## 이식 체크리스트 (PR/커밋 전)

- [ ] `cd electron && npm test -- --run` 통과
- [ ] 수동: 터미널 휠 스크롤, 리사이즈 후 scroll 위치, webview 클릭(스플릿 드래그 후)
- [ ] 새 모듈이 lifecycle(`pane-lifecycle.ts`) dispose에 정리되는지
- [ ] README/architecture doc이 틀어지면 해당 한 줄만 수정 (과도한 문서 작업 금지)

## 커밋 메시지 예

```
feat(terminal): port Orca pane-split-scroll for split reparent.

Split reparent owns delayed restore; intermediate fits must not fight it.
```

## 사용자에게 물어볼 때

- ref-proj에 해당 패턴이 **없을 때만** (다른 upstream 경로 필요 여부)
- flexlayout을 Orca pane tree로 **교체할지** (기본: No)
- 커밋/푸시 요청이 명시되지 않았으면 **커밋하지 않음**
