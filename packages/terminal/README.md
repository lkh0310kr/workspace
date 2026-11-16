# @workspace/terminal

Terminal renderer package: pane manager, output scheduling, fit/scroll/WebGL, terminal input helpers, search UI, and terminal policies. Desktop retains Electron PTY IPC, process/session ownership, app stores, and the adapter that connects panes to them.

Pane visibility and selection only control rendering and focus. They do not own PTY attach/dispose lifetime. Detailed contracts and acceptance gaps: [Terminal architecture](../../docs/architecture/workspace/terminal/README.md).
