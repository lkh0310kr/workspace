# Terminal 포팅 당시 기록

이하 내용은 이전 문제·포팅 결정·당시 검증 기록이다. 원문의 current/missing/progress는 작성 당시를 가리킨다. 현재 구현 기준은 [Terminal 계약](./README.md), 현재 검증 결과는 [SDD 기록](../../../../docs/architecture/spec-driven-development.md)이다. 오래된 파일 경로·상태 설명을 현재 API로 사용하지 않는다.

## Reference-port decision: port a working terminal feature, not its appearance

**Status: implementation in progress.** Orca is the behavioral reference. Workspace keeps
its current Electron IPC, one-terminal-per-pane UI, and local PTY host, but those adapters
must preserve Orca's terminal contracts end to end.

The current implementation is not yet feature-equivalent. In particular, Orca's output
scheduler is a coordinated queue, parse-progress, backpressure, and stalled-write recovery
system. Workspace currently replaces it with a smaller animation-frame coalescer. That
removes queue priority, throughput budgeting, pipeline health/recovery, and the parse barrier.
The existing scroll-intent helpers do not compensate for those missing output/lifecycle
contracts. The PTY transport preserves bytes through its local socket, then `PtySession`
decodes and re-encodes them before renderer delivery; this creates an avoidable second text
boundary and requires live output and snapshot replay to agree exactly about decoder state.

Runtime testing then reproduced a separate scroll defect: a pane pinned at the top jumped to
the live bottom after switching away and back. Orca routes reveal through `fitRevealedPane`,
which avoids a raw reflow when the pane's pixel size and PTY grid are unchanged. Workspace
called `refitPaneTerminal` directly on every reveal. The reveal path now uses Orca's stable
fit decision and applies WebGL refresh separately. Installed-build verification confirms
that switching away from a terminal tab and back preserves the visible first line in both panes.

The missing Codex CLI colors had a separate environment cause. The promoted Workspace process
had inherited `NO_COLOR=1` from the Codex launcher, while Codex's own config already selected
`catppuccin-mocha` and enabled status-line colors. Because the PTY host is detached and outlives
Workspace, its stale environment continued to put new shells into no-color mode after app
restart. Promotion now removes the launcher-only `NO_COLOR`, PTY attach sends the current app
environment, and the host uses that environment for newly spawned shells. An unset preference
stays absent; it must not be sent as an empty variable because Codex treats a present
`NO_COLOR` variable as disabled color. Existing detached hosts can retain stale environment, so
`PROMOTE_STABLE_RESTART_PTY_HOST=1 npm run promote:stable` restarts that host when explicitly
needed. The paired screenshots showed iTerm's colored status line and syntax spans versus the
Workspace session's mostly monochrome view; final verification must compare a fresh session.

These are concrete architectural risks consistent with the reported failures, not yet a
confirmed single cause for every scroll, glyph, or color symptom. Color rendering also
depends on shell capabilities (`TERM`, `COLORTERM`), preserving ANSI bytes, and applying
the active xterm theme; each needs an end-to-end check instead of being inferred from config.

### Porting contract

Treat the terminal as one vertical slice with these invariants:

1. PTY output bytes are ordered and lossless from shell through IPC into one UTF-8 decoder;
   snapshot replay and live data share the same sequence/decoder boundary.
2. xterm parsing has bounded queues, acknowledgements on parse or discard, fairness between
   foreground/background panes, and explicit stalled-parser recovery.
3. Scroll position follows xterm's user-scroll state for live writes. Structural changes
   (reattach/replay/refit) restore a saved viewport only after parsing and fitting settle.
4. Color capability is consistent across PTY environment, ANSI bytes, xterm options, and
   resolved theme. Unicode width/font behavior is verified with Hangul, emoji, and Nerd Font.
5. Hiding/remounting a pane never loses sequence state, pending output credit, or scroll intent.

### Progress

- [x] Output scheduler dependency closure ported (queueing, fair drain, parse barrier,
  backlog bounds, ACK release, and stalled-write health/recovery). Adapted to Workspace's
  PTY ACK API and pane disposal. The focused Orca scheduler suite passes: 104 tests.
- [x] Reveal fit decision ported; it preserves matching PTY grids and defers mismatched
  stable fits. Focused reveal-fit tests pass: 6 tests.
- [x] Split UTF-8 delivery test added for Hangul and emoji; 5 multiplexer tests pass.
- [x] Installed build retains long scrollback; asynchronous output does not move a pinned
  viewport; live Hangul and ANSI color rendering verified.
- [x] Installed-build hide/show check preserves both terminal viewports across a tab switch.
- [x] Codex TUI color suppression traced to stale `NO_COLOR=1` inherited by the detached PTY
  host; promotion now removes that launcher flag and the host uses the app's current environment.
- [ ] Fresh Workspace Codex session matches iTerm status-line and syntax colors after PTY-host
  restart.
- [ ] Reconnect scroll restoration in installed build (not yet exercised independently of
  app restart and output replay).

### Implementation order

1. Port Orca's output-scheduler dependency closure and its tests, adapting only imports,
   PTY acknowledgement, and Workspace pane lifecycle. Do not retain the simplified scheduler
   alongside the port.
2. Port the byte/sequence ownership contract through PTY host → main → renderer and align
   live delivery with snapshot replay. Keep terminal query filtering explicit and byte-safe.
3. Port replay/fit/scroll restoration as one lifecycle contract, then verify wheel behavior
   both with and without TUI mouse reporting. Reveal fit and hide/show acceptance are complete;
   independent reconnect scroll restoration remains open.
4. Verify theme/ANSI/Unicode/font behavior from an actual shell session and fix the first
   failing boundary found. Keep the per-chunk terminal trace disabled in normal production;
   use bounded opt-in diagnostics for fault reports.
5. Run relevant tests and build, then manually exercise long scrollback, high-rate colored
   output, split Hangul/emoji output, pane hide/show, and reconnect before claiming parity.

The app is complete only when these invariants pass in the installed build. Porting a module
or matching Orca's visual layout alone is not acceptance evidence.

Terminal rendering follows an Orca-inspired **session vs mount** split: the shell PTY lives in main; xterm.js is a mount that can suspend without killing the session.

