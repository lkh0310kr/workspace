# 3D Asset Viewer — 확장 아키텍처

**Status:** Architecture draft (2026-08-31)  
**상위 문서:** [3d-model-viewer.md](./3d-model-viewer.md) (UX·v1 범위)  
**관련:** [08-context-modeling.md](../architecture/08-context-modeling.md), [09-future-native-architecture.md](../architecture/09-future-native-architecture.md)

---

## 1. 설계 목표

v1은 GLB 하나만 열어도 되지만, **코드 구조는 처음부터 “거의 모든 3D 포맷”을 수용**할 수 있게 잡는다.

| 원칙 | 의미 |
|------|------|
| **Import ≠ Render** | 디코딩/변환 파이프와 화면 렌더러를 분리 |
| **Canonical 중간 표현** | 런타임 뷰어는 하나의 내부 씬 계약만 이해 |
| **포맷은 플러그인** | 확장자마다 if-else가 아니라 `Importer` 레지스트리 |
| **Capability routing** | 같은 `.fbx`도 “미리보기” vs “Blender에서 열기”로 경로 분기 |
| **Domain owns meaning** | Workspace는 `AssetRef`·경로·캐시만; 메시/리그 의미는 importer·viewer 내부 |
| **Progressive disclosure** | v1 구현은 얇게, 인터페이스는 두껍게 |

**비목표:** Workspace가 Blender/USD의 Scene Graph를 공유 타입으로 소유하는 것.

---

## 2. 레이어 개요

```
┌─────────────────────────────────────────────────────────────────────────┐
│  UI Layer (React)                                                       │
│  TreeView · Quick Open · ModelViewerPane · loading/progress overlay     │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │ AssetOpenRequest { ref, intent }
┌───────────────────────────────────▼─────────────────────────────────────┐
│  Asset Router (main + shared)                                           │
│  classify → pick pipeline → cache lookup → schedule job                 │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │
        ┌───────────────────────────┼───────────────────────────┐
        ▼                           ▼                           ▼
┌───────────────┐         ┌─────────────────┐         ┌──────────────────┐
│ Import        │         │ Asset Store     │         │ External Host    │
│ Pipeline      │         │ (cache + blobs) │         │ (Blender, WE…)   │
│ decoders      │         │ content-address │         │ edit / sim only  │
│ converters    │         └────────┬────────┘         └──────────────────┘
└───────┬───────┘                  │
        │ WorkspaceScene (CIR)     │ glb / textures / sidecars
        ▼                          ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Viewer Backend (pluggable)                                             │
│  WebGLSceneBackend (Three.js v1) · future: WebGPU / native preview      │
└─────────────────────────────────────────────────────────────────────────┘
```

**핵심:** TreeView는 “파일 경로”만 넘기고, **어떤 importer·어떤 viewer backend를 쓸지는 Router가 결정**한다.

---

## 3. Canonical Intermediate Representation (CIR)

런타임 뷰어가 이해하는 **유일한 씬 계약**. Khronos glTF 2.0을 **저장/전송 포맷**으로 쓰되, 메모리 모델은 glTF에 종속되지 않게 추상화한다.

### 3.1 `WorkspaceScene` (논리 모델)

```ts
/** Viewer/import 파이프라인 내부 전용. Workspace 전역 context에 넣지 않음. */
interface WorkspaceScene {
  schemaVersion: 1;
  meta: SceneMeta;           // title, generator, source format, warnings
  nodes: SceneNode[];        // transform hierarchy
  meshes: MeshAsset[];       // geometry buffers (ref → blob store)
  materials: MaterialDef[];
  textures: TextureAsset[];
  animations: AnimationClip[];
  cameras: CameraDef[];
  lights: LightDef[];
  extensions: Record<string, unknown>;  // Draco, KHR_materials_variants, …
}

interface AssetRef {
  id: string;                // content hash or stable uuid
  mime: string;
  byteLength: number;
  /** workspace-relative path OR cache:// URI — never raw absolute in renderer */
  uri: string;
}
```

- **버퍼는 scene JSON에 인라인하지 않음** — `AssetRef`로 `Asset Store`를 참조 (대용량·IPC 폭주 방지).
- glTF로 export 가능한 subset을 v1 CIR로 두고, CAD/USD 등에서 빠지는 필드는 `meta.warnings[]`에 기록.

### 3.2 왜 glTF를 hub로 쓰는가

