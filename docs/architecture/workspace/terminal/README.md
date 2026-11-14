# Terminal 실행·출력·재연결 계약

App scope의 J-03 계약이다. [TerminalPane](../../../../apps/workspace-app/src/renderer/src/panes/TerminalPane.tsx)가 xterm mount를 소유하고 Main [PtySession](../../../../apps/workspace-app/src/main/ptySession.ts)은 detached [PTY host](../../../../apps/workspace-app/src/main/ptyHostDaemon.ts)의 client다. pane mount·Main handle·shell process의 수명은 다르다.

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

## Connect·activate·disconnect

[ptyTransport](../../../../apps/workspace-app/src/renderer/src/terminal/ptyTransport.ts)는 connect 전에 input queue를 만들고 Main attach 결과를 기다린다. global [multiplexer](../../../../apps/workspace-app/src/renderer/src/terminal/ptyDataMultiplexer.ts)는 대기 중 출력을 보관한다. snapshot lastSeq 이하의 중복을 버리고 이후 live를 transport 내부에 보류한다. connectPanePty가 snapshot을 xterm에 적용한 다음 activate하면 보류 출력을 순서대로 전달한다.

connect 반환은 id/snapshot/snapshotCols/snapshotRows/lastSeq/isReattach다. Main은 기존 daemon session의 snapshot 또는 local replay를 사용하고 native dimensions를 보존한다. disconnect는 subscription/input queue·live buffer를 비우고 Main attach를 해제한다. renderer 숨김/해제만으로 shell process를 kill하지 않는다. layout에서 마지막 terminal 참조가 사라지는 경로가 destroy한다.

## ACK·backpressure·scheduler

Main은 renderer에 전송한 seq별 byte 수를 추적한다. 미해제 credit가 512KiB 이상이면 host output pause, ACK 처리 후 128KiB 이하이면 resume한다. 중복/알 수 없는 seq ACK는 무시하고 disconnect/reset 시 pending credit를 해제한다.

[output scheduler](../../../../apps/workspace-app/src/renderer/src/lib/pane-manager/pane-terminal-output-scheduler.ts)와 dependency modules는 foreground/background queue·parse barrier·fair drain·backlog cap·stalled-write recovery를 구현한다. renderer는 parse 또는 의도된 discard 시 output credit를 해제해야 한다. **과부하에서 무조건 lossless라는 계약은 아니다.** backlog cap 테스트에는 warning으로 backlog를 대체하고 recovery를 요청하는 경로가 있다. transport byte 순서 보존과 UI backlog 정책을 구분한다.

## Rendering·입력·환경

pane-manager는 xterm와 addons/fit/WebGL/selection/scroll을 소유한다. visible/active 전환은 rendering suspend/resume와 reveal-fit 정책을 사용한다. 같은 grid의 reveal을 무조건 refit하면 pinned scroll이 변할 수 있으므로 stable fit과 viewport restoration helper를 따른다. replay/parse/fit이 정착하기 전 scroll을 최종 복구했다고 보지 않는다.

입력은 installTerminalKeyHandler/PasteHandler, bracketed paste, query reply와 일반 input batching을 구분한다. OSC52 clipboard, image temp file paste, local file drop, mouse-reporting wheel은 각각의 handler 경로다. IME·Alt/Option·PowerShell/WSL 정책을 일반 browser shortcut으로 대체하지 않는다.

host는 attach 요청의 현재 app environment를 신규 shell에 사용하고 TERM=xterm-256color, COLORTERM=truecolor와 UTF-8 locale을 설정한다. 살아 있는 기존 shell의 env를 새 attach마다 다시 쓰는 기능은 아니다. launcher NO_COLOR와 stale daemon 환경에 대한 이전 조사·제거 절차는 [포팅 기록](./porting-history.md)이다.

## 검증과 남은 범위

TERM-01 snapshot/live 중복·순서, TERM-02 분할 한글/emoji bytes, TERM-03 parse/discard ACK와 watermark resume, TERM-04 pinned scroll hide/show/reconnect, TERM-05 paste/IME/mouse reporting, TERM-06 normal quit와 daemon exit의 차이를 수락 기준으로 둔다.

자동 근거는 ptyDataMultiplexer, scheduler 계열, xterm-parse-barrier, reveal-fit/scroll, paste/shortcut 테스트다. test wrapper는 현재 인자를 전달하지 않으므로 targeted 실행은 app directory의 `npx vitest run <test paths>`를 사용한다. GC 의존 queue-retention과 기존 일부 close/shortcut 실패는 [검증 기록](../../../../docs/architecture/spec-driven-development.md)에 있다. 현재 문서는 전체 scheduler 분기·OS별 입력·실제 installed reconnect를 재생성/검증 완료한 상태가 아니다.
