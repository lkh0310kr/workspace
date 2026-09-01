# CAD · 3D — Central Orchestration Phase Plan

**Status:** Active planning (2026-09-01)  
**North star:** 개인 **설계·운영 실험실** (닭장, 물레, 스마트팜). Workspace는 **중앙 오케스트레이션만** — CAD 커널·정밀 편집은 delegate.  
**선행 완료:** World Engine 커널 Phase 31–36, 38, 41, 35 ([world-engine-phase-plan.md §10](./world-engine-phase-plan.md))  
**관련:** [3d-model-viewer-architecture.md](./3d-model-viewer-architecture.md) · [world-engine-simulation.md](./world-engine-simulation.md) · [ref-proj/README.md](../../ref-proj/README.md)

---

## 1. 원칙 — 우리가 소유하는 것 vs delegate

| 소유 (Orchestration) | Delegate (Tier 1) | 비목표 |
|----------------------|-------------------|--------|
| Asset open 라우팅, job queue, 캐시 | OCCT: STEP/IGES tessellation | FreeCAD 전체 재구현 |
| glTF hub (CIR 캐시) | FreeCAD: 파라메트릭 편집, FCStd | BREP 커널 직접 구현 |
| World Engine: 뷰어·pick·시뮬 | Assimp: FBX/OBJ/STL preview | Blender급 모델링 |
| `world-engine.json` 배치·스크립트 | (선택) headless Blender batch | USD를 내부 진실의 원천으로 |
| spawn / IPC / progress UI | | Omniverse급 composition |

```
┌─────────────────────────────────────────────────────────────┐
│  Workspace (Electron) — Orchestrator                          │
│  Asset Router · Job Queue · Cache · TreeView · spawn        │
└────────────┬───────────────────────────────┬────────────────┘
             │ preview / place                │ edit
             ▼                                ▼
┌────────────────────────┐      ┌─────────────────────────────┐
│ Import Pipeline        │      │ FreeCAD (out-of-process)    │
│ OCCT/Assimp → glTF     │      │ STEP/FCStd 편집              │
└────────────┬───────────┘      └─────────────────────────────┘
             │ glb cache
             ▼
┌────────────────────────┐
│ World Engine           │
│ qt-shell 뷰어 + Rapier │
│ world-engine.json 시뮬  │
└────────────────────────┘
```

**포맷 계약 (고정)**

| 층 | 포맷 | 역할 |
|----|------|------|
| Authoring (CAD) | STEP, FCStd | 부품 **소스** — OCCT/FreeCAD만 읽음 |
| Runtime hub | glTF / `.glb` | 뷰어·캐시 **CIR** — 엔진이 소비 |
| Simulation | `world-engine.json` | 배치·물리·Rhai — 엔진 SDK |
| Design metadata | `design/*.json` (Phase 59) | 스펙 수치 — 프로젝트 소유 |
| Interop (나중) | USD export | Isaac/Omniverse **보내기만** |

---

## 2. World Engine §10과의 관계

| World Engine Phase | Orchestration track에서의 위치 |
|--------------------|-------------------------------|
| 31–36, 38, 41, 35 ✅ | **소비** — 시뮬·pick·pause·save 커널 |
| 37 design overlay | **→ Phase 59**로 이동 (오케스트레이션 층) |
| 39 scenario runner | **보류** — CAD MVP 후 필요 시 |
| 40 API freeze | **→ Phase 57** (오케스트레이션 1.0) |

엔진 바이너리에 CAD 도메인 필드를 넣지 않는다. `properties`, `sim_var`, `name`, `tags`만.

---

## 3. Phase 50+ — 실행 순서

```
50 계약·타입  →  51 Router/Job  →  52 glTF hub + STEP delegate
  →  53 CAD Viewer MVP  →  54 시설 배치  →  55 측정·스냅
  →  56 FreeCAD edit delegate  →  57 (선택) USD export  →  58 design overlay  →  59 freeze
```

---

### Phase 50 — Orchestration contract  
**상태:** ✅ DONE (2026-09-01)  
**목표:** Workspace·엔진·delegate 경계를 **타입 + 문서**로 고정.

| IN | OUT |
|----|-----|
| `AssetOpenRequest`, `ImportJob`, `ImportResult` TS 타입 (`electron/src/shared/model3d/`) | OCCT 바인딩 |
| `AssetIntent`: `preview` \| `place` \| `simulate` \| `edit` | |
| 이 문서 §1 포맷 표를 코드 주석과 동기화 | |

**산출물:** `orchestration_contract` 스모크 (타입-only 또는 mock job round-trip).  
**완료 기준:** Router가 intent만 보고 pipeline을 고를 수 있음.

---

### Phase 51 — Asset Router + Job Queue  
**상태:** ✅ DONE (2026-09-01)  
**목표:** 파일 열기 → sniff → queue → progress IPC.

| IN | OUT |
|----|-----|
| `assetRouter.ts`, `importJobQueue.ts` ([3d-model-viewer-architecture.md §10](./3d-model-viewer-architecture.md)) | Renderer에서 Assimp 직접 호출 |
| 상태: `queued → converting → ready \| failed` | |
| `workspace-model://` 또는 cache URI 반환 | |

**산출물:** `.glb` native path E2E (기존 M0).  
**완료 기준:** TreeView 더블클릭 → job progress → viewer에 mesh.

---

### Phase 52 — glTF hub + STEP delegate  
**상태:** ⬜ PENDING  
**목표:** CAD **미리보기** = tessellated mesh만. 편집은 delegate.

| IN | OUT |
|----|-----|
| OCCT sidecar: `step → glb` (+ `meta.warnings[]`) | STEP BREP 편집 |
| content-address cache (`sha256.glb`) | |
| Assimp path: `.stl`, `.obj` (M2/M3와 동일 큐) | |