| 대안 | 문제 |
|------|------|
| 매 포맷마다 Three.js 직접 로드 | N×M 매트릭스 (포맷 수 × 렌더러 수), 테스트 폭발 |
| USD를 CIR로 | 웹 뷰어·번들·라이선스·headless 변환 모두 무거움 |
| Assimp “통합 메시”만 | 머티리얼·애니·스켈레톤 손실, 확장성 낮음 |
| **glTF 2.0 hub** | 웹 생태계 표준, 단일 파일(.glb) 캐시, Three/Babylon/wgpu 경로 공유 |

**원칙:** “네이티브 포맷 직접 렌더”는 **Tier 0 (glTF family)** 만. 나머지는 **import 시 glTF(+sidecar)로 materialize**.

---

## 4. Import Pipeline

### 4.1 단계

```
Source File(s)
  → Sniff format (magic bytes > extension)
  → Importer.resolve(capabilities)
  → [optional] Convert job (worker / main / sidecar)
  → Validate CIR
  → Write cache manifest
  → ViewerBackend.loadScene(manifest)
```

### 4.2 `Importer` 인터페이스

```ts
type ImportTier = "native" | "convert-light" | "convert-heavy" | "delegate";

interface ImportCapabilities {
  /** e.g. ["mesh", "pbr", "skeleton", "animation", "morph"] */
  preserves: string[];
  /** max recommended file size for in-renderer path */
  maxBytesInProcess?: number;
  tier: ImportTier;
  /** needs sibling files (.mtl, .bin, textures) */
  packageAware: boolean;
}

interface Importer {
  id: string;                          // "gltf-native", "fbx-assimp", …
  formats: string[];                   // extensions OR mime
  capabilities: ImportCapabilities;
  /** fast path: can we view without conversion? */
  canImportDirect(ctx: ImportContext): Promise<boolean>;
  /** produce CIR or cache manifest */
  import(ctx: ImportContext): Promise<ImportResult>;
}

interface ImportContext {
  primaryPath: string;                 // workspace-confined
  packageRoot: string;                 // directory for relative refs
  intent: "preview" | "thumbnail" | "metadata-only";
  signal: AbortSignal;
}

interface ImportResult {
  manifest: SceneManifest;             // pointers into asset store
  warnings: ImportWarning[];
  stats: { triangles: number; materials: number; durationMs: number };
}
```

**레지스트리:** `ImporterRegistry.register(importer)` — v1은 `gltf-native` 하나만 등록해도 인터페이스는 완성.

### 4.3 포맷 티어 (목표 커버리지)

| Tier | 처리 | 예시 포맷 | 백엔드 |
|------|------|-----------|--------|
| **0 Native** | CIR 직결 또는 glTF 파싱만 | `.glb`, `.gltf` | TS `GLTFImporter` |
| **1 Light convert** | WASM/빠른 단일 메시 | `.obj`, `.stl`, `.ply`, `.dae` (제한적) | `obj2gltf`, meshoptimizer WASM |
| **2 Heavy convert** | 네이티브 sidecar, 캐시 필수 | `.fbx`, `.3ds`, `.blend` (headless), `.max` (제한) | `assimp` / `ufbx` + `native/asset-pipeline` |
| **3 Delegate** | 미리보기 불가 또는 품질 보장 불가 | `.blend` (편집), `.usd` (stage), `.step`/`.iges` (CAD) | “Open in Blender” / FreeCAD / Omniverse |

같은 확장자도 **intent**에 따라 Tier가 달라질 수 있음:

- `.blend` + `preview` → Tier 2 (headless glTF export 시도)
- `.blend` + `edit` → Tier 3 (Blender fork spawn)

### 4.4 포맷 스니핑

확장자만 믿지 않는다 (`asset.ts`는 TreeView 라우팅용 힌트).

```
1. magic bytes (glb, fbx Kaydara, zip→blend, …)
2. extension fallback
3. unknown → metadata-only + “지원되지 않음” UI + delegate 옵션
```

`electron/src/shared/asset.ts`는 **“이 파일을 3D 뷰어 후보로 볼지”** 만 담당하고, 정밀 포맷 판별은 main의 `FormatSniffer`가 담당.

---

## 5. 변환 실행 런타임 (Converter Backends)

하나의 `Importer`가 여러 **Converter Backend**를 선택할 수 있다.

```
                    ┌─────────────────┐
                    │ ConverterRouter │
                    └────────┬────────┘
         ┌───────────────────┼───────────────────┐
         ▼                   ▼                   ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│ InRenderer WASM │ │ Main Thread     │ │ Sidecar Process │
│ (small meshes)  │ │ (napi-rs crate) │ │ (assimp CLI)    │
└─────────────────┘ └─────────────────┘ └─────────────────┘
```

