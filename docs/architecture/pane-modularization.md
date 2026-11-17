# Pane·기능 모듈 경계와 동작 보존 원칙

이 문서는 Desktop의 Home, Browser, Terminal, Editor 기능을 shell과 분리 가능한 단위로 모듈화할 때 지킬 경계와 기존 동작 계약을 정의한다. 목표는 독립 프로세스나 별도 제품으로 만드는 것이 아니라, 앱 shell이 명시적인 host capability를 주입하면 각 기능을 독립 mount·실행·검증할 수 있도록 만드는 것이다.

## 이름과 현재 결합도

| 기능     | 현재 형태                                                  | Workspace·shell 결합                                                                       | 다른 pane 직접 결합                                 | 독립 실행의 주요 장애물                                                       |
| -------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------- | ----------------------------------------------------------------------------- |
| Home     | Workspace 화면을 대체하는 고정 view이며 pane kind가 아님   | 중간: App이 navigation/bootstrap을 소유하고 summary API를 adapter로 제공                   | 낮음                                                | `App` route/lifecycle 및 Workspace hydration과의 명시적 host 계약             |
| Browser  | pane kind의 overlay render 계약으로 guest layer를 mount    | 높음: workspace/pane/item ID, layout, focus, InteractionCoordinator, guest registry에 연결 | 낮음: shared keyboard-surface broker 경유           | Electron webview 수명과 layout registry를 feature host capability로 좁힐 필요 |
| Terminal | pane kind와 renderer/Main PTY 계층으로 구성                | 높음: cwd, workspace/pane ID, layout 참조 집계, agent 상태 및 detached PTY host에 연결     | 낮음~중간: focus·browser-open·scroll/selection 연결 | global `window.api`, xterm/pane-manager, shell-owned process lifecycle        |
| Editor   | pane kind와 에디터·파일 트리·검색·Quick Open 기능으로 구성 | 높음: workspace 파일 API, pane/layout, 열기·선택 상태에 연결                               | 낮음: 일반 UI primitive만 공유                      | local editor provider와 shell navigation을 host capability로 좁힐 필요        |

Editor는 파일 편집기, 파일 트리, 파일 검색, Quick Open을 소유한다. 이들은 공용 UI가 아니라 Editor 내부 기능이다. 브라우저 pane에서 Editor 단축키가 동작하지 않도록 editor-capable pane에만 등록한다.

Home은 현재 pane이 아니므로 Browser·Terminal과 같은 pane registry에 억지로 넣지 않는다. Home 화면을 독립 feature로 다루되 기존 Workspace navigation 계약은 유지한다.

## 동작 보존 불변식

모듈화는 책임과 코드 경계만 바꾼다. 사용자에게 관찰되는 결과, 저장 데이터, 외부 호출 순서, 오류·취소 처리와 자원 수명은 기존 계약과 같아야 한다.

- pane의 선택, focus, visibility는 렌더링·입력 라우팅 신호다. Terminal process 또는 Browser guest의 존재 여부를 결정하지 않는다.
- Terminal은 현재 선택된 Workspace/pane이 바뀌어도 살아 있어야 한다. 모든 Workspace layout에서 해당 Terminal의 마지막 참조가 제거되거나 기존의 명시적 종료 동작이 실행될 때만 Main/PTY host가 종료한다. React unmount·detach·hide는 process 종료와 다르다.
- Main의 `workspace/terminalReferences.ts`가 변경·제거되는 layout의 terminal ID와 남은 모든 Workspace layout을 비교해 파기 가능한 PTY를 판정한다. `Workspace.selectTab`은 활성 탭만 바꾸며 terminal reference를 제거하지 않는다.
- Browser guest는 browser item identity에 속한다. Workspace/pane 전환, chip 비활성화, overlay 숨김, 재부착은 guest 파괴가 아니다. 기존 close/remove 정책이 해당 browser item을 닫을 때 destroy한다.
- Terminal과 Browser 사이 focus 이동은 공통 host capability를 통한다. 어느 기능도 다른 기능의 DOM selector나 내부 모듈을 직접 호출하지 않는다.
- Home의 요약 polling, refresh 중복 처리, 오류 표시, unmount 뒤 늦은 결과 무시는 유지한다. host의 system-summary capability를 주입할 수 있어도 호출 주기와 화면 결과는 바꾸지 않는다.
- Workspace tab ID, pane node ID, pane item ID, terminal ID, Browser guest ID는 서로 다른 소유자의 식별자다. 모듈화 과정에서 서로 대체하거나 선택 상태와 자원 소유 상태를 합치지 않는다.

