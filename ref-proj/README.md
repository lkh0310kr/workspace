# ref-proj — 참고 구현 (read-only)

Workspace Electron 앱 개발 시 **이미 검증된 오픈소스**에서 패턴만 베껴 온다.  
이 디렉터리 자체는 `.gitignore` 대상이지만, **이 README만 git에 커밋**해 두어 랩탑을 바꿔도 동일한 참고 레포를 재현할 수 있다.

## 우선순위 (2026-09-01 갱신)

| Tier | 성격 | 예 |
|------|------|-----|
| **1 정석** | 업계 표준·대형·C++/Python/Java 네이티브 | FreeCAD, OCCT, Assimp, Bullet, Gazebo, JSBSim, CARLA, Autoware, Drake, RViz |
| **2 앱 UX** | Electron/에디터/터미널 패턴 | orca, itch, vscode, zed |
| **3 Web 보조** | glTF 미리보기·로더 wiring (작은 JS 뷰어) | three-gpu-pathtracer, gltf-sample-viewer — **아키텍처·임베드 전략은 Tier 1을 먼저** |

> Workspace 3D 로드맵(`docs/planning/3d-model-viewer-architecture.md`)은 Assimp/OCCT/네이티브 delegate를 전제로 한다.  
> JS three.js 뷰어는 **M1 미리보기**용이지, CAD·시뮬·로보틱스의 정석 참고가 아니다.

## 규칙

- **읽기 전용** — `ref-proj/` 안 파일을 수정·커밋하지 않는다.
- **제품 코드는 `electron/`만** 수정한다.
- 포팅 시 소스 파일 상단에 `// Ported from ref-proj/...` 주석을 남긴다.
- 워크플로: `rg "키워드" ref-proj/<repo>` → 해당 파일만 열기 → `electron/`에 이식.

---

## 새 랩탑에서 클론

### Tier 1 — 정석 네이티브 (권장, 도메인별 골라서)

```bash
mkdir -p ref-proj && cd ref-proj

# CAD / 기하 커널 / 메시 import
git clone --depth 1 https://github.com/FreeCAD/FreeCAD.git freecad          # ~500MB
git clone --depth 1 https://github.com/Open-Cascade-SAS/OCCT.git occt          # ~350MB
git clone --depth 1 https://github.com/assimp/assimp.git assimp                # ~400MB

# 물리 · 로보틱스 시뮬
git clone --depth 1 https://github.com/bulletphysics/bullet3.git bullet3       # ~470MB
git clone --depth 1 https://github.com/gazebosim/gz-sim.git gz-sim             # ~400MB
git clone --depth 1 https://github.com/RobotLocomotion/drake.git drake         # ~100MB (메타; 빌드 시 의존성 추가)

# 항공 · 로켓 FDM
git clone --depth 1 https://github.com/JSBSim-Team/jsbsim.git jsbsim           # ~75MB
git clone --depth 1 https://github.com/openrocket/openrocket.git openrocket    # ~370MB

# 자율주행 · 자동차 시뮬
git clone --depth 1 https://github.com/carla-simulator/carla.git carla           # ⚠ ~2.5GB
git clone --depth 1 https://github.com/autowarefoundation/autoware.git autoware
git clone --depth 1 https://github.com/autowarefoundation/autoware_universe.git autoware_universe  # ~410MB

# ROS 시각화
git clone --depth 1 https://github.com/ros2/rviz.git rviz2                       # ~25MB
```

### Tier 2 — Electron / 워크스페이스 UX

```bash
git clone --depth 1 https://github.com/stablyai/orca.git orca
git clone --depth 1 https://github.com/itchio/itch.git itch
git clone --depth 1 https://github.com/microsoft/vscode.git vscode
git clone --depth 1 https://github.com/zed-industries/zed.git zed
git clone --depth 1 https://github.com/logseq/logseq.git logseq
git clone --depth 1 https://github.com/Zettlr/Zettlr.git Zettlr
git clone --depth 1 https://github.com/chromiumembedded/cef-rs.git cef-rs
git clone --depth 1 https://github.com/NVIDIA-Omniverse/ovstream.git ovstream
git clone --depth 1 https://github.com/NVIDIA-Omniverse/omniverse-web-viewer-sample.git omniverse-web-viewer-sample
```

### Tier 3 — Web/JS 뷰어 (보조, 선택)

```bash
git clone --depth 1 https://github.com/KhronosGroup/glTF-Sample-Viewer.git gltf-sample-viewer
git clone --depth 1 https://github.com/gkjohnson/three-gpu-pathtracer.git three-gpu-pathtracer
git clone --depth 1 https://github.com/google/model-viewer.git model-viewer
git clone --depth 1 https://github.com/gkjohnson/urdf-loaders.git urdf-loaders
git clone --depth 1 https://github.com/lichtblick-suite/lichtblick.git lichtblick
```