| Backend | 적합 | 제약 |
|---------|------|------|
| **WASM** (renderer worker) | OBJ/STL, &lt;10MB, 오프라인 | 메모리·속도, FBX 품질 낮음 |
| **napi in main** | 중간 크기, 캐시 hit 빠름 | main 블로킹 → Worker thread pool |
| **Sidecar subprocess** | FBX/Blend/Assimp 전체 | spawn 비용, 배포 크기 |
| **External DCC** | USD stage, CAD, 고품질 Blend | UX는 별도 창; pixel stream은 Track B |

**Rust `world-engine-core`는 여기에 넣지 않는다.** 시뮬용 `load_mesh()`는 CIR importer가 아니며, 물리/게임 루프와 결합돼 있음.

### 5.1 권장 `native/` crate (신규)

```
native/asset-pipeline/          # 뷰어·World Engine과 분리된 crate
  src/
    sniffer.rs
    importers/                  # assimp, ufbx, (future) usd preview
    export_gltf.rs              # 공통 glTF materialization
    cache.rs
  bin/asset-pipeline-cli.rs     # Electron이 spawn 가능
```

- Electron main: `assetPipeline:import` IPC → CLI 또는 napi
- **World Engine**이 나중에 같은 crate의 `load_mesh_from_gltf()`를 쓸 수는 있음 (공유 **디코드**만, 렌더 분리)

---

## 6. Asset Store & Cache

### 6.1 주소 체계

| URI | 용도 |
|-----|------|
| `workspace-model://{host}/path` | 원본·패키지 내 상대 리소스 스트리밍 (신설) |
| `cache://import/{contentHash}/manifest.json` | 변환 결과 manifest |
| `cache://import/{contentHash}/scene.glb` | materialized glTF |
| `blob:` (renderer) | 소형 전체 로드 임시 |

### 6.2 캐시 키

```
cacheKey = hash(
  primaryPath,
  mtime,
  size,
  importerId,
  importerVersion,
  converterOptions
)
```

- 원본 파일 변경 시 자동 invalidation
- importer 버전 올리면 전체 재변환 (마이그레이션 명시)
- 캐시 위치: `{workspaceRoot}/.workspace/cache/imports/` (또는 global app cache — workspace별 격리 권장)

### 6.3 Manifest

```ts
interface SceneManifest {
  version: 1;
  cacheKey: string;
  source: { path: string; format: string; mtime: number };
  scene: WorkspaceScene | { glbUri: string };  // v1: glbUri만 있어도 됨
  assets: AssetRef[];
  provenance: {
    importerId: string;
    converterBackend: string;
    convertedAt: number;
    warnings: string[];
  };
}
```

Viewer는 **항상 manifest**만 받는다. “원본 FBX 경로”를 Three.js에 직접 넘기지 않음.

---

## 7. Viewer Backend (Render 플러그인)

Import와 대칭되는 **ViewerBackend** 레지스트리.

```ts
interface ViewerBackend {
  id: string;                          // "webgl-three"
  supports(features: string[]): boolean;
  mount(container: HTMLElement, manifest: SceneManifest, opts: ViewOpts): ViewerSession;
}

interface ViewerSession {
  setCamera(mode: "orbit" | "fps"): void;
  screenshot(): Promise<Blob>;
  dispose(): void;
  onProgress(cb: (p: number) => void): void;
}
```

| Backend | 시기 | 역할 |
|---------|------|------|
| `webgl-three` | v1 | PBR, 애니, orbit — 기본 |
| `webgl-babylon` | optional | 특정 확장(KHR) 실험용 |
| `native-wgpu-preview` | distant | 초대형 CAD tile stream |
| `delegate-external` | Tier 3 | 썸네일만 in-app, 본문은 Blender 창 |

**Pane 통합:** `ModelViewerPane` → `ViewerBackendRegistry.getDefault().mount(...)`. v1은 registry에 하나만.

---

## 8. Asset Router — 열기 의도(Intent)

TreeView 클릭은 기본 `intent: "preview"`. Context menu로 확장:

| 메뉴 | Intent | 동작 |
|------|--------|------|
| Open Preview | `preview` | in-pane viewer |
| Open in Blender | `edit` | Tier 3 delegate (미구현 시 비활성) |
| Open in World Engine | `simulate` | 기존 `launchWorldEngine` (프로젝트 디렉터리) |
| Reveal in Finder | — | OS |

