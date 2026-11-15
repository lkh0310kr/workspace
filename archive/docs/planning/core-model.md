# Core Model (Workspace 프리미티브)

**상태:** 철학 / 목표 형태 (2026-09-03). 이번 주에 구현할 crate는 아닙니다.
**배경:** 대화에서 나온 구상(“모든 툴이 공통 primitive 위에서 조합”)과 기존
[context-modeling.md](./context-modeling.md)(“도메인이 의미를 소유하고 Workspace가 맥락을 소유한다”).
**대체하지 않는 것:** 포크/임베드 내부 모델(Penpot Document, FreeCAD BREP, avr8js MCU, Rapier world).

이 문서는 계층형 Workspace 구상의 **모델 설계** 부분입니다. Command/Event/mobile remote는
같은 모델의 *소비자*로만 언급하며, 여기서 설계하지 않습니다.
([제품 아이디어의 i-1](./uncommitted-ideas.md#i-1-pkms-옵시디언-모바일-연동-방법)). Build them after Core Model refs + a Command Bus
exist ([roadmap.md](./roadmap.md) Phase 1).

---

## 1. The stack (target, not current code)

```
PERSONAL WORKSPACE
  Tool / Pane     Penpot · CAD viewer · World Editor · Embedded · Notebook · …
  Domain / Engine World Engine · hardware-sim · OCCT · avr8js · media · …
  Core Model      Entity · Resource/Asset · Document · Graph · Geometry · Time/State · Query
  Interaction     Selection · Command · Undo · Pointer  (see 04-interaction-coordinator)
  Platform        Electron shell · Rust natives · FS · IPC
```

**핵심 규칙:** pane끼리 직접 연결하지 않습니다(`Penpot → World`, `Spreadsheet → Farm`).
대신 **Core Model 종류**를 가져오고, 내보내고, 조합합니다. 도구는 모델을 알지만 다른 도구를 직접 알지 않습니다.

이는 08의 “*세계*가 아니라 *맥락*을 통합한다”는 원칙을 공유 맥락 타입의 이름으로 표현한 것입니다.

---

## 2. Reconciliation with 08 (do not collapse these)

| 08 (유지) | 피라미드 구상 (유지) | 함께 적용하는 방식 |
|-----------|----------------------|------------------|
| Domain owns *meaning* (what a Penpot Shape *is*) | Core Model owns *kinds of handles* (Asset, Graph, Entity id) | OCCT still owns BREP. Workspace owns `Resource` pointing at a `.glb` / STEP path. |
| No Universal Object merging engines | Image → World, Mesh → World, Dataset → Sim | Composition is **refs + protocols** (Clipboard MIME, `AssetOpenRequest`, file path), not one mega-struct. |
| Capability over universal type | New pane = combine Graph + Geometry + Data | PCB editor is not a new universe; it is Graph (nets) + Geometry (footprints) + Resource (gerbers). Second consumer still required before a shared Graph *engine*. |
| Entity = namespaced id + opaque `type` | Entity · Document · Node · … | Extra words are **roles** a handle can play, not new ECS in Electron. `hw:comp:led1` is an Entity; avr8js does not implement Entity. |
| Build shared abstraction after a **second** consumer | “Graph Engine for shader + circuit + AI” | Circuit (hardware-sim) is consumer #1 of Graph-shaped JSON. Do **not** extract `native/graph-core` until a second real graph (behavior, shader, farm pipeline) needs the same crate. |

**잘못된 방향:** Rapier, OCCT, avr8js가 모두 상속하는 단일 Rust `CoreModel` crate.
**올바른 방향:** CAD에서 이미 적용한 Authoring (STEP), CIR (glTF), Simulation (`world-engine.json`)의 분리입니다.
Core Model은 authoring kernel이 아니라 **CIR/handle 계층**입니다.

---

## 3. Primitives (Workspace-facing)

각 행은 *계약*이며, 내일 당장 pane을 다시 작성하라는 지시가 아닙니다.

| 종류 | Workspace에서의 의미 | 현재 대략적인 구현 | 통합하지 않을 대상 |
|------|----------------------|------------------------|--------------|
| **Entity** | Namespaced id of “a thing we can point at” | `PaneTabItem`; WE `name`/`tags`; 08 Entity | Penpot shape graph, hecs `Entity` |
| **Resource / Asset** | Domain-agnostic bytes + ref (path, hash, mime) | Planned Asset system; `workspace-model://`; model3d cache key | Copying every blob into a central store (08: ref in place) |
| **Document** | Nodes, text, embeds, metadata, refs | Markdown editor; EPUB viewer | One DOM for HWPX+MD+Penpot |
| **Graph** | Node, edge, port, metadata | *Not extracted.* Hardware `connections[]` is graph-shaped | Shader graph UI, KiCad, node editor as one app |
| **Geometry** | Point…mesh as *exchange* (glTF, SVG, geojson) | Model Viewer glTF hub; WE mesh load | BREP, GIS topology, CAD sketches as one kernel |
| **World** | Entity + transform + time + rules | `world-engine.json` + Rapier | Hardware pin netlist |
| **Time / State** | Clock + serializable runtime | WE `sim_time` / `WorldSave`; hardware `RuntimeState` (planned) | One clock for MCU ns and Rapier dt |
| **Query** | Read without owning domain | `sim_metrics`, pick, `fs:search` | Knowledge graph (08: not now) |
| **Provenance** | user / agent / imported / generated | 08: bake into Asset when it lands | Full epistemology taxonomy |

**World Engine은 고립된 섬이 아닙니다:**
`World ≈ Entity + Geometry(Resource) + Time + State + Rules(Rhai)`.
이는 Core 종류와 도메인 엔진(Rapier)을 조합한 형태입니다. hardware-sim과 같은 패턴입니다.

---

## 4. Hardware-as-Code as composition (not a fifth universe)

Arduino / HaC 트랙을 이 모델에 대응시킵니다. 자세한 내용은 [hardware-sim-phase-plan.md](./hardware-sim-phase-plan.md)를 참고하세요.

| HaC 구성요소 | Core 종류 | 도메인 엔진 |
|-----------|-----------|---------------|
| Board, component instance | Entity (`hw:uno`, `hw:led1`) | pin maps, part library |
| `connections` / nets / ports | **Graph** | discrete-event circuit (our crate) |
| `firmware/*.ino`, hex | Resource (+ Document for source) | arduino-cli, avr8js |
| `params.ohm`, dump JSON | Data / State | validate + runtime dump |
| LED in a chicken coop scene | Resource/State → WE `properties` (Phase 66) | Rapier does not simulate GPIO |

PCB later: Graph + Geometry + Resource — **new pane, same kinds**, not `Penpot──PCB──World` spaghetti.

Do not put `PinCapability` into World Engine schema. That is hardware-sim meaning; WE only stores opaque `properties` if we overlay.

---

## 5. Geometry와 CAD, WE (기존 결정을 여기서 명명)

[cad-orchestration-phase-plan.md](./cad-orchestration-phase-plan.md):

| Layer | Format | Core kind |
|-------|--------|-----------|
| Authoring | STEP, FCStd | Domain (OCCT/FreeCAD) — **not** Core Geometry |
| CIR | glTF | Resource + Geometry exchange |
| Facility sim | `world-engine.json` | World |

벡터 편집기 / GIS / CAD가 “하나의 Geometry kernel”을 공유하는 것은 **장기적인 CIR 목표**입니다. Document Model을 합칠 때와 같은 실패 가능성이 있으므로([product-direction.md](./product-direction.md)의 fork/embed 원칙), 먼저 파일과 importer를 공유합니다.

---

## 6. Interaction / Command (boundary only)

구상에 나온 디자인 시스템(Selection, Undo, Shortcut)은 버튼을 뜻하지 않습니다. 이 저장소에는 이미 [04-interaction-coordinator.md](../architecture/04-interaction-coordinator.md)의 pointer, overlay, focus 일부가 있습니다. Phase 1 Command Bus가 `RunSimulation` / `OpenAsset`을 둘 적절한 위치이며, **Capability 형태**로 제공해 agent와 향후 mobile이 함께 호출하도록 합니다. 별도의 Core Model은 만들지 않습니다.

Mobile companion(관찰, 알림, command queue, 향후 연결)은 표면만 다를 뿐 **같은 Entity/Resource/Event**를 사용합니다. 별도의 phone schema는 설계하지 않습니다. 순서는 Core refs → Command/Event → desktop → remote API → client입니다.

---

## 7. What to build when (promotion rule)

08과 `paneKindRegistry`의 이력에서 가져온 원칙입니다. **두 번째 실제 소비자가 필요로 할 때 공유 crate/module을 추출합니다.**

| 현재 | 추출을 정당화할 다음 소비자 |
|-----|-----------------------------------------------|
| hardware-sim JSON graph | Behavior graph or data pipeline pane |
| model3d Resource URLs | Asset registry used by Markdown + 3D + hardware hex |
| WE World | Farm experiment API that is not Rhai-only |
| Markdown Document | HWPX/Office path (explicitly later) |

그때까지는 성급한 `graph-core`보다 작은 JSON 구조를 중복하는 편이 비용이 적습니다.

---

## 8. 관련 문서

- [context-modeling.md](./context-modeling.md) — Entity/Resource/Capability/Provenance; what *not* to build
- [product-direction.md](./product-direction.md) — do not merge forked engines’ document models
- [3d-model-viewer-architecture.md](./3d-model-viewer-architecture.md) §14 — viewer mapped onto 08
- [world-engine-simulation.md](./world-engine-simulation.md) — World as sim kernel, not universal model
- [hardware-sim-phase-plan.md](./hardware-sim-phase-plan.md) — first Graph-shaped domain crate
