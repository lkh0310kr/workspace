# Terminal 실행·출력·재연결 계약

App scope의 J-03 계약이다. package [TerminalPane](../../../../packages/terminal/src/pane/TerminalPane.tsx)가 xterm mount를 소유하고 Main [PtySession](../../../../apps/desktop/src/main/terminal/ptySession.ts)은 detached [PTY host](../../../../apps/desktop/src/main/terminal/ptyHostDaemon.ts)의 client다. PTY query reply, session buffer와 cold restore 정책도 Terminal package가 소유하며 Main과 renderer가 같은 구현을 사용한다. pane mount·Main handle·shell process의 수명은 다르다. Windows PATH registry 변경 감지와 환경 캐시 무효화도 Main Terminal 경계의 [windows-path-registry-change](../../../../apps/desktop/src/main/terminal/windows-path-registry-change.ts)가 맡는다.

## 계층과 데이터 형식

| 경계            | owner·형식                                                                                                 |
| --------------- | ---------------------------------------------------------------------------------------------------------- |
| shell→host      | node-pty raw bytes, host의 terminalId별 chunks/seq                                                         |
| host↔Main       | token 검증된 local socket/pipe의 JSON-lines; binary는 base64, attach/write/resize/pause/resume/detach/kill |
| Main replay     | StringDecoder('utf8')로 chunk 경계 decode, query-reply echo filter, local seq와 text chunks                |
| Main→renderer   | pty:data `{id,seq,data:Uint8Array}`; pty:connect의 snapshot/lastSeq                                        |
| renderer mux    | terminal별 streaming TextDecoder·seen sequence·pending 출력                                                |
| transport→xterm | snapshot을 먼저 쓰고 activate 후 live output 전달, scheduler가 parse/ACK/recovery 조정                     |
| 입력→shell      | xterm/IME/paste handler→write queue→UTF-8 bytes IPC→host write                                             |

host replay는 약 2MiB byte cap, Main replay는 5000*120 character cap이다. 두 구현 모두 chunks가 여러 개일 때 오래된 chunk를 제거하므로 단일 초대형 chunk의 엄격한 byte 상한으로 서술하지 않는다. Main은 decode한 text를 다시 bytes로 전달하므로 경계 전체에 decoder가 하나뿐이라고 가정하지 않는다. 각 streaming decoder의 split 문자와 snapshot/live sequence 일치가 필요하다.

## 연결·활성화·연결 해제

Desktop runtime adapter의 [ptyTransport](../../../../apps/desktop/src/renderer/src/features/terminal/host/runtime/ptyTransport.ts)는 connect 전에 input queue를 만들고 Main attach 결과를 기다린다. 출력 순서·디코딩·대기 큐를 관리하는 [multiplexer package](../../../../packages/terminal/src/transport/ptyDataMultiplexer.ts)에 Desktop이 IPC 구독과 진단 로그 capability를 주입한다. snapshot lastSeq 이하의 중복을 버리고 이후 live를 transport 내부에 보류한다. connectPanePty가 snapshot을 xterm에 적용한 다음 activate하면 보류 출력을 순서대로 전달한다.

connect 반환은 id/snapshot/snapshotCols/snapshotRows/lastSeq/isReattach다. Main은 기존 daemon session의 snapshot 또는 local replay를 사용하고 native dimensions를 보존한다. disconnect는 subscription/input queue·live buffer를 비우고 Main attach를 해제한다. renderer 숨김/해제만으로 shell process를 kill하지 않는다. layout에서 마지막 terminal 참조가 사라지는 경로가 destroy한다.

## ACK·backpressure·scheduler

Main은 renderer에 전송한 seq별 byte 수를 추적한다. 미해제 credit가 512KiB 이상이면 host output pause, ACK 처리 후 128KiB 이하이면 resume한다. 중복/알 수 없는 seq ACK는 무시하고 disconnect/reset 시 pending credit를 해제한다.

