# Terminal 포팅 당시 기록

이하 내용은 이전 문제·포팅 결정·당시 검증 기록이다. 원문의 current/missing/progress는 작성 당시를 가리킨다. 현재 구현 기준은 [Terminal 계약](./README.md), 현재 검증 결과는 [SDD 기록](../../../../docs/architecture/spec-driven-development.md)이다. 오래된 파일 경로·상태 설명을 현재 API로 사용하지 않는다.

## Reference port 결정: 화면 모양이 아니라 동작을 포팅한다

**당시 상태: 구현 진행 중.** Orca를 동작 기준으로 삼았다. Workspace의 Electron IPC, pane마다 terminal 하나를 두는 UI, local PTY host는 유지하되 adapter 전체가 Orca의 terminal 계약을 보존해야 한다.

당시 구현은 아직 기능이 동등하지 않았다. 특히 Orca의 output scheduler는 queue 조정, parse 진행 추적, backpressure와 멈춘 write의 복구를 함께 처리한다. Workspace는 이를 더 단순한 animation-frame coalescer로 대체하고 있었다. 그 결과 queue 우선순위, 처리량 예산, pipeline 상태 확인/복구, parse barrier가 빠졌다. 기존 scroll-intent helper만으로는 누락된 output/lifecycle 계약을 보완할 수 없다. PTY transport는 local socket까지 byte를 보존하지만 renderer에 전달하기 전에 `PtySession`이 다시 decode·encode한다. 불필요한 두 번째 text 경계가 생기므로 live output과 snapshot replay가 decoder 상태를 정확히 공유해야 한다.

이후 runtime test에서 별도의 scroll 결함을 재현했다. 맨 위에 고정된 pane이 다른 탭으로 전환했다 돌아오면 live output의 맨 아래로 이동했다. Orca는 `fitRevealedPane`으로 reveal하며 pane의 pixel 크기와 PTY grid가 같으면 불필요한 reflow를 하지 않는다. Workspace는 reveal마다 `refitPaneTerminal`을 직접 호출하고 있었다. reveal 경로에 Orca의 안정적인 fit 판단을 적용하고 WebGL refresh는 분리했다. 설치 빌드 확인에서 terminal tab을 나갔다 돌아와도 두 pane 모두 첫 표시 줄을 유지했다.

Codex CLI 색상 누락은 별도의 environment 문제였다. Promote된 Workspace process가 Codex launcher의 `NO_COLOR=1`을 상속했지만, Codex 설정은 이미 `catppuccin-mocha`와 status line 색상을 활성화했다. PTY host는 분리되어 Workspace보다 오래 실행되므로 앱 재시작 뒤에도 이전 environment가 새 shell을 무색상 모드로 실행했다. 이후 promote에서 launcher 전용 `NO_COLOR`를 제거하고 PTY attach가 현재 앱 environment를 전달하며 host가 새 shell을 시작할 때 이 값을 사용하도록 바꿨다. 사용자가 별도 설정을 하지 않았으면 변수도 없는 상태로 둔다. 빈 값으로 전달하면 Codex가 `NO_COLOR` 변수가 존재한다고 판단해 색상을 끌 수 있다. 기존 분리 host는 이전 environment를 유지할 수 있으므로 필요하면 `PROMOTE_STABLE_RESTART_PTY_HOST=1 npm run promote:stable`로 재시작한다. 비교 screenshot에서 iTerm은 status line과 syntax에 색상이 있었지만 Workspace session은 대부분 무채색이었다. 최종 검증은 새 session으로 비교해야 한다.

이는 보고된 실패와 일치하는 구체적인 구조 위험이지만 scroll, glyph, 색상 증상 모두의 단일 원인으로 확정된 것은 아니다. 색상은 shell capability(`TERM`, `COLORTERM`), ANSI byte 보존, 활성 xterm theme 적용에도 영향을 받는다. 설정만 보고 판단하지 말고 end-to-end로 각각 확인해야 한다.

### 포팅 계약

Terminal 전체를 하나의 vertical slice로 보고 다음 불변 조건을 지킨다.

