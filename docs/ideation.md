Idea: Code Editting + Markdown Editting (WYSIWYG) + Terminal + Browser In One Workspace
Feature

- Workspace
  - Tabs
  - Panes
  - Split
  - Window Layout
- Windows
  - Terminal
    - PTY
    - Shell
    - GPU Rendering
  - Browser
    - WebView
    - Navigation
    - Browser Tabs
  - Code Editor
  - Markdown Editor (WYSIWYG)
    - Editor / Preview
    - File System (Tree View)

Stack:

- Application
  - Language: Rust
    - Application Core
  - Desktop: Tauri 2
  - WebView: Wry
  - Terminal-PTY: portable-pty
  - Termianl-Engine: alacritty_terminal
  - Terminal Renderer: GPU-based
  - Markdown Parser (AST): Rust Markdown parser
  - Markdown Editor: CodeMirror
- Internal System
  - Async: Tokio
  - Serialization Serde
  - File Watcher: notify
  - Search: Tantivy
  - Storage: none (./.workspace/\*\*.\* saved)
