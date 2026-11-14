# Desktop 시작·종료·restore 계약

App scope에서 Main·preload·renderer의 수명을 정의한다. 근거는 [main entry](../../src/main/index.ts), [Workspace](../../src/main/workspace.ts), [renderer bootstrap](../../src/renderer/src/hooks/useAppBootstrap.ts), [workspaceStore](../../src/renderer/src/store/workspaceStore.ts)다.

## 시작 순서

1. ready 이전에 startup logging·GPU/IME/WSL 관련 환경과 protocol scheme을 준비한다. packaged 앱은 single-instance lock을 사용하고 dev는 별도 상태 namespace로 실행한다.
2. app.whenReady에서 browser session·guest 이벤트·PKMS 등 앱 기능을 연결한다. config의 default root를 정하고 saved workspace snapshot을 읽는다. WSL의 default seed root 보정과 사용자가 명시한 개별 tab root 보존은 다르다.
3. createWindow 결과를 bindMainWindow로 연결하고 updater를 초기화한다. window handle은 macOS 재생성 때 교체되므로 main→renderer 전송이 최초 window를 영구 캡처하지 않는다.
4. snapshot이 있으면 Workspace.fromSnapshot, 없으면 withRoot. snapshot tab의 실제 root가 유효하지 않으면 default root로 대체하고 layoutSalvage를 적용한다. layout에 참조된 terminal ID를 attach/spawn한다. active workspace ID가 없으면 첫 탭을 선택한다.
5. agent hook/terminal output relay, content protocols, import job 이벤트를 연결한다. 최초 layout도 즉시 persist한다. IPC handlers를 등록하고 renderer가 state를 hydrate한다.

fromSnapshot에서 terminal ID/tab ID의 다음 값을 복원해 기존 ID와 충돌하지 않게 한다. serialized xterm buffers와 살아 있는 PTY daemon의 replay는 같은 자료가 아니다. [저장 inventory](../persistence/README.md)를 따른다.

## Renderer 수명

useAppBootstrap은 전역 error/console logging, browser embed/download relay, terminal agent bridge, reload/plain paste/terminal paste shortcut, quit-time session buffer capture를 설치한다. 해제 함수를 반환하는 hook subscription은 effect cleanup으로 제거한다. console logging 등 모든 installer가 동일 cleanup API를 가진다고 가정하지 않는다.

useWorkspace adapter는 Main state와 updated 이벤트를 받아 store를 hydrate한다. live model/activation은 [layout](../layout/README.md), 화면에 보이는 workspace projection과 native guest focus는 [interaction](../interaction/README.md)이 소유한다. pane 오류는 PaneErrorBoundary, 전역 renderer 오류는 error logging 경로로 간다.

## 창 닫기와 앱 종료

| 사건                       | 현재 동작                                                                                                                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| macOS의 마지막 window 닫기 | 앱을 즉시 quit하지 않음; activate에서 window가 없으면 create/bind                                                                                                              |
| 다른 OS의 모든 window 닫기 | app.quit 요청                                                                                                                                                                  |
| before-quit 첫 진입        | preventDefault 후 async prepareApplicationQuit                                                                                                                                 |
| prepare                    | renderer buffer capture 요청 → Main replay와 merge/save → workspace persist → Main terminal handles dispose → file watcher close → PKMS bridges stop → CAD viewer 자원 dispose |
| prepare 실패               | 오류 기록 후 terminal handles dispose 시도                                                                                                                                     |
| prepare 종료               | applicationQuitPrepared=true 후 app.quit; 두 번째 before-quit은 통과                                                                                                           |
| 주기적 backup              | 45초마다 Main의 terminal buffer autosave; will-quit에서 timer 해제                                                                                                             |

Main handle dispose와 detached host의 process destroy를 구분한다. 정상 app quit은 terminal daemon이 유지할 수 있지만 마지막 layout 참조 제거는 해당 terminal 세션을 destroy한다. OS 재부팅·daemon exit·강제 종료에서는 살아 있는 명령 재개를 보장하지 않는다. xterm buffer 복구는 명령 프로세스 복구가 아니다.

## 수락 조건과 제한

RUN-01 saved active ID가 삭제됐으면 첫 workspace로 복원한다. RUN-02 손상 layout은 salvage/default 경로로 열린다. RUN-03 macOS window 재생성 후 IPC가 새 webContents에 도착한다. RUN-04 정상 quit의 capture 실패가 quit을 영구 막지 않는다. RUN-05 force kill은 마지막 durable 저장 이후 상태만 복구할 수 있다.

layoutSalvage·terminal-cold-restore·terminal-session-buffers·window/focus 관련 테스트가 일부 순수 규칙을 검증한다. 이번 문서 작업은 installed app의 모든 shutdown/restore 경로를 실행한 증거가 아니다. timeout·race의 세부 capture protocol은 [terminalSessionBuffers IPC](../../src/main/ipc/terminalSessionBuffers.ts)가 기준이다.
