# @workspace/terminal

Terminal feature package: pane view and pane-kind definition factory, host contract, pane manager, output scheduling, fit/scroll/WebGL, terminal theme, input policies, keyboard layout tracking, clipboard text/image paste policy, input queue, selection copy, search UI, terminal agent/title/status domain and its renderer state stores. Desktop retains Electron clipboard/PTY IPC, process/session ownership, platform keyboard/input adapters, IPC DTOs, and the singleton host implementation.

The package exports its root API and only the currently consumed Desktop subpaths. Pane-manager and agent implementation files remain private by default.

Pane visibility and selection only control rendering and focus. They do not own PTY attach/dispose lifetime. `TerminalPane` and its pane-kind factory are package-owned and receive `TerminalPaneHost`; Desktop provides terminal creation, PTY, agent-store, clipboard, theme, and input-handler capabilities. Detailed contracts and acceptance gaps: [Terminal architecture](../../docs/architecture/workspace/terminal/README.md).