> `foxglove/studio` GitHub는 2024년 이후 README만 남은 아카이브 → **Lichtblick** 사용.

---

## Tier 1 — 정석 네이티브 스펙

마지막 동기화: **2026-09-01** (macOS, `git clone --depth 1`).

### CAD · 기하 · 3D 데이터 교환

| 디렉터리 | URL | 커밋 | 스택 | Workspace에서 볼 것 |
|----------|-----|------|------|---------------------|
| `freecad/` | https://github.com/FreeCAD/FreeCAD | `b3daf27` | C++, Python, Qt, OCCT | 파라메트릭 CAD, STEP/IGES import, tessellation → mesh, **Track B native embed** 후보 (`docs/IDEATION.md`) |
| `occt/` | https://github.com/Open-Cascade-SAS/OCCT | `3d097a03` | C++ (BREP 커널) | STEP/IGES/BREP, `BRepMesh_IncrementalMesh` tessellation, CAD exchange **정석** — M6 `.step` preview 설계 근거 |
| `assimp/` | https://github.com/assimp/assimp | `a47827a` | C++ | FBX/OBJ/DAE/STL/… **import 파이프라인 정석** — post-process, material, embedded texture; `model3d` importer Tier 2 설계 |

```bash
rg "STEP|IGES|BRepMesh|tessell" ref-proj/occt/src ref-proj/freecad/src/Mod/Import
rg "Assimp::Importer|PostProcess|aiProcess" ref-proj/assimp/code
```

### 물리 · 로보틱스 시뮬레이션

| 디렉터리 | URL | 커밋 | 스택 | 볼 것 |
|----------|-----|------|------|-------|
| `bullet3/` | https://github.com/bulletphysics/bullet3 | `63c4d67` | C++ | rigid body, collision, constraints — 게임·로봇 시뮬 **사실상 표준** |
| `gz-sim/` | https://github.com/gazebosim/gz-sim | `fd64999` | C++, Ignition/Gazebo | URDF/SDF 월드, 센서, physics plugin — **ROS 생태계 시뮬 정석** (Gazebo Classic 후속) |
| `drake/` | https://github.com/RobotLocomotion/drake | `e45193f` | C++, Python | MIT — multibody dynamics, trajectory optimization, **학술·산업 로보틱스 정석** |

```bash
rg "URDF|SDF|physics" ref-proj/gz-sim/src
rg "MultibodyPlant|SceneGraph" ref-proj/drake
```

### 항공 · 로켓

| 디렉터리 | URL | 커밋 | 스택 | 볼 것 |
|----------|-----|------|------|-------|
| `jsbsim/` | https://github.com/JSBSim-Team/jsbsim | `506773a` | C++ | **6-DOF FDM** (항공·로켓), XML 기체 정의 — FlightGear/Unreal 연동; OpenRocket보다 **물리 엔진 쪽 정석** |
| `openrocket/` | https://github.com/openrocket/openrocket | `3e036a8` | Java 17+, Gradle | 로켓 **설계·시뮬 UI**, 스테이징, OBJ export — 제품 UX 참고 |

```bash
rg "FGPropulsion|FGMassBalance|6DOF" ref-proj/jsbsim
rg "FlightConfiguration|Simulation" ref-proj/openrocket/core/src
```

### 자율주행 · 자동차

| 디렉터리 | URL | 커밋 | 스택 | 볼 것 |
|----------|-----|------|------|-------|
| `carla/` | https://github.com/carla-simulator/carla | `0a5ce0d` | C++, Unreal Engine | 자율주행 **시뮬레이터 정석** — 센서(LiDAR/camera), 맵, 차량 dynamics; Unreal 연동·Python API |
| `autoware/` | https://github.com/autowarefoundation/autoware | `0740cbc` | 메타 레포 | Autoware **전체 스택 구조**·문서 진입점 (소스는 universe 쪽) |
| `autoware_universe/` | https://github.com/autowarefoundation/autoware_universe | `1822b91` | C++, ROS 2 | perception/planning/control **실제 구현** — 자동차 SW 스택 정석 |

```bash
rg "sensor|lidar|vehicle" ref-proj/carla/PythonAPI ref-proj/carla/Unreal
rg "perception|planning|localization" ref-proj/autoware_universe --glob "*.cpp" | head
```

> **CARLA** shallow clone만 ~2.5GB. 디스크 부족 시 `carla/`는 생략하고 문서·API 샘플만 참고.

### ROS 시각화

