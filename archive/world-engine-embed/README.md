# world-engine-electron-embed

World Engine 구현 Phase 2 — **직접 GPU 임베드** (WebRTC /
`engine-stream-poc`)와 달리 직접 렌더링합니다. Electron main process에 native Node addon (`napi-rs`)을 로드하고, `world-engine-core`가 Electron 창 내부에 만든 native child view (`NSView` on macOS, `HWND` on Windows)에 렌더링합니다. 비디오와 IPC 프레임 전송을 사용하지 않습니다.

## Workspace 상태

- **기본:** `world-engine-qt-shell` 별도 창 (`worldEngine.ts`)
- **실험:** World Engine 메뉴 → "Launch Embedded Engine (experimental)" (`worldEngineEmbed.ts`) 또는 `WORKSPACE_WORLD_ENGINE_EMBED=1`
- 입력 전달은 여전히 미해결 연구 항목입니다. 임베드는
  macOS/Windows에서 최소 POC로 `setIgnoreMouseEvents({ forward: true })`를 사용합니다.

## 빌드

```sh
cargo build --release
```

Electron 앱에서 실행:

```sh
cd apps/workspace
npm run build:native:embed
```

Windows에는 MSVC toolchain이 필요하고, macOS에는 Xcode CLT가 필요합니다.

## API 예시

```js
const addon = require("./world_engine_electron_embed.node");
mainWindow.setBackgroundColor("#00000000");
addon.startEmbeddedEngine(mainWindow.getNativeWindowHandle(), width, height);
```

자세한 내용은 [`docs/architecture/09-tool-hosting.md`](../../docs/architecture/09-tool-hosting.md)를 참고하세요.