## 목표 모듈 계약

각 기능은 자체 renderer view, 내부 상태와 cleanup을 소유한다. 앱 shell은 명시적인 typed context/capability만 제공한다.

- Home host: system summary 읽기 capability와 현재 Home mount 수명.
- Browser host: URL/tab 변경, pane focus·selection 요청, overlay viewport host, Browser guest lifecycle capability.
- Terminal host: PTY connect/write/resize/ack/detach, clipboard/drop, URL open, focus handoff, 선택적 agent-status capability.
- 공통 Pane host: pane identity, 표시/focus 신호, title/update/close 요청. Workspace store, layout model, 형제 pane 구현을 직접 노출하지 않는다.

Home·Browser·Terminal의 기능 경계는 `packages/home`, `packages/browser`, `packages/terminal`이고 Desktop 기능별 host adapter는 각 vertical slice의 `apps/desktop/src/renderer/src/features/<기능>/host/`에 둔다. Browser·Terminal의 pane-kind 정의 factory도 각 package가 소유하며 Desktop의 `features/browser/host/paneKind.tsx`, `features/terminal/host/paneKind.tsx`는 host capability를 주입하고 중앙 pane registry에 연결한다. Home 화면·위젯·갱신 상태와 스타일은 `packages/home` 소유이며 Desktop은 route, navigation chrome, system-summary IPC adapter를 연결한다. Editor의 tree, document surface, search·Quick Open primitives와 tree state·keyboard policy는 `packages/editor` 소유다. Desktop `features/editor/pane/`은 workspace/pane layout 통합을, `provider/local/`은 로컬 파일 접근과 EditorProvider 구현을, `input/`은 Editor 입력·단축키 연결을 소유한다. Viewer의 Desktop IPC와 플랫폼 구현은 `viewers/host/`에 둔다. `EditorSidebar`는 파일 tree/search 화면을 Editor-capable pane에 조립한다. Browser pane view·overlay slot·controls, 탭 URL/라벨 정책과 pane chrome CSS는 `packages/browser` 소유다. Terminal pane view·theme/style, 입력 정책·queue, agent status와 runtime title store는 `packages/terminal` 소유다. 두 host capability 계약도 package가 소유하고 Desktop singleton adapter가 구현한다. Browser의 Electron guest creation·persistent registry·InteractionCoordinator와 Terminal의 terminal process creation, 실제 key/paste handler·keyboard surface·PTY attach는 Desktop adapter에서 제공한다. Browser download store와 Terminal 입력·붙여넣기·파일 드롭 정책은 각 package가 소유한다. 독립 mock mount는 Home·Browser·Terminal 모두에서 확인했으며, Browser 모의 탐색과 Terminal mock PTY 출력/입력 echo도 동작한다. Electron에서는 Browser guest 전환·닫기와 Editor image viewer 경로 변경을 확인했으며, Terminal 프로세스의 workspace 전환 수명 검증은 남아 있다.

공용 pane frame, tab strip, pane group layout, `flexlayout-react` 통합 스타일은 Desktop `features/pane-system/paneSystem.css`가 소유하며 `WorkspaceLayoutHost`에서 불러온다. App shell과 Editor 알림, Agent Usage 스타일은 각 Desktop feature slice가 소유한다. App·Workspace·Editor·Agent Usage가 공유하는 설정 패널 스타일은 `packages/ui`가 제공한다. 전역 `assets/styles.css`에는 design token, reset, 실제 전역 공용 primitive만 둔다.