```ts
interface AssetOpenRequest {
  ref: WorkspaceAssetRef;      // { workspaceRoot, relativePath }
  intent: "preview" | "edit" | "simulate" | "thumbnail";
  source: "tree" | "quick-open" | "agent";
}
```

Router 의사코드:

```ts
async function openAsset(req: AssetOpenRequest): Promise<OpenAssetResult> {
  const format = await sniffFormat(req.ref);
  const importer = ImporterRegistry.findBest(format, req.intent);
  if (!importer) return delegateOrError(format, req);
  const cached = await CacheStore.lookup(req.ref, importer.id);
  if (cached) return ViewerHost.open(cached.manifest);
  const job = await ImportJobQueue.enqueue({ importer, ref: req.ref, intent: req.intent });
  return ViewerHost.openWithJob(job);  // progress UI 구독
}
```

---

## 9. 멀티파일 패키지 해석

많은 포맷이 “단일 파일”이 아니다.

| 포맷 | 패키지 루트 | 상대 참조 |
|------|-------------|-----------|
| `.gltf` | `.gltf` 파일 디렉터리 | `.bin`, textures |
| `.obj` | `.obj` 디렉터리 | `.mtl`, textures |
| `.fbx` | often textures alongside | external textures |
| `.usd` | stage root | sublayers, payloads |

**`PackageResolver`:**

```ts
interface ResolvedPackage {
  primaryPath: string;
  rootDir: string;              // workspace-confined
  siblings: string[];           // known sidecars
  resolve(relativePath: string): string | null;
}
```

`workspace-model://` protocol handler는 `PackageResolver` + workspace root prefix check로 **디렉터리 탈출 방지** (`mediaProtocol.ts` / `engineBundleProtocol.ts`와 동일 패턴).

---

## 10. 작업 큐 & 진행률

변환은 UI 스레드를 막지 않는다.

```
ImportJobQueue (main process)
  ├── priority: visible tab > thumbnail > background
  ├── concurrency: 1 heavy + N light
  ├── cancel: tab closed → AbortSignal
  └── events: progress → IPC → renderer overlay
```

상태:

```
queued → sniffing → converting → caching → ready
                  ↘ failed (retryable / fatal)
```

Renderer 로딩 UI는 **Job ID**를 구독; 단계별 라벨 (“Sniffing format…”, “Converting FBX…”, “Uploading to GPU…”).

---

## 11. 포맷 커버리지 로드맵 (아키텍처 관점)

구현 순서와 **인프라 완성도**를 분리한다.

| 마일스톤 | 인프라 | 사용자에게 보이는 포맷 |
|----------|--------|------------------------|
| **M0** | `AssetOpenRequest`, manifest, `webgl-three`, glTF native importer | `.glb` |
| **M1** | `workspace-model://`, PackageResolver, cache | `.gltf` 패키지 |
| **M2** | WASM light converter, worker queue | `.obj`, `.stl`, `.ply` |
| **M3** | `native/asset-pipeline`, sidecar, cache v2 | `.fbx`, `.dae`, `.3ds` |
| **M4** | headless Blender batch (Tier 2/3 경계) | `.blend` preview |
| **M5** | USD preview subset OR delegate-only | `.usd`, `.usda`, `.usdc` |
| **M6** | CAD tessellation pipeline | `.step`, `.iges` (preview mesh only) |

**“거의 모든 포맷”의 정의:** Assimp/OCP가 읽을 수 있는 것은 **Tier 2로 preview mesh**까지. 편집·정밀 CAD는 Tier 3 delegate. 100% 픽셀 동일 재현은 비목표.

---

## 12. World Engine · Blender · Godot과의 관계

```
                    ┌──────────────────────────────────────┐
                    │         Workspace Asset Router        │
                    └──────────────────────────────────────┘
         preview │                    │ simulate      │ edit
                 ▼                    ▼               ▼
        ┌────────────────┐   ┌──────────────┐  ┌─────────────┐
        │ Import Pipeline│   │ World Engine │  │ Blender fork│
        │ → CIR → WebGL  │   │ qt-shell     │  │ (future)    │
        └────────────────┘   └──────────────┘  └─────────────┘
                 │                    │
                 └──── optional ──────┘
                   shared native/asset-pipeline
                   (glTF materialization only)
```

