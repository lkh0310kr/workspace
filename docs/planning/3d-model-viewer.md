# 3D Model Viewer — 기획서

**Status:** Draft (2026-08-31)  
**범위:** TreeView에서 `.gltf` / `.glb` / `.fbx` 등 3D 에셋을 클릭하면 로딩 UI와 함께 in-pane 뷰어가 열리는 기능  
**관련 문서:** [3d-model-viewer-architecture.md](./3d-model-viewer-architecture.md) (확장·범용 포맷 아키텍처), [IDEATION.md](../IDEATION.md), [ROADMAP.md](../ROADMAP.md), [09-future-native-architecture.md](../architecture/09-future-native-architecture.md), [08-context-modeling.md](../architecture/08-context-modeling.md)

---

## 1. 한 줄 요약

Workspace의 **파일 뷰어 패턴**(이미지/PDF/비디오와 동일)을 3D 에셋에 확장한다.  
TreeView 단일 클릭 → preview tab, 더블클릭 → pinned tab. 로딩 스피너 후 orbit 카메라로 모델을 본다.

**Blender-class 편집기가 아니다.** 정적 메시 미리보기·검수(inspection)가 1차 목표이며, IDEATION의 "fork/embed 실제 OSS 엔진" 원칙과도 충돌하지 않는다 — Blender는 **편집** 트랙, 이 문서는 **뷰잉** 트랙.

> **확장 설계:** FBX뿐 아니라 OBJ/STL/Blend/USD/CAD 등 “거의 모든 포맷”을 플러그인 importer + glTF hub + 캐시로 흡수하는 전체 아키텍처는 [3d-model-viewer-architecture.md](./3d-model-viewer-architecture.md) 참고. v1은 그 중 최소 계약(§17)만 구현한다.

---

## 2. 사용자 경험

### 2.1 기본 플로우

```
TreeView에서 model.glb 클릭
  → 기존 preview tab 재사용 또는 새 viewer tab
  → pane 내부: "Loading model…" + 진행 표시
  → 파싱·GPU 업로드 완료
  → orbit / pan / zoom 가능한 3D 뷰
```

| 동작 | 기대 결과 |
|------|-----------|
| 단일 클릭 | preview tab (기존 파일 뷰어와 동일) |
| 더블클릭 / Enter | pinned tab |
| Cmd+P Quick Open | `.glb` 경로 입력 시 동일 뷰어 |
| 탭 닫기 | WebGL 컨텍스트·blob URL 정리 |
| 탭 전환 (cold-park) | 숨겨진 탭은 렌더 루프 일시정지 (InteractionCoordinator `chipShown` 패턴) |

### 2.2 뷰어 UI (v1)

- **캔버스 영역:** 모델 렌더 (배경: `--bg-base` 계열)
- **오버레이 툴바 (최소):**
  - Reset camera
  - Wireframe toggle (선택)
  - Grid / axes helper toggle
- **상태 표시:**
  - 로딩 중: 스피너 + 파일명
  - 완료: 삼각형 수, 머티리얼 수, 파일 크기 (선택)
  - 실패: 사람이 읽을 수 있는 에러 + "다시 시도"

### 2.3 지원 포맷 (단계별)

| 포맷 | v1 | v2 | 비고 |
|------|----|----|------|
| `.glb` | ✅ | | 단일 바이너리, 웹 생태계 1순위 |
| `.gltf` + `.bin` + 텍스처 | ⚠️ 부분 | ✅ | 외부 리소스 경로 해석 필요 |
| `.fbx` | ❌ | ✅ (변환) | 웹 네이티브 아님 — 변환 파이프 필요 |
| `.obj` + `.mtl` | ❌ | 검토 | 단순하지만 머티리얼 품질 낮음 |
| `.usd` / `.blend` | ❌ | ❌ | Blender-class 트랙 (별도 프로세스) |

**v1 권장:** GLB 단일 파일만 공식 지원. GLTF 멀티파일·FBX는 v2에서 "변환 후 표시"로 처리.

---

## 3. 기존 코드베이스에 맞춘 통합

### 3.1 현재 파일 열기 경로

```
TreeView.classifyFile()
  → PaneGroup.openOrSwitchToFile()
    → layoutActions.openFileInPaneGroup()
      → viewerKind → FileViewerContent
        → classifyMediaExtension() → image / pdf / video / audio / epub
```

**핵심 파일:**

