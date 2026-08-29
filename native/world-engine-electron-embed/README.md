# world-engine-electron-embed

Phase 2 of World Engine's build-out — **direct GPU embed** (not WebRTC /
`engine-stream-poc`). A native Node addon (`napi-rs`) loaded into
Electron's main process: `world-engine-core` renders into a native child
view (`NSView` on macOS, `HWND` on Windows) created inside Electron's
window. Zero video, zero IPC frame transfer.

## Status in Workspace

- **Default:** `world-engine-qt-shell` separate window (`worldEngine.ts`)
- **Experimental:** World Engine menu → "Launch Embedded Engine
  (experimental)" (`worldEngineEmbed.ts`), or `WORKSPACE_WORLD_ENGINE_EMBED=1`
- Input forwarding is still open research — embed uses
  `setIgnoreMouseEvents({ forward: true })` as a minimal POC on
  macOS/Windows.

## Build

```sh
cargo build --release
```

From the Electron app:

```sh
cd electron
npm run build:native:embed
```

Windows requires the MSVC toolchain; macOS requires Xcode CLT.

## API

```js
const addon = require("./world_engine_electron_embed.node");
mainWindow.setBackgroundColor("#00000000");
addon.startEmbeddedEngine(mainWindow.getNativeWindowHandle(), width, height);
```

See [`docs/architecture/09-future-native-architecture.md`](../../docs/architecture/09-future-native-architecture.md).
