# Archived — Tauri 2 implementation

**Status:** Frozen reference only. Active development is in [`electron/`](../electron/).

This directory is the pre-Electron workspace app (Tauri 2 + Rust + Wry browser child webview). It was replaced because:

- Native child webview compositing caused z-order and detach bugs with flexlayout splits
- Unsigned Rust builds triggered macOS Gatekeeper friction
- Orca's Electron patterns (terminal IME, browser guest lifecycle) were easier to adopt on Electron

## Do not

- Add features here expecting them to ship in the main app
- Copy files from here without reconciling with the Electron codebase (APIs differ: `tauri.ts` vs `electron.ts`, IC, embed policy)

## Can still build (optional)

```bash
cd legacy-tauri
cargo run -p workspace-app
```

Use only for historical comparison or porting a specific UX idea — port into `electron/src/renderer/`.

## Electron equivalents

| legacy-tauri | electron |
|--------------|----------|
| `ui/src/App.tsx` | `electron/src/renderer/src/App.tsx` |
| `ui/src/panes/BrowserPane.tsx` | `BrowserContent.tsx` + `PaneGroup` |
| `ui/src/browser/useBrowserHost.ts` | `<webview>` + `InteractionCoordinator` |
| `crates/workspace-core` | `electron/src/main/workspace.ts` |

See root [README.md](../README.md) and [docs/architecture/](../docs/architecture/).
