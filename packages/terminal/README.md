# @workspace/terminal

Terminal feature package: pane view and host contract, pane manager, output scheduling, fit/scroll/WebGL, terminal theme, input policies, clipboard text/image paste policy, input queue, selection copy, search UI, terminal agent/title/status domain and its renderer state stores. Desktop retains Electron clipboard/PTY IPC, process/session ownership, platform keyboard/input adapters, IPC DTOs, and the singleton host implementation.

Pane visibility and selection only control rendering and focus. They do not own PTY attach/dispose lifetime. `TerminalPane` is package-owned and receives `TerminalPaneHost`; Desktop provides PTY, agent-store, clipboard, theme, and input-handler capabilities. Detailed contracts and acceptance gaps: [Terminal architecture](../../docs/architecture/workspace/terminal/README.md).