[output scheduler](../../../../packages/terminal/src/pane-manager/pane-terminal-output-scheduler.ts)와 dependency modules는 foreground/background queue·parse barrier·fair drain·backlog cap·stalled-write recovery를 구현한다. renderer는 parse 또는 의도된 discard 시 output credit를 해제해야 한다. **과부하에서 무조건 lossless라는 계약은 아니다.** backlog cap 테스트에는 warning으로 backlog를 대체하고 recovery를 요청하는 경로가 있다. transport byte 순서 보존과 UI backlog 정책을 구분한다.

## 렌더링·입력·환경

Agent status IPC payload 타입과 store 반영 정책은 Terminal package가 소유한다. Agent 상태와 runtime terminal title store는 `zustand/vanilla` 기반이어서 Main과 renderer에서 공유해도 React 런타임을 요구하지 않는다. React 컴포넌트 구독은 Desktop renderer에서만 `zustand`의 `useStore`로 연결한다. Preload listener와 Electron channel 연결은 Desktop 경계에 둔다.

Terminal ID와 workspace pane identity 연결 registry도 Terminal package의 agent slice가 소유한다. Desktop pane/layout adapter가 mount·layout 상태를 반영한다.

PTY OSC title observer와 agent 상태 전이 추적은 Terminal package가 소유하며 Desktop이 workspace pane 상태 갱신 callback을 주입한다.

[@workspace/terminal](../../../../packages/terminal/README.md)의 pane-manager는 xterm와 addons/fit/WebGL/selection/scroll을 소유한다. `visible`/`active` 전환은 rendering suspend/resume와 reveal-fit 정책을 사용한다. TerminalPane의 PTY connect/dispose effect는 이 표시 props에 의존하지 않는다. Workspace/pane 전환은 xterm을 숨기거나 보일 뿐 process를 끊지 않는다. pane unmount·root/identity 변경에서 renderer attachment를 정리하며, Main process 종료는 모든 layout에서 마지막 Terminal 참조가 제거되는 shell 정책을 따른다. 같은 grid의 reveal을 무조건 refit하면 pinned scroll이 변할 수 있으므로 stable fit과 viewport restoration helper를 따른다. replay/parse/fit이 정착하기 전 scroll을 최종 복구했다고 보지 않는다.

Terminal pane view·host 계약·pane-kind factory·theme은 `packages/terminal/src/pane/`, 검색 UI와 검색 보조 코드는 `src/search/`, 붙여넣기·clipboard·파일 드롭·키 입력 정책은 `src/input/`에 둔다. agent/title/status, pane-manager, shared session policy와 transport는 각 도메인 폴더가 소유한다. 제목 기반 agent 상태 적용은 [`agent/title-derived-agent-status.ts`](../../../../packages/terminal/src/agent/title-derived-agent-status.ts), 종료 시 mounted xterm 버퍼 직렬화는 [`pane-manager/capture-terminal-session-buffers.ts`](../../../../packages/terminal/src/pane-manager/capture-terminal-session-buffers.ts)가 소유하고 Desktop은 이를 IPC lifecycle에 연결한다. Package exports는 root API와 `agent`, `input`, `pane`, `pane-manager`, `search`, `shared`, `terminal`, `transport` domain entry point를 제공하고, Desktop consumer는 구현 leaf 경로를 직접 import하지 않는다. Agent 카탈로그와 아이콘도 `packages/terminal/src/agent/ui/`에 둔다. PaneSystem은 package factory에서 만든 pane-kind adapter가 제공하는 tab icon을 그리며 Terminal 전용 UI를 직접 참조하지 않는다. Main OSC title 처리, agent status payload/identity/freshness와 renderer Terminal/Workspace 표시는 같은 package 구현을 사용한다. IPC payload와 Electron channel은 Desktop 경계에 남긴다. Desktop host가 terminal 생성, 검색 addon, theme subscription, portal 등록을 주입한다. PTY 수명과 pane orchestration은 계속 Desktop이 소유한다. Desktop 통합 진입점은 `features/terminal/host/index.ts`와 `features/terminal/host/paneKind.tsx`다. App 조립 시 설치하는 renderer lifecycle은 [useTerminalAgentStatusBootstrap](../../../../apps/desktop/src/renderer/src/features/terminal/host/useTerminalAgentStatusBootstrap.ts)과 [useTerminalInputBootstrap](../../../../apps/desktop/src/renderer/src/features/terminal/host/useTerminalInputBootstrap.ts)에 둔다. `TerminalPaneHost` 계약은 package가 소유하며 process 생성, platform, focus, agent status, clipboard, PTY attach 및 input handler port를 정의한다. Desktop singleton은 [terminalPaneHost](../../../../apps/desktop/src/renderer/src/features/terminal/host/terminalPaneHost.ts)에서 구현한다. 단축키·붙여넣기·파일 드롭의 순수 정책은 package가 소유하며, text/image paste 정책은 `packages/terminal/src/input/terminal-clipboard-paste.ts`에 둔다. Electron clipboard 호출·xterm 연결 wrapper와 PTY·키보드·agent status Desktop runtime adapter는 [features/terminal/host/runtime](../../../../apps/desktop/src/renderer/src/features/terminal/host/runtime/index.ts)에 둔다. 실제 window capture·xterm handler 등록, 파일 경로 이벤트 발생과 Electron clipboard/PTY IPC는 Desktop adapter에 남는다. 이 runtime 경계를 분리할 때 기존 PTY snapshot/replay/ACK/reconnect 결과를 유지한다.

