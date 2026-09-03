# Core Model (Workspace primitives)

**Status:** Philosophy / target shape (2026-09-03). Not a crate to implement this week.  
**Lineage:** Conversation sketch (“모든 툴이 공통 primitive 위에서 조합”) + existing
[08-context-modeling.md](./08-context-modeling.md) (“Domain owns meaning. Workspace owns context.”).  
**Does not replace:** fork/embed internals (Penpot Document, FreeCAD BREP, avr8js MCU, Rapier world).

This doc is the **model-design** half of the layered Workspace picture. Command/Event/mobile remote
are noted only as *consumers of the same model* — they are not designed here
([TODO.md](../../TODO.md) i-1, army/companion). Build them after Core Model refs + a Command Bus
exist ([ROADMAP.md](../ROADMAP.md) Phase 1).

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

**Killer rule:** panes do not wire to each other (`Penpot → World`, `Spreadsheet → Farm`).
They import/export/compose **Core Model kinds**. Tools know the model; tools do not know tools.

That is the same sentence as 08’s “unify the *context*, not the *worlds*” — with a name for the
shared context types.

---

## 2. Reconciliation with 08 (do not collapse these)

| 08 (keep) | Pyramid sketch (keep) | How they coexist |
|-----------|----------------------|------------------|
| Domain owns *meaning* (what a Penpot Shape *is*) | Core Model owns *kinds of handles* (Asset, Graph, Entity id) | OCCT still owns BREP. Workspace owns `Resource` pointing at a `.glb` / STEP path. |
| No Universal Object merging engines | Image → World, Mesh → World, Dataset → Sim | Composition is **refs + protocols** (Clipboard MIME, `AssetOpenRequest`, file path), not one mega-struct. |
| Capability over universal type | New pane = combine Graph + Geometry + Data | PCB editor is not a new universe; it is Graph (nets) + Geometry (footprints) + Resource (gerbers). Second consumer still required before a shared Graph *engine*. |
| Entity = namespaced id + opaque `type` | Entity · Document · Node · … | Extra words are **roles** a handle can play, not new ECS in Electron. `hw:comp:led1` is an Entity; avr8js does not implement Entity. |
| Build shared abstraction after a **second** consumer | “Graph Engine for shader + circuit + AI” | Circuit (hardware-sim) is consumer #1 of Graph-shaped JSON. Do **not** extract `native/graph-core` until a second real graph (behavior, shader, farm pipeline) needs the same crate. |

**Wrong:** one Rust `CoreModel` crate that Rapier, OCCT, and avr8js all subclass.  
**Right:** CAD already did this — Authoring (STEP) vs CIR (glTF) vs Simulation (`world-engine.json`).
Core Model is the **CIR/handle layer**, not the authoring kernel.

---

## 3. Primitives (Workspace-facing)

Each row is a *contract*, not a mandate to rewrite panes tomorrow.

| Kind | Meaning for Workspace | Exists today (approx.) | Do not unify |
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

**World Engine is not an island:**  
`World ≈ Entity + Geometry(Resource) + Time + State + Rules(Rhai)`.  
That is composition of Core kinds *plus* a domain engine (Rapier). Same pattern as hardware-sim.

---

## 4. Hardware-as-Code as composition (not a fifth universe)

Maps the Arduino / HaC track onto this model. Detail: [hardware-sim-phase-plan.md](../planning/hardware-sim-phase-plan.md).

| HaC piece | Core kind | Domain engine |
|-----------|-----------|---------------|
| Board, component instance | Entity (`hw:uno`, `hw:led1`) | pin maps, part library |
| `connections` / nets / ports | **Graph** | discrete-event circuit (our crate) |
| `firmware/*.ino`, hex | Resource (+ Document for source) | arduino-cli, avr8js |
| `params.ohm`, dump JSON | Data / State | validate + runtime dump |
| LED in a chicken coop scene | Resource/State → WE `properties` (Phase 66) | Rapier does not simulate GPIO |

PCB later: Graph + Geometry + Resource — **new pane, same kinds**, not `Penpot──PCB──World` spaghetti.

Do not put `PinCapability` into World Engine schema. That is hardware-sim meaning; WE only stores opaque `properties` if we overlay.

---

## 5. Geometry vs CAD vs WE (already decided, named here)

[cad-orchestration-phase-plan.md](../planning/cad-orchestration-phase-plan.md):

| Layer | Format | Core kind |
|-------|--------|-----------|
| Authoring | STEP, FCStd | Domain (OCCT/FreeCAD) — **not** Core Geometry |
| CIR | glTF | Resource + Geometry exchange |
| Facility sim | `world-engine.json` | World |

Vector editor / GIS / CAD sharing “one Geometry kernel” is a **long-term CIR dream**, same failure mode as merging Document Models ([ideation.md](../IDEATION.md) fork/embed). Share files and importers first.

---

## 6. Interaction / Command (boundary only)

Design system in the sketch (Selection, Undo, Shortcut) is **not** buttons. This repo already has a slice: [04-interaction-coordinator.md](./04-interaction-coordinator.md) (pointer, overlay, focus). Phase 1 Command Bus is still the right place for `RunSimulation` / `OpenAsset` — **Capability-shaped**, agent and future mobile both call that, they do not get a second Core Model.

Mobile companion (observe, notify, command queue, eventually-connected): **same Entity/Resource/Event**, different surface. Do not design a phone schema. Order remains: Core refs → Command/Event → desktop → remote API → client.

---

## 7. What to build when (promotion rule)

Copied from 08 and `paneKindRegistry` history: **extract a shared crate/module when a second real consumer needs it.**

| Now | Next consumer that would justify extraction |
|-----|-----------------------------------------------|
| hardware-sim JSON graph | Behavior graph or data pipeline pane |
| model3d Resource URLs | Asset registry used by Markdown + 3D + hardware hex |
| WE World | Farm experiment API that is not Rhai-only |
| Markdown Document | HWPX/Office path (explicitly later) |

Until then: duplicate a small JSON shape is cheaper than a premature `graph-core`.

---

## 8. Related

- [08-context-modeling.md](./08-context-modeling.md) — Entity/Resource/Capability/Provenance; what *not* to build
- [ideation.md](../IDEATION.md) — do not merge forked engines’ document models
- [3d-model-viewer-architecture.md](../planning/3d-model-viewer-architecture.md) §14 — viewer mapped onto 08
- [world-engine-simulation.md](../planning/world-engine-simulation.md) — World as sim kernel, not universal model
- [hardware-sim-phase-plan.md](../planning/hardware-sim-phase-plan.md) — first Graph-shaped domain crate