Workspace 탭 데이터와 hydration은 `features/workspace/state/workspaceStore.ts`가 소유한다. live FlexLayout model, 저장 debounce, pending rebalance·ensure 상태, pane별 선택/layout revision과 focus된 tabset은 `features/pane-system/state/paneSystemStore.ts` 및 `pane-system/layout/workspaceLayoutModels.ts`가 소유한다. Workspace runtime composition은 layout 저장 capability를 주입하고, 탭 layout이 바뀌었을 때 Pane System에 snapshot을 전달한다. Pane System UI와 layout action은 Workspace store를 통해 Pane System 상태를 읽거나 변경하지 않는다.

Editor의 pane tab 열기·교체, dirty·close lifecycle, 경로 rename/delete 반영은 Editor의 `features/editor/pane/` slice 소유다. 로컬 파일 provider와 filesystem/session은 `features/editor/provider/local/`, 입력·단축키 연결은 `features/editor/input/`, viewer IPC와 Desktop viewer composition은 `features/editor/viewers/host/`에 둔다. `runtime/`에는 아직 소유 slice가 확정되지 않은 Desktop 연결 코드가 남아 있을 수 있으며, 새 기능 코드를 이 공용 성격의 폴더에 추가하지 않는다. Pane System은 Editor 공개 진입점이나 pane adapter를 통해 파일을 열며 Editor 내부 pane lifecycle 구현을 직접 소유하지 않는다.

여러 기능에서 재사용하는 renderer primitive인 Popover, ContextMenu, MenuList는 `packages/ui` 소유다. Desktop adapter가 portal registration과 제품 아이콘을 주입하며, 각 기능의 메뉴 항목과 실행 권한은 기능 host가 결정한다.

독립 실행 수준은 실제 Desktop 밖에서 각 feature를 mock host capability로 mount할 수 있고, feature 코드가 App·Workspace store·PaneGroup·형제 feature를 직접 import하지 않는 상태를 뜻한다. Electron webview와 PTY 구현은 Desktop adapter에 남으며 실제 실행 경계는 mock으로 대체할 수 있어야 한다. `apps/desktop/visual-tests/feature-sandbox/`는 Home·Browser·Terminal 패키지를 Desktop shell 바깥에서 직접 mount하는 개발용 harness다. Home은 Workspace에서 나갈 때처럼 unmount하고, Browser와 Terminal은 pane 선택을 바꿔도 guest/process 생명주기를 보존하도록 mount 상태로 숨긴다. `npm run dev`, `npm run typecheck`, `npm run build` 명령은 해당 디렉터리에서 실행한다. Home 요약, Browser mock navigation, Terminal prompt와 line echo를 브라우저에서 확인했다. Electron에서 Browser guest는 pane 전환 후 복구되고 닫혔으며, Editor image viewer는 다른 이미지 경로로 전환됐다. 설치된 Electron 앱에서 PTY 명령을 실행한 뒤 다른 Workspace 탭으로 전환하고 돌아와 명령 완료 출력을 확인했다. 모든 OS와 장기 실행 PTY 동등성은 검증 범위에 포함되지 않는다. `npm run check:feature-package-boundaries`는 Home·Browser·Terminal package의 Desktop shell·형제 package import, 직접 `window.api` 접근과 Electron ambient type 의존을 검사한다. mock mount와 수동 acceptance는 모든 OS·실제 장기 실행 PTY 동등성을 보장하지 않는다.

## 단계와 수락 조건

1. 현재 결과와 lifecycle 참조를 고정하고 feature별 host contract를 정의한다.
2. Home의 system summary 의존을 주입형 host capability로 바꾸되 route, 갱신 주기, 상태 출력을 유지한다.
3. Browser/Terminal focus 직접 호출을 shared focus handoff capability로 옮기고 Browser overlay render를 pane-kind 계약에 둔다. guest close 정책은 item removal 기준으로 유지한다.
4. Terminal PTY API와 Browser guest API를 feature adapter 뒤에 두고 shell은 최소 context만 주입한다. Terminal process와 Browser guest의 소유자는 계속 Main/기능 runtime이며 selection/visibility가 아니다.
5. 각 feature를 mock host로 독립 mount할 수 있는 harness와 boundary checks를 둔다. 기존 UI·IPC·저장·lifecycle 결과와 대조한다.

단계 완료에는 해당 기능의 기존 observable result와 lifecycle 보존을 검토해야 한다. 타입 검사나 빌드만으로 사용자 동작 동등성을 선언하지 않는다.