**산출물:** `step_preview_contract` — fixture STEP 1개 → glb hash stable.  
**완료 기준:** 동일 STEP 두 번 열기 → 캐시 hit, OCCT 재실행 없음.

---

### Phase 53 — CAD Viewer MVP (World Engine shell)  
**상태:** ⬜ PENDING  
**목표:** 시설 검토용 **뷰어** — 멀티 메시, 선택, 레이어 표시.

| IN | OUT |
|----|-----|
| qt-shell: glTF per-entity mesh (기존 `MeshKind::Loaded` 확장) | PBR |
| 선택 하이라이트 (pick Phase 35 활용) | |
| 레이어/가시성: `tags` 또는 `properties.layer` | |
| orbit + fly + pause (Phase 36) | |

**산출물:** `cad_viewer_contract.rs` 또는 qt-shell 스모크 + fixture `world-engine-cad-preview/`.  
**완료 기준:** STEP에서 변환된 2부품 씬에서 raycast로 이름 표시.

---

### Phase 54 — Facility placement  
**상태:** ⬜ PENDING  
**목표:** import한 부품을 **시설 씬에 배치**하고 시뮬에 연결.

| IN | OUT |
|----|-----|
| `world-engine.json`에 `mesh: "cache/xxx.glb"` + transform | 인게임 에디터 |
| `properties`에 부품 메타 (part_id, source_step) | |
| 배치 후 `step_n` + `sim_metrics` 회귀 | |

**산출물:** chicken-coop 또는 신규 `facility-placement-demo`.  
**완료 기준:** glTF 부품 1개 배치 → physics pick → Rhai `entity_property` 읽기.

---

### Phase 55 — Measure & snap lite  
**상태:** ⬜ PENDING  
**목표:** 설계 리뷰 최소 도구 — **치수 편집 아님**.

| IN | OUT |
|----|-----|
| 점-점 거리 (pick hit `point` Phase 35) | 치수 구속 solver |
| grid / axis snap (translate gizmo lite) | |
| 측정 결과 stdout 또는 overlay JSON | |

**산출물:** `measure_contract.rs` — 두 고정 큐브 간 거리 assert.  
**완료 기준:** headless에서 raycast 두 점 → 거리 오차 < 1e-3.

---

### Phase 56 — FreeCAD edit delegate  
**상태:** ⬜ PENDING  
**목표:** “Open in FreeCAD” — **편집은 항상 delegate**.

| IN | OUT |
|----|-----|
| Workspace: STEP/FCStd → spawn FreeCAD (경로 설정) | FreeCAD 임베드 in-process |
| 저장 후 cache 무효화 → re-import job | |
| [09-future-native-architecture.md](../architecture/09-future-native-architecture.md) Track B 정렬 | |

**산출물:** 수동 QA 체크리스트 + IPC `cad:open-external`.  
**완료 기준:** FreeCAD에서 저장 → Workspace re-preview 성공.

---

### Phase 57 — USD export boundary (선택)  
**상태:** ⬜ PENDING · **필요 시만**  
**목표:** 외부 도구(Isaac, Omniverse)로 **보내기**.

| IN | OUT |
|----|-----|
| `world-engine.json` + glTF cache → USDA subset export | USD composition 내부 소유 |
| export adapter sidecar (blender/usdzip 등 조사 후 1종) | USD import as CIR |

**산출물:** fixture 1개 USD export + round-trip smoke (mesh 이름 유지).  
**완료 기준:** export 파일이 외부 뷰어에서 열림 (수동 1회).

---

### Phase 58 — Design file overlay  
**상태:** ⬜ PENDING (구 World Engine Phase 37)  
**목표:** geometry(`world-engine.json`)와 **스펙**(`design/*.json`) 분리 — 오케스트레이션 층.

| IN | OUT |
|----|-----|
| JSON `design: "design/coop.json"` — load 시 merge 또는 Rhai preload | 비주얼 design tool |
| `design_get(path)` Rhai (또는 `properties` 주입) | |
| 깨진 경로 → warn + skip | |

**산출물:** chicken-coop `design/` 분리, 기존 contract 동일.  
**완료 기준:** design JSON 수치 변경만으로 시뮬 결과 변경.

---

### Phase 59 — Orchestration API 1.0 freeze  
**상태:** ⬜ PENDING (구 Phase 40 자리)  
**목표:** Phase 50–58 **오케스트레이션 표면** semver 후보 고정.

| IN | OUT |
|----|-----|
| `3d-model-viewer-architecture.md` §17 최소 계약 구현 검증 | WASM 전체 스택 |
| `world-engine.schema.json` mesh/cache 필드 문서화 | |
| Phase 50–58 checklist 전부 ✅ | |

---

## 4. 마일스톤 ↔ 3D Viewer 아키텍처 매핑

| Orchestration Phase | Viewer arch milestone |
|---------------------|------------------------|
| 51 | M0–M1 |
| 52 | M2–M3, **M6** (STEP) |
| 53–55 | Viewer backend 소비 |
| 56 | Tier 3 delegate |
| 57 | M5 (USD export only) |

---

## 5. 다음 액션

**착수:** Phase 52 — glTF hub + STEP delegate (OCCT sidecar).

**완료:** Phase 50–51 — `orchestration.ts`, `importJobQueue`, `routeAssetOpen`, `model:import-status` IPC.

---

## 6. 변경 이력

| 날짜 | 내용 |
|------|------|
| 2026-09-01 | Phase 50–51 DONE: orchestration types, import job queue, routeAssetOpen, IPC |
| 2026-09-01 | CAD Orchestration Track (Phase 50+) 신설; 구 Phase 37/40 재배치 |
