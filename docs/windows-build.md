# Windows build — Workspace + World Engine

## Prerequisites

- **Node.js** 22+ (`apps/workspace/`)
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

**VS Build Tools** may show a Windows UAC prompt — click Yes. If install fails, open **PowerShell as Administrator** and run:

```powershell
cd \\wsl.localhost\Ubuntu\home\lkh0310kr\workspace\electron\scripts
powershell -ExecutionPolicy Bypass -File .\install-vs-build-tools.ps1
```

This downloads `vs_BuildTools.exe` and runs `--quiet --wait` (not winget `--passive`).

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

From `apps/workspace` on **Windows** (not WSL — Qt/WGPU link against MSVC):

```powershell
npm run promote:stable
```

Installs the unpacked prod app to `%LOCALAPPDATA%\Programs\Workspace`, creates a desktop `Workspace.lnk` shortcut when none already points at that install, and relaunches it (macOS equivalent of `/Applications/Workspace.app`).

Lower-level (build only, no install):

```powershell
.\scripts\build-world-engine-and-electron-win.ps1 -DirOnly   # unpacked dist\win-unpacked
# or
.\scripts\build-world-engine-and-electron-win.ps1            # NSIS installer
```

This runs:

1. `world-engine\qt-shell\scripts\build-windows.ps1 -Release` (+ `windeployqt`)
2. Stage artifacts into `apps/workspace/resources/`
3. `npm run build:win` or `build:win:dir`

## Manual steps

### World Engine (qt-shell)

```powershell
cd world-engine\qt-shell
$env:QT_INSTALL_PREFIX = "C:\Qt\6.8.0\msvc2022_64"   # if not auto-detected
.\scripts\build-windows.ps1 -Release
.\target\release\world-engine-qt-shell.exe            # smoke test
```

### Electron app only

```powershell
cd apps/workspace
node scripts/stage-world-engine-win.mjs    # copies exe + Qt DLLs if built
npm run build:win:dir
```

Output: `apps/workspace/dist/win-unpacked/electron.exe` (workspace Cargo builds also place qt-shell at `target/release/world-engine-qt-shell.exe`).

Packaged World Engine path at runtime:
`resources/world-engine/world-engine-qt-shell.exe` (see `worldEngine.ts`).

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
