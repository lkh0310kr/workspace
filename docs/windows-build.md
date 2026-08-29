# Windows build — Workspace + World Engine

## Prerequisites

- **Node.js** 22+ (`electron/`)
- **Rust** MSVC toolchain (`rustup default stable-msvc` on Windows)
- **Qt 6** Desktop **MSVC 64-bit** (e.g. `C:\Qt\6.8.0\msvc2022_64`)
- **Visual Studio Build Tools** — "Desktop development with C++"

## Recommended: one command from WSL

Qt + MSVC + build are automated. From **WSL** (not PowerShell):

```bash
cd ~/workspace/electron
bash scripts/setup-windows-build-from-wsl.sh
```

Log: `C:\Users\<you>\workspace-windows-setup.log`

If Qt is already installed: `SKIP_QT=1 bash scripts/setup-windows-build-from-wsl.sh`

**VS Build Tools** may show a Windows UAC prompt — click Yes. If install fails with exit 1602, open **PowerShell as Administrator** and run:

```powershell
winget install -e --id Microsoft.VisualStudio.2022.BuildTools --override "--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
```

Then re-run the WSL script with `SKIP_QT=1`.

## One-shot setup (PowerShell, first time)

From **Windows PowerShell** (UNC path is OK):

```powershell
cd \\wsl.localhost\Ubuntu\home\lkh0310kr\workspace\electron
.\scripts\setup-windows-build.ps1
```

This installs (via winget + aqtinstall):

1. Visual Studio 2022 Build Tools — C++ workload
2. Qt 6.8.3 MSVC 64-bit → `C:\Qt\6.8.3\msvc2022_64`
3. Builds `world-engine-qt-shell.exe` + runs `windeployqt`

Options: `-SkipVsBuildTools`, `-SkipQt`, `-BuildOnly`

## One-shot release build (after setup)

From the repo root on **Windows** (not WSL — Qt/WGPU link against MSVC):

```powershell
cd electron
.\scripts\build-world-engine-and-electron-win.ps1 -DirOnly   # unpacked dist\win-unpacked
# or
.\scripts\build-world-engine-and-electron-win.ps1            # NSIS installer (needs wine-free Windows host)
```

This runs:

1. `native\world-engine-qt-shell\scripts\build-windows.ps1 -Release` (+ `windeployqt`)
2. `npm run build:native:embed` (optional experimental `.node` addon)
3. Stage artifacts into `electron/resources/`
4. `npm run build:win` or `build:win:dir`

## Manual steps

### World Engine (qt-shell)

```powershell
cd native\world-engine-qt-shell
$env:QT_INSTALL_PREFIX = "C:\Qt\6.8.0\msvc2022_64"   # if not auto-detected
.\scripts\build-windows.ps1 -Release
.\target\release\world-engine-qt-shell.exe            # smoke test
```

### Electron app only

```powershell
cd electron
node scripts/stage-world-engine-win.mjs    # copies exe + Qt DLLs if built
npm run build:win:dir
```

Output: `electron/dist/win-unpacked/electron.exe`

Packaged World Engine path at runtime:
`resources/world-engine/world-engine-qt-shell.exe` (see `worldEngine.ts`).

### Experimental embed addon

```powershell
cd electron
npm run build:native:embed
```

Dev menu: **World Engine → Launch Embedded Engine (experimental)**. Requires
`WORKSPACE_WORLD_ENGINE_EMBED=1` in packaged builds. Input forwarding is still
experimental (`setIgnoreMouseEvents({ forward: true })`).

## WSL development

- Run **Electron** from WSL (`npm run dev`) as today.
- Build **world-engine-qt-shell.exe** on Windows; WSL app spawns it via `cmd.exe start`.
- Do not expect `cargo build` for qt-shell inside WSL without Linux Qt dev packages.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `Qt 6 not found` | Set `QT_INSTALL_PREFIX` to MSVC kit path |
| Open in World Engine → binary not found | Run `build-windows.ps1 -Release` on Windows |
| App starts but engine instantly exits | Run `windeployqt` (included in build script) so DLLs sit next to `.exe` |
| Embed menu fails | `npm run build:native:embed` on Windows or macOS |