1. Shell에서 IPC를 거쳐 하나의 UTF-8 decoder에 이르는 동안 PTY output byte의 순서와 내용이 보존돼야 한다. Snapshot replay와 live data는 같은 sequence/decoder 경계를 사용한다.
2. xterm parsing queue에는 상한을 두고 parse 또는 폐기 시 ACK한다. Foreground/background pane 사이에 공정하게 처리하며 parser 정체를 명시적으로 복구한다.
3. Live write 중 scroll 위치는 xterm의 사용자 scroll 상태를 따른다. 재연결/replay/refit 같은 구조 변경은 parse와 fit이 끝난 뒤 저장한 viewport를 복원한다.
4. PTY environment, ANSI byte, xterm option, 적용 theme 사이의 색상 capability가 일치해야 한다. Hangul, emoji, Nerd Font로 Unicode 폭과 글꼴을 확인한다.
5. Pane을 숨기거나 다시 mount해도 sequence 상태, 대기 중인 output credit, scroll intent를 잃지 않는다.

### 당시 진행 상태

 - [x] Output scheduler의 의존 경로(queue, 공정한 drain, parse barrier, backlog 상한, ACK 해제, 정체 상태 복구)를 포팅했다. Workspace의 PTY ACK API와 pane 종료 흐름에 맞췄다. Orca scheduler 집중 테스트 104개 통과.
 - [x] Reveal fit 판단을 포팅해 PTY grid가 같으면 유지하고 다르면 안정적인 fit까지 기다리도록 했다. Reveal-fit 집중 테스트 6개 통과.
 - [x] Hangul·emoji를 위한 UTF-8 분할 전달 테스트를 추가했고 multiplexer 테스트 5개 통과.
 - [x] 설치 빌드에서 긴 scrollback을 유지하고 비동기 output이 고정 viewport를 움직이지 않으며 live Hangul과 ANSI 색상이 표시됨을 확인.
 - [x] 설치 빌드에서 tab 전환 후 hide/show해도 두 terminal viewport가 유지됨을 확인.
 - [x] 분리 PTY host가 오래된 `NO_COLOR=1`을 상속해 Codex TUI 색상을 끄는 원인을 찾았다. Promote가 해당 launcher flag를 제거하고 host가 앱의 현재 environment를 사용하도록 변경.
 - [ ] PTY host 재시작 후 새 Workspace Codex session이 iTerm status line과 syntax 색상에 맞는지 확인.
 - [ ] 앱 재시작과 output replay와 분리해 설치 빌드에서 reconnect scroll 복원 확인.

### 구현 순서

1. Orca output scheduler의 전체 의존 경로와 테스트를 포팅한다. import, PTY acknowledgement, Workspace pane lifecycle만 조정한다. 단순 scheduler를 함께 남기지 않는다.
2. PTY host → main → renderer까지 byte/sequence 소유 계약을 포팅하고 live delivery와 snapshot replay를 맞춘다. Terminal query filtering은 명시적이고 byte-safe하게 유지한다.
3. Replay/fit/scroll 복원을 하나의 lifecycle 계약으로 포팅하고 TUI mouse reporting 유무에 따른 wheel 동작을 확인한다. Reveal fit과 hide/show 수락은 완료됐지만 reconnect scroll 복원은 별도 확인이 남아 있다.
4. 실제 shell session에서 theme/ANSI/Unicode/font 동작을 확인하고 처음 실패한 경계를 고친다. 일반 production에서는 chunk별 terminal trace를 끄고 장애 분석은 상한이 있는 opt-in 진단을 쓴다.
5. 관련 테스트와 build를 실행한 뒤 긴 scrollback, 고속 색상 output, 분할 Hangul/emoji, pane hide/show, reconnect를 직접 확인하기 전 parity 완료를 선언하지 않는다.

설치 빌드에서 불변 조건을 통과해야 완료다. 모듈을 포팅했거나 Orca의 화면 배치와 비슷해졌다는 사실만으로 수락 근거가 되지 않는다.

Terminal rendering은 Orca에서 참고한 **session과 mount 분리**를 따른다. Shell PTY는 main에 남고 xterm.js는 session을 종료하지 않은 채 suspend할 수 있는 mount다.
