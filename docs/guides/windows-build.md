# Windows 빌드 — Workspace와 World Engine

## 사전 준비

- **Node.js** 22 이상 (`apps/workspace/`)
- **Rust MSVC 툴체인** (Windows에서 `rustup default stable-msvc`)
- **Qt 6 Desktop MSVC 64-bit** (예: `C:\Qt\6.8.0\msvc2022_64`)
- **Visual Studio Build Tools** — “Desktop development with C++” 워크로드

## 권장: WSL에서 한 번에 설치

Qt, MSVC, 빌드 과정을 자동화합니다. **PowerShell이 아니라 WSL**에서 실행합니다.

```bash
cd ~/workspace/electron
bash scripts/setup-windows-build-from-wsl.sh
```

로그: `C:\Users\<you>\workspace-windows-setup.log`

Qt가 이미 설치되어 있다면 다음과 같이 실행합니다: `SKIP_QT=1 bash scripts/setup-windows-build-from-wsl.sh`.

**VS Build Tools** 설치 중 Windows UAC 확인 창이 나타나면 Yes를 누릅니다. 설치에 실패하면 **관리자 권한 PowerShell**을 열어 실행합니다.

```powershell
cd \\wsl.localhost\Ubuntu\home\lkh0310kr\workspace\electron\scripts
powershell -ExecutionPolicy Bypass -File .\install-vs-build-tools.ps1
```

이 스크립트는 `vs_BuildTools.exe`를 내려받고 `--quiet --wait`로 실행합니다(`winget --passive`는 사용하지 않음).

그런 다음 WSL 스크립트를 `SKIP_QT=1` 옵션과 함께 다시 실행합니다.

## 최초 설치 한 번에 실행(PowerShell)

**Windows PowerShell**에서 실행합니다(UNC 경로 사용 가능).

```powershell
cd \\wsl.localhost\Ubuntu\home\lkh0310kr\workspace\electron
.\scripts\setup-windows-build.ps1
```

이 스크립트는 winget과 aqtinstall을 통해 다음 항목을 설치합니다.

1. Visual Studio 2022 Build Tools — C++ 워크로드
2. Qt 6.8.3 MSVC 64-bit → `C:\Qt\6.8.3\msvc2022_64`
3. `world-engine-qt-shell.exe` 빌드 및 `windeployqt` 실행

옵션: `-SkipVsBuildTools`, `-SkipQt`, `-BuildOnly`.

## 릴리스 빌드 한 번에 실행(설치 후)

**WSL이 아닌 Windows**의 `apps/workspace`에서 실행합니다(Qt/WGPU가 MSVC에 링크됨).

```powershell
npm run promote:stable
```

압축 해제된 프로덕션 앱을 `%LOCALAPPDATA%\Programs\Workspace`에 설치합니다. 기존에 해당 설치를 가리키는 바로 가기가 없으면 바탕화면에 `Workspace.lnk`를 만들고 앱을 다시 실행합니다(macOS의 `/Applications/Workspace.app`과 같은 역할).

하위 단계(빌드만 수행하고 설치하지 않음):

```powershell
.\scripts\build-world-engine-and-electron-win.ps1 -DirOnly   # 압축 해제된 dist\win-unpacked
# 또는
.\scripts\build-world-engine-and-electron-win.ps1            # NSIS 설치 프로그램
```

이 과정은 다음을 수행합니다.

1. `world-engine\qt-shell\scripts\build-windows.ps1 -Release` 실행 및 `windeployqt`
2. 결과물을 `apps/workspace/resources/`에 복사
3. `npm run build:win` 또는 `build:win:dir` 실행

## 수동 단계

### World Engine(qt-shell)

```powershell
cd world-engine\qt-shell
$env:QT_INSTALL_PREFIX = "C:\Qt\6.8.0\msvc2022_64"   # 자동 검색되지 않는 경우
.\scripts\build-windows.ps1 -Release
.\target\release\world-engine-qt-shell.exe            # 기본 실행 점검
```

### Electron 앱만 빌드

```powershell
cd apps/workspace
node scripts/stage-world-engine-win.mjs    # 빌드한 exe와 Qt DLL 복사
npm run build:win:dir
```

결과물: `apps/workspace/dist/win-unpacked/electron.exe`. Workspace Cargo 빌드도 `target/release/world-engine-qt-shell.exe`를 생성합니다.

실행 시 패키징된 World Engine 경로는 `resources/world-engine/world-engine-qt-shell.exe`입니다(`worldEngine.ts` 참고).

## WSL 개발

- 평소처럼 WSL에서 Electron을 실행합니다(`npm run dev`).
- `world-engine-qt-shell.exe`는 Windows에서 빌드합니다. WSL 앱은 `cmd.exe start`로 실행합니다.
- Linux Qt 개발 패키지 없이 WSL 안에서 qt-shell의 `cargo build`가 될 것으로 기대하지 마세요.

## 문제 해결

| 증상 | 해결 |
|---|---|
| `Qt 6 not found` | `QT_INSTALL_PREFIX`를 MSVC kit 경로로 지정 |
| World Engine으로 열 때 바이너리를 찾지 못함 | Windows에서 `build-windows.ps1 -Release` 실행 |
| 앱은 시작하지만 엔진이 바로 종료됨 | 빌드 스크립트에 포함된 `windeployqt`를 실행해 DLL을 `.exe` 옆에 배치 |
| Embed 메뉴 실행 실패 | Windows 또는 macOS에서 `npm run build:native:embed` 실행 |