| 역할 | 경로 |
|------|------|
| 확장자 분류 (canonical) | `apps/workspace/src/shared/asset.ts` |
| TreeView 라우팅 | `apps/workspace/src/renderer/src/components/TreeView.tsx` |
| 뷰어 pane | `apps/workspace/src/renderer/src/panes/kinds/viewerKind.tsx` |
| 미디어 서브분류 | `apps/workspace/src/renderer/src/panes/mediaKind.ts` |
| 콘텐츠 | `apps/workspace/src/renderer/src/panes/FileViewerContent.tsx` |
| 대용량 스트리밍 | `apps/workspace/src/main/mediaProtocol.ts` |

### 3.2 권장 통합 방식: `viewer` pane 확장 (신규 TabKind 없음)

`PaneKindDefinition` 레지스트리가 이미 있고, `09-future-native-architecture.md`도 "pane `render()`에 GPU canvas를 올려도 pane 시스템 재설계는 불필요"라고 명시한다.

**v1 변경 범위:**

1. `asset.ts` — `AssetType`에 `"model3d"` 추가, `.gltf` / `.glb` 등록
2. `TreeView.classifyFile` — `model3d` → `TabKind: "viewer"` (기존과 동일 kind)
3. `mediaKind.ts` — `MediaKind`에 `"model3d"` 추가
4. `FileViewerContent.tsx` — `model3d` 분기에서 `Model3DViewerContent` 마운트
5. **신규** `Model3DViewerContent.tsx` — Three.js / R3F 기반 WebGL 뷰어

별도 `model3d` TabKind는 v2 이후(뷰어 전용 툴바·레이아웃이 viewer와 완전히 갈라질 때) 검토. v1은 파일 뷰어 패밀리 안에 두는 것이 diff가 작다.

### 3.3 로딩 전략

기존 `FileViewerContent` 주석의 원칙을 그대로 따른다:

| 크기·형태 | 방식 | 이유 |
|-----------|------|------|
| 소형 GLB (&lt; ~32MB, 임계값 튜닝) | `readFileBinaryPreview` → `blob:` URL | 이미지/PDF와 동일, 구현 빠름 |
| 대형 GLB / GLTF+외부 리소스 | `workspace-media://` 확장 또는 `workspace-model://` 신설 | IPC 전체 로드·base64 4–5x 메모리 폭증 방지 |
| GLTF 외부 `.bin`/텍스처 | 디렉터리 기준 상대 경로 → protocol이 디렉터리 confine 하여 서빙 | `engineBundleProtocol`의 workspace root 검사 패턴 재사용 |

**로딩 UI 상태 머신:**

```
idle → reading (IPC/protocol) → parsing → uploading (GPU) → ready
                              ↘ error (복구 가능 메시지)
```

파싱은 renderer Web Worker로 옮기는 것을 v1.1 후보로 둔다 (메인 스레드 프리즈 방지).

---

## 4. Rust core (`world-engine`) 연계 — 연계할지 말지

### 4.1 현재 Rust 스택이 하는 일

| 컴포넌트 | 역할 | 3D **파일 뷰어**와의 관계 |
|----------|------|---------------------------|
| `world-engine-core` | wgpu 렌더 + rapier3d 시뮬 | glTF **첫 메시 1개** 로드 (`load_mesh`) — 시뮬용, flat gray, 머티리얼 없음 |
| `world-engine-qt-shell` | 별도 네이티브 창 | `world-engine.json` 프로젝트 실행 — TreeView "Open in World Engine" |
| `world-engine-electron-embed` | napi in-process embed | 실험 완료, 입력 포워딩 미해결로 **비활성** |

World Engine의 glTF 로더는 **"떨어지는 큐브 대신 메시 모양 쓰기"** 수준이지, PBR·애니메이션·다중 프리미티브·FBX 변환이 아니다.

### 4.2 옵션 비교

#### Option A — Web/TS 뷰어 (권장, v1)

| | |
|---|---|
| **스택** | Three.js 또는 `@react-three/fiber` + `three-stdlib` (OrbitControls) |
| **렌더** | Chromium WebGL, pane 내부 `<canvas>` |
| **Rust 연계** | **없음** |
| **장점** | 기존 viewer pane·TreeView·Quick Open 그대로; 빌드 의존성 없음; GLB/PBR/애니메이션 생태계 풍부 |
| **단점** | 초대형 씬·CAD급 성능 한계; FBX는 별도 변환 필요 |

#### Option B — World Engine core 재사용 (비권장, 파일 뷰어용)

| | |
|---|---|
| **방식** | `load_mesh()` + wgpu를 pane에 embed (Phase 2 napi) 또는 qt-shell 별도 창 |
| **장점** | 네이티브 GPU, 시뮬 스택과 코드 공유 |
| **단점** | 머티리얼/조명/카메라/다중 메시 미구현; embed 입력 문제 미해결; 별도 창이면 "클릭하면 탭에서 뜸" UX와 불일치; **FBX 없음** |