| 디렉터리 | URL | 커밋 | 스택 | 볼 것 |
|----------|-----|------|------|-------|
| `rviz2/` | https://github.com/ros2/rviz | `4dfce72` | C++, ROS 2, Ogre | 로봇 **3D 시각화 정석** — TF tree, marker, point cloud, robot model display |

```bash
rg "RobotModel|PointCloud|Marker" ref-proj/rviz2/rviz_default_plugins
```

---

## Tier 2 — Electron / 워크스페이스 UX

| 디렉터리 | URL | 스택 | 볼 것 |
|----------|-----|------|-------|
| `orca/` | https://github.com/stablyai/orca | Electron, React, xterm | 터미널, pane-manager, agent favicon, webview |
| `itch/` | https://github.com/itchio/itch | Electron | HTML fullscreen, WASM/Godot 호스팅 |
| `vscode/` | https://github.com/microsoft/vscode | Electron, TS | 검색 위젯, IPC |
| `zed/` | https://github.com/zed-industries/zed | Rust | 패널·포커스 UX |
| `logseq/`, `Zettlr/` | 각 GitHub | 각 스택 | 에디터·아웃라인 |
| `cef-rs/` | https://github.com/chromiumembedded/cef-rs | Rust, CEF | webview 대안 |
| `ovstream/`, `omniverse-web-viewer-sample/` | NVIDIA | CUDA/Web | GPU 픽셀 스트리밍 패턴 (`docs/architecture/09-future-native-architecture.md`) |

---

## Tier 3 — Web/JS 뷰어 (보조)

M1 `electron/` renderer 미리보기용. **아키텍처·포맷 파이프라인은 Tier 1(assimp/occt)을 우선.**

| 디렉터리 | URL | 커밋 | 볼 것 |
|----------|-----|------|-------|
| `gltf-sample-viewer/` | KhronosGroup/glTF-Sample-Viewer | `f9fce9e` | Khronos glTF 2.0 WebGL 뷰어 |
| `three-gpu-pathtracer/` | gkjohnson/three-gpu-pathtracer | `171a224` | three.js DRACO/KTX2 로더 예제 |
| `model-viewer/` | google/model-viewer | `297ed2b` | 웹 3D 쇼룸 UX |
| `urdf-loaders/` | gkjohnson/urdf-loaders | `bb2296f` | URDF→three.js (가벼운 참고) |
| `lichtblick/` | lichtblick-suite/lichtblick | `0900ce3` | ROS bag/MCAP Electron 뷰어 |

---

## 디스크 용량 (대략, 2026-09-01)

| 디렉터리 | 크기 | Tier |
|----------|------|------|
| `carla/` | **~2.5 GB** | 1 |
| `cef-rs/` | ~3.2 GB | 2 |
| `freecad/` | ~530 MB | 1 |
| `bullet3/` | ~470 MB | 1 |
| `gz-sim/` | ~405 MB | 1 |
| `assimp/` | ~386 MB | 1 |
| `openrocket/` | ~370 MB | 1 |
| `occt/` | ~344 MB | 1 |
| `vscode/` | ~340 MB | 2 |
| `autoware_universe/` | ~410 MB | 1 |
| `orca/` | ~300 MB | 2 |
| `model-viewer/` | ~320 MB | 3 |
| `drake/` | ~92 MB | 1 |
| `jsbsim/` | ~75 MB | 1 |
| `lichtblick/` | ~55 MB | 3 |

전체 `ref-proj/`는 **10GB+** 가능. 새 랩탑에서는 **Tier 1에서 도메인별로 골라** 클론한다.

---

## Workspace 문서 연결

| 주제 | 문서 |
|------|------|
| 3D viewer 아키텍처 (Assimp/OCCT/delegate) | `docs/planning/3d-model-viewer-architecture.md` |
| CAD/엔진 embed 원칙 | `docs/IDEATION.md`, `docs/architecture/09-future-native-architecture.md` |
| Track B (네이티브 스트리밍) | `docs/research/track-b-webrtc-streaming.md` |

---

## 업데이트 기록

| 날짜 | 변경 |
|------|------|
| 2026-09-01 (2) | **Tier 1 정석 10종** 추가: FreeCAD, OCCT, Assimp, Bullet, Gazebo Sim, Drake, JSBSim, CARLA, Autoware/Universe, RViz2 — JS 뷰어는 Tier 3로 격하 |
| 2026-09-01 (1) | Web glTF/URDF 참고 6종, README git 추적 시작 |
| 2026-08-28 | itch fullscreen, ovstream |
| 2026-08-26 | orca 터미널·agent 포팅 |

README 갱신 시 **커밋 해시·클론일·Tier**를 표에 반영하고 이 파일만 커밋한다.