| 시스템 | 역할 | CIR 공유 |
|--------|------|----------|
| **3D Viewer** | 정적·애니 메시 inspection | 소비자 |
| **World Engine** | 물리 시뮬, 게임 | 동일 glTF 캐시에서 mesh 추출 가능 (future) |
| **Blender fork** | 편집 | export → 캐시 무효화 → viewer 갱신 |
| **Godot embed** | 게임 프로젝트 | `workspace-engine://`; viewer 파이프와 무관 |

---

## 13. 코드 배치 (제안)

```
electron/src/shared/
  asset.ts                    # coarse AssetType.model3d (확장자 힌트만)
  model3d/
    scene.ts                  # WorkspaceScene, SceneManifest types
    import.ts                 # Importer, ImportResult interfaces
    manifest.ts

electron/src/main/
  model3d/
    assetRouter.ts
    formatSniffer.ts
    importJobQueue.ts
    cacheStore.ts
    packageResolver.ts
    modelProtocol.ts          # workspace-model://
    ipc.ts                    # model:open, model:import-status
  index.ts                    # IPC register

electron/src/renderer/src/
  model3d/
    viewerHost.ts             # ViewerBackend registry, mount lifecycle
    backends/webglThree.ts
    importProgress.ts         # subscribe job events
  panes/
    ModelViewerContent.tsx    # FileViewerContent에서 분기
    kinds/viewerKind.tsx      # 또는 model3dKind (later)

native/asset-pipeline/        # M3+
  (Rust: assimp/ufbx → glTF)
```

**v1 실제 구현:** `shared/model3d/scene.ts` 최소 타입 + `main/model3d/cacheStore` 스텁 + `renderer/model3d/backends/webglThree.ts` + glTF native importer 하나. **폴더 구조는 처음부터 잡고**, 파일은 점진적으로 채운다.

---

## 14. Context modeling 정렬

[08-context-modeling.md](../architecture/08-context-modeling.md)와의 매핑:

| 개념 | 3D viewer에서의 형태 |
|------|---------------------|
| **Resource** | `WorkspaceAssetRef` + cache manifest (도메인 중립) |
| **Entity** | pane tab의 `filePath` — “이 탭이 연 파일” |
| **Capability** | `Importer.capabilities`, `ViewerBackend.supports` |
| **Protocol** | `workspace-model://`, IPC `model:*`, Clipboard (future: glb drag) |
| **합치지 않을 것** | Skeleton rig semantics, USD composition, Blender modifiers |

Agent가 “이 메시 열어줘” 할 때도 `AssetOpenRequest`만 발행 — 씬 그래프는 viewer 세션 내부.

---

## 15. 테스트 전략

| 레이어 | 테스트 |
|--------|--------|
| Sniffer | magic bytes fixtures per format |
| Importer | golden manifest JSON (triangle count, material count) |
| Cache | mtime change → miss |
| PackageResolver | path traversal blocked |
| ViewerBackend | headless gl smoke (vitest + jsdom WebGL mock) |
| E2E | `test-fixtures/models/**` TreeView click |

포맷별 **golden file**은 라이선스 명확한 CC0만 repo에 포함; 대용량 FBX는 CI에서 skip + optional integration job.

---

## 16. 리스크 (확장 시)

| 리스크 | 대응 |
|--------|------|
| Importer 매트릭스 폭발 | Tier + delegate; 80%는 glTF cache 경유 |
| Assimp 품질 편차 | importer별 `warnings`, 사용자에게 “preview quality” 표시 |
| 캐시 디스크 폭주 | LRU, max size per workspace, 설정 UI |
| 보안 (악성 FBX) | sidecar sandbox, size limit, timeout |
| `.blend` headless 불안정 | Tier 3 fallback, Blender 버전 pin |

---

## 17. v1에서 당장 잡을 최소 계약

v1 기능은 GLB 하나여도, **이 4개 타입/모듈 경계는 처음부터 만든다:**

1. `AssetOpenRequest` + `AssetRouter.openPreview(path)`
2. `SceneManifest` (초기에는 `{ glbUri }` only)
3. `ImporterRegistry` + `GltfNativeImporter`
4. `ViewerBackend` + `WebGlThreeBackend`

나머지(Tier 2/3, `native/asset-pipeline`, WASM)는 빈 registry slot + 문서만.

---

## 18. 기획서와의 관계

- [3d-model-viewer.md](./3d-model-viewer.md) — UX, v1 범위, Done 기준
- **이 문서** — 포맷 확장, 파이프라인, Rust/Blender/World Engine 경계

v1 구현 시 이 아키텍처의 **§17 최소 계약**만 지키면, FBX/USD/CAD는 importer 플러그인 추가로 흡수 가능하다.