#### Option C — Rust sidecar 변환만 (v2 보조, 렌더는 TS)

| | |
|---|---|
| **방식** | main process 또는 `native/` 바이너리가 FBX→glTF 변환만 수행, 렌더는 Option A |
| **장점** | FBX 지원 시 품질·속도; 뷰어 UI는 단일 스택 유지 |
| **단점** | `assimp`/`ufbx` 등 네이티브 빌드·배포 부담 |

#### Option D — Blender fork / out-of-process (IDEATION 3D 편집 트랙)

| | |
|---|---|
| **방식** | 별도 프로세스 + (선택) pixel streaming |
| **적합** | 모델링·리깅·UV — **파일 미리보기 아님** |

### 4.3 결론: Rust core와의 경계

```
┌─────────────────────────────────────────────────────────────┐
│  Workspace Electron (TS/React)                              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Model3DViewerContent (Three.js)  ← v1 렌더는 여기     │  │
│  │  TreeView / viewer pane / workspace-media://          │  │
│  └───────────────────────────────────────────────────────┘  │
│         │ optional v2: FBX→glTF IPC                         │
│         ▼                                                   │
│  ┌──────────────────┐     spawn (기존)    ┌──────────────┐  │
│  │ main: convert    │                     │ world-engine │  │
│  │ (assimp/ufbx)    │                     │ qt-shell     │  │
│  └──────────────────┘                     │ 시뮬/게임     │  │
│                                           └──────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

| 질문 | 답 |
|------|-----|
| v1에서 Rust 렌더를 쓸까? | **아니오** — 비용 대비 기능 격차 큼 |
| World Engine glTF 로더를 공유할까? | **아니오** — 목적이 다름 (시뮬 1-mesh vs 뷰어 PBR) |
| Rust를 쓸 만한 지점은? | **v2+ FBX/OBJ→GLTF 변환 sidecar** (선택) |
| World Engine과 충돌? | **없음** — `world-engine.json` 디렉터리는 "Open in World Engine", `.glb` 파일은 "viewer"로 분리 |

`08-context-modeling.md` 원칙: Workspace는 `filePath`만 pane tab에 보관하고, 씬 그래프·리깅 데이터는 뷰어 내부에 캡슐화한다. World Engine의 ECS/physics 모델을 Workspace context에 합치지 않는다.

---

## 5. 기술 스택 제안 (v1)

| 레이어 | 선택 | 대안 |
|--------|------|------|
| 3D 엔진 | **three** + **@react-three/fiber** | Babylon.js, `<model-viewer>` (커스터마이즈 한계) |
| GLTF | `three` 내장 `GLTFLoader` | `@google/model-viewer` (단순하지만 확장성 낮음) |
| 컨트롤 | `OrbitControls` (`three-stdlib`) | 자체 orbit (World Engine camera 참고 가능하나 중복) |
| 로딩 | `@react-three/drei` `useProgress` / `Html` | 자체 progress |
| 테스트 | vitest + mock WebGL (smoke) | e2e는 `test-fixtures/*.glb` |

**번들 크기:** three tree-shaking + dynamic import로 viewer 탭 최초 오픈 시에만 로드 (dashboard 위젯과 동일한 lazy 패턴).

**의존성 정책:** IDEATION의 "fork OSS"는 **편집기**에 해당. 뷰어는 **라이브러리 사용**(Three.js MIT)이 적절 — Blender를 fork해서 `.glb` 미리보기만 하는 것은 과함.

---

## 6. FBX 전략 (v2)

FBX는 Khronos가 glTF를 표준으로 밀고, 웹 런타임 네이티브 지원이 없다.

| 접근 | 설명 | 추천 |
|------|------|------|
| **A. Main-process 변환** | Rust `ufbx` 또는 `assimp` CLI → 임시 `.glb` → viewer | 배포·크로스컴파일 부담, 품질 좋음 |
| **B. WASM 변환 (fbx2gltf)** | renderer worker에서 변환 | 번들 크기↑, 메모리↑ |
| **C. 사전 변환 안내** | FBX 클릭 시 "glTF로 변환하세요" + 외부 도구 링크 | v1 fallback |

**권장:** v1은 GLB만. v2에서 **A를 `native/` optional crate**로 추가하고 IPC `model:convert-fbx` → 캐시 디렉터리(`.workspace/cache/models/`)에 glb 저장 후 재사용.

---

## 7. 단계별 로드맵

### Phase 0 — 스파이크 (2–3일)

- [ ] `test-fixtures/models/`에 CC0 샘플 GLB 2–3개 (Box, Duck, 복잡도 다른 것)
- [ ] throwaway R3F canvas가 Electron renderer에서 WebGL 동작 확인
- [ ] 50MB GLB에서 IPC blob vs protocol 벤치마크 → 임계값 결정

### Phase 1 — v1 GLB in-pane viewer

- [ ] `asset.ts` / `mediaKind.ts` / `TreeView` 확장
- [ ] `Model3DViewerContent.tsx` — load, orbit, reset, error state
- [ ] `FileViewerContent` 분기 + 로딩 UI
- [ ] 탭 전환 시 `chipShown` false면 `frameloop="demand"` 또는 일시정지
- [ ] unit test: extension 분류, error boundary smoke

### Phase 2 — 대용량·GLTF 패키지

- [ ] `workspace-media://` 또는 `workspace-model://`로 디렉터리 confine 서빙
- [ ] `.gltf` + 외부 리소스 상대 경로 해석
- [ ] Worker 파싱 (선택)

### Phase 3 — FBX 및 변환 캐시

- [ ] Rust 또는 CLI 변환 sidecar
- [ ] IPC + 캐시 invalidation (mtime)
- [ ] 변환 중 로딩 UI ("Converting FBX…")

### Phase 4 — 품질 (선택)

- [ ] 애니메이션 재생 (glTF clips)
- [ ] 머티리얼 variant / exposure
- [ ] 스크린샷 export
- [ ] AR quick look (비목표, macOS Electron)

**ROADMAP.md 반영:** "3D (Blender-class)" 행과 별도로 **"3D file viewer (glTF)"** 행을 추가하는 것을 권장.

---

## 8. 리스크와 비목표

### 리스크

| 리스크 | 완화 |
|--------|------|
| WebGL context lost (탭 많음) | 탭당 단일 context, hide 시 dispose |
| 대용량 GLB OOM | protocol 스트리밍 + 크기 상한 경고 |
| GLTF Draco/KTX2 | `DRACOLoader` / `KTX2Loader` — wasm 부가 의존 |
| InteractionCoordinator와 포인터 충돌 | pane 내부 canvas는 embed overlay 정책과 동일하게 `pointer-events: auto` |
| macOS WebGL 성능 | `browserGpuEnv.ts` ANGLE 설정 이미 존재 — 동일 Chromium 스택 |

### 비목표 (이 기능에서 하지 않음)

- 메시 편집, UV, 리깅, 스컬프팅 (→ Blender-class 트랙)
- World Engine 시뮬레이션과 뷰어 통합
- in-process wgpu embed 재개
- USD / `.blend` 직접 오픈
- 협업·주석·버전 diff

---

## 9. 성공 기준 (v1 Done 정의)

1. TreeView에서 `test-fixtures` 내 `.glb` 단일 클릭 → 3초 이내(일반 크기) orbit 뷰 표시
2. preview / pinned tab 동작이 PDF 뷰어와 동일
3. 잘못된 파일 → 크래시 없이 에러 UI
4. 탭 닫기 후 메모리 누수 없음 (DevTools heap 스냅샷 smoke)
5. `npm run typecheck` + vitest 통과
6. World Engine "Open in World Engine" 메뉴와 동작 충돌 없음

---

## 10. 오픈 질문

1. **v1 포맷:** GLB only로 갈지, 단일 `.gltf`(임베디드 buffer)도 포함할지?
2. **임계값:** blob IPC 상한을 몇 MB로 둘지 (16 / 32 / 64)?
3. **FBX v2:** Rust crate vs `fbx2gltf` 바이너리 번들 vs WASM?
4. **별도 TabKind:** viewer 안에 둘지 `model3d` kind를 early에 분리할지?
5. **픽커:** viewer pane "+" 메뉴에 "3D Model" Browse 항목을 넣을지 (video/audio처럼)?

---

## 부록: 참고 코드 위치

```
apps/workspace/src/shared/asset.ts              # 확장자 canonical
apps/workspace/src/renderer/src/panes/
  FileViewerContent.tsx                   # 로딩·미디어 분기 패턴
  mediaKind.ts
  kinds/viewerKind.tsx
world-engine/core/src/render.rs    # load_mesh() — 시뮬용, 뷰어 비재사용
apps/workspace/src/main/mediaProtocol.ts        # 대용량 스트리밍 패턴
apps/workspace/test-fixtures/world-engine-mesh-demo/box.glb  # 기존 CC0 샘플
docs/architecture/09-future-native-architecture.md     # embed vs decouple 결정
```