Terminal package의 WebGL auto policy는 renderer의 OS·WebGL 정보만 사용하고 Desktop `window.api`를 직접 읽지 않는다. OS display-server 정보가 필요한 정책은 실제 host capability가 제공될 때 계약으로 주입한다.

입력은 installTerminalKeyHandler/PasteHandler, bracketed paste, query reply와 일반 input batching을 구분한다. OSC52 clipboard, image temp file paste, local file drop, mouse-reporting wheel은 각각의 handler 경로다. IME·Alt/Option·PowerShell/WSL 정책을 일반 browser shortcut으로 대체하지 않는다.

host는 attach 요청의 현재 app environment를 신규 shell에 사용하고 TERM=xterm-256color, COLORTERM=truecolor와 UTF-8 locale을 설정한다. 살아 있는 기존 shell의 env를 새 attach마다 다시 쓰는 기능은 아니다. launcher NO_COLOR와 stale daemon 환경에 대한 이전 조사·제거 절차는 [포팅 기록](./porting-history.md)이다.

## 검증과 남은 범위

TERM-01 snapshot/live 중복·순서, TERM-02 분할 한글/emoji bytes, TERM-03 parse/discard ACK와 watermark resume, TERM-04 pinned scroll hide/show/reconnect, TERM-05 paste/IME/mouse reporting, TERM-06 normal quit와 daemon exit의 차이를 수락 기준으로 둔다.

자동 근거는 ptyDataMultiplexer, scheduler 계열, xterm-parse-barrier, reveal-fit/scroll, paste/shortcut 테스트다. test wrapper는 전체 suite를 실행하며 Vitest worker에 `--expose-gc`를 전달한다. GC 의존 queue-retention 검증은 일반 앱 테스트 runner에서도 동작하고 전체 terminal test suite에서 통과한다. 현재 문서는 전체 scheduler 분기·OS별 입력·실제 installed reconnect를 재생성/검증 완료한 상태가 아니다.

Agent 상태와 workspace별 runtime title store는 `packages/terminal/src/state/`에 둔다. Option key 위치 추적과 공유 tracker도 `packages/terminal/src/keyboard/`에 둔다. Desktop의 PTY spawn/resize 및 Terminal paste shortcut IPC는 `features/terminal/host/runtime/terminalIpc.ts`가 연결한다. Editor와 Terminal이 공유하는 native clipboard adapter는 `adapters/platform/nativeClipboard.ts`다. Workspace와 Desktop adapter는 Terminal 기능의 공개 진입점에서 package API를 사용한다. Electron IPC relay와 layout 모델의 Terminal pane 수집은 Desktop `features/terminal/host/runtime/`에 둔다.
