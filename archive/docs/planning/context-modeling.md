# Context 모델링 철학 (참고 자료, 사양 아님)

**상태:** 철학/참고 자료 전용. 제공된 두 편의 에세이를 바탕으로 작성했습니다.
(두 번째 글인 "Context Convergence"는 첫 번째 글과 같은 계보에서 이를 다듬고 확장하며, 경쟁하는 프레임워크가 아닙니다.) 원문을 그대로 옮기지는 않았습니다.
현재 코드베이스의 실제 성격(knowledge-graph 플랫폼이 아닌 경량 Electron pane/tab shell)에 맞춰 걸러내고, 기존 코드와 [`roadmap.md`](./roadmap.md)의 Phase 1 모듈 목록에 대응시켰습니다. 아래 절은 지금 결정할 내용과 명시적으로 시기상조인 내용으로 나뉩니다. 이 문서의 목적은 지금 전부 구현하는 것이 아니라, 나중에 이 철학과 양립할 수 없는 것을 실수로 만들지 않도록 하는 데 있습니다.

## 한 문장으로

> Domain owns meaning. Workspace owns context. Agent connects them.

새로운 원칙은 아닙니다. [`product-direction.md`](./product-direction.md)의 fork/embed 절에 이미 기록되어 있습니다. 포크한 앱의 Shape/Mesh/Scene/Process 내부 모델을 공유 "Universal Object"로 합치지 말고, 앱 자체 엔진을 유지하며 Workspace는 주변 인프라(File System, Project, Asset, Clipboard, Command Bus, Shortcut Registry — Phase 1 목록)만 제공합니다. 이 글은 *Workspace가 맡는 부분에 실제로 무엇이 들어가는지* 더 정확한 용어로 설명합니다. Phase 2에서 포크 앱을 둘 이상 동시에 열고 "Penpot의 그 도형"이나 "Godot의 그 장면"을 참조해야 할 때, Workspace가 Shape나 Scene의 *의미*를 아는 척하지 않으면서 연결하는 데 중요해집니다.

## 추상론에 그치지 않고 실제 계획에 중요한 이유

Phase 2(2D/3D/Video/Engineering, [`roadmap.md`](./roadmap.md)에 따라 실제 엔진을 포크하는 단계)는 이미 "도메인이 의미를 소유한다"는 원칙을 채택했습니다. "Workspace가 맥락을 소유한다"는 부분은 아직 *결정되지 않았습니다*. Penpot이나 Godot 내부를 들여다보지 않고도 pane 간 복사/붙여넣기, agent가 "그 객체"를 참조하기, 열린 pane 전체 검색을 지원하려면 Workspace가 Penpot 도형이나 Godot 장면에 관해 무엇을 추적해야 할까요? 아래 개념은 한 가지 구체적인 답입니다. 지금 저렴하게 도입할 수 있는 것과 실제로 두 번째 포크 앱이 필요로 할 때만 구축할 인프라를 구분했습니다.

## 지금 도입할 가치가 있는 개념

### Entity — Workspace가 참조할 수 있는 도메인 앱의 대상을 표현하는 최소 구조

```ts
interface Entity {
  id: string;      // namespaced, e.g. "penpot:shape:183" — self-describing, never collides across domains
  type: string;     // owned by the domain, Workspace doesn't interpret it
  metadata?: Record<string, unknown>;
  provenance?: Provenance; // see below
}
```

`PaneTabItem` (`layout/paneTypes.ts`)은 이미 가벼운 Entity입니다. 다만 포크 앱 *내부*의 객체(Penpot의 도형 하나, Godot의 mesh 하나)가 아니라 "tab"을 나타냅니다. 포크 앱 pane이 내부 객체를 Workspace에 노출해야 하는 경우(앱 간 복사/붙여넣기, agent의 특정 객체 참조), 도메인별로 더 큰 공유 타입을 만드는 대신 이 최소 계약을 사용하면 됩니다. Phase 1에서 계획한 **Asset system**도 별도의 임시 구조를 발명하는 대신 이 형태를 따르는 편이 좋습니다.

### Resource — 실제로 도메인에 종속되지 않는 데이터

이미지, 글꼴, 오디오, 비디오, 바이너리 blob은 처음 가져온 pane의 소유물이 아닙니다. 이는 Phase 1에서 이미 계획한 Asset system과 같습니다. 이 절은 새로운 내용을 추가하지 않고, pane 종류마다 "PNG를 어떻게 읽을까"를 중복 정의하는 대신 id/type/name/source/metadata 구조를 사용하는 것이 맞다는 점을 확인합니다.

### Universal Type보다 Capability

현재 `PaneKindDefinition`(`panes/paneKindRegistry.ts`)이 이미 이 방식으로 동작합니다. `hasFileExplorer`, `pickerEntries`, `createItem`, `render`를 통해 pane 종류가 *할 수 있는 일*을 선언하므로, registry는 "vector"나 "browser" 종류의 내부 구현을 알 필요가 없습니다. 이 철학은 같은 패턴을 렌더링뿐 아니라 **액션**에도 적용해야 함을 확인합니다. Phase 1의 **Command Bus**(`db.query.run`, `packet.filter.apply`를 Workspace가 동작을 알 필요 없이 하나의 registry에 등록)도 바로 이 방식입니다.

### 내부 구현 공유가 아닌 프로토콜을 통한 통합

`product-direction.md`의 fork/embed 원칙(`third-party/<app>`은 그대로 유지하고 `integrations/<app>` adapter를 두며 Document Model을 합치지 않음)을 다시 설명하면서 한 가지를 덧붙입니다. 앱 간 상호작용은 항상 정의된 계약(Clipboard MIME 규칙, Command Bus, Asset 참조)으로 구현해야 합니다. 한 포크 앱의 내부 코드가 다른 앱을 직접 호출해서는 안 됩니다. Phase 1의 Clipboard protocol과 Command Bus가 선택 사항이 아니라 필수 기반임을 확인합니다.

### Provenance — 지금 도입하면 저렴하고 나중에 추가하면 비쌈

```ts
interface Provenance {
  source: "user" | "agent" | "imported" | "generated";
  createdBy?: string; // agent id, import path, etc.
  timestamp?: number;
}
```

아직 어떤 계획에도 포함되지 않았지만, 이 문서의 다른 내용보다 먼저 구현하더라도 Asset/Entity schema에 *처음부터* 넣을 가치가 있습니다. 기존 데이터에 나중에 출처 추적 필드를 추가하려면 실제 마이그레이션 작업이 필요하지만, 아직 없는 schema에 추가하는 비용은 없습니다. 이 앱에서는 사람과 AI agent가 모두 편집하므로("사람이 작성했는가, Claude가 생성했는가") 출처 구분은 가까운 시기에 실제로 필요할 수 있습니다. 아래의 전체 Relation graph처럼 추측성 요구사항은 아닙니다.

### Context ≠ Project ≠ Folder

두 번째 에세이가 가장 명확하게 더한 내용입니다. 현재 코드베이스에서 다소 혼동하는 세 가지를 구분합니다.

- **Folder** — 데이터가 저장된 위치입니다. workspace tab의 `rootPath`이며, 폴더 자체가 프로젝트에 무엇이 포함되는지는 알지 못합니다.
- **Project** — 만들고 있는 대상입니다. 이제 최소한의 실제 구현인 [`projectManifest.ts`](../../apps/workspace/src/main/projectManifest.ts)(방금 구현한 Phase 1)가 있습니다. 현재 어떤 tab이 열려 있는지와 무관하게 `rootPath`의 앱/문서 registry 역할을 합니다.
- **Context** — 사용자나 agent가 *지금* 작업 중인 환경입니다. 열린 tab/pane, 선택 항목, 진행 중인 agent 작업의 대상이 여기에 포함됩니다. 현재 가장 가까운 구현은 workspace tab의 실시간 `PaneGroupConfig`(열린 pane, 활성 tab, 선택 상태)입니다. 실제 값이지만 pane-group 단위이며 workspace tab 전체 split을 통합하지는 않습니다. 지금 해결할 격차는 아니며, 이후 "agent가 현재 무엇을 작업 중인가"라는 질문을 앞의 두 개념과 혼동하지 않고 다룰 출발점으로 기록합니다.

### Physical decentralization, semantic centralization

> Data may remain physically distributed. Meaning should be semantically
> connected.

이는 다음 단계인 Phase 1 **Asset system**의 구조를 직접 결정합니다. Asset 항목은 데이터가 실제로 있는 위치(포크 앱의 프로젝트 폴더, workspace root 등)를 가리키는 *참조*(path/id)와 metadata여야 하며, 중앙 blob store에 복사해서는 안 됩니다. Workspace가 데이터를 "알기" 위해 데이터를 옮길 필요가 없습니다. `engineBundleProtocol.ts`도 파일을 제자리에서 제공하고 bundle을 다른 곳에 복사하지 않는 같은 원칙을 따릅니다.

### Agent boundary — relevant now, not speculative

> Agent reads Context, acts only through Capability, never reaches into
> Domain internals directly.

아직 진행 중인 이 앱의 **MCP / agent orchestration** 항목(`roadmap.md`의 History 절)을 위해 명시할 가치가 있습니다. 앱이 MCP server에 상태를 제공하거나 agent가 열린 pane을 프로그래밍 방식으로 조작하게 된다면, 인터페이스는 pane 종류별 open/read/write/search 기능을 제공하는 Capability 형태여야 합니다. 이는 `PaneKindDefinition`이 사람의 상호작용에 제공하는 계약과 같습니다. "agent가 우연히 열린 파일에 대한 raw handle을 받는" 구조가 아닙니다.

## 지금 만들지 않을 개념

나중에 이 개념을 잃거나 양립 불가능하게 구현하지 않도록 기록합니다. 다만 아직 구체적인 필요는 없습니다. 이 프로젝트는 실제 두 번째 소비자가 필요로 할 때 공유 추상화를 만드는 것을 원칙으로 합니다. `paneKindRegistry.ts`도 pane 종류 6개가 생긴 뒤에 추출했습니다.

- **Relation graph** (신뢰도/provenance가 있는 typed Entity↔Entity 관계) — 실제 knowledge-graph 인프라입니다. 현재 앱에는 관계를 구성할 만큼 도메인 간 Entity가 없습니다. Entity/Asset을 둘 이상의 포크 앱에서 실제로 사용한 뒤 다시 검토합니다.
- **Knowledge layer** (embeddings + graph + full-text + structured data를 함께 제공) — 이 앱에는 이미 full-text search(`fs:search` IPC)가 있지만 vector/graph 계층은 없습니다. 구체적인 요구 없이 추가하는 것은 이 프로젝트가 피하는 성급한 추상화입니다.
- **Contextual Truth** (Fact / Interpretation / Inference / Generation의 정식 분류) — 인식론적으로 엄밀한 구조지만 현재 기능에서 이를 공식적으로 구분할 필요는 없습니다. 위 `Provenance.source`가 가까운 시기에 필요한 구분(user와 agent)을 다룹니다.
- 일반 Resource 개념으로서의 **Lifecycle state machine** (Discovered→Loaded→Active→Idle→Suspended→Released) — 이 앱은 pane에 대해 hide/show와 과거 Phase 3 backlog의 cold-park 구상이라는 비공식 버전을 이미 갖고 있습니다. 실제 두 번째 자원 집약적 소비자(실행 중인 포크 3D/CAD 엔진)가 생기기 전까지 일반화하는 것은 시기상조입니다.
- **Security boundary / Capability별 권한** — Agent/MCP 작업이 실제로 시작되면 중요한 문제입니다. 현재 이 앱은 단일 사용자 환경이고 모든 기능이 사용자 권한으로 실행됩니다.

## 이 프로젝트에 맞춘 아키텍처 구상

원문 에세이의 다이어그램은 이 앱이 목표로 하지 않는 Research/Office 도메인까지 포함합니다. 여기서는 실제 Phase 2 범위에 맞췄습니다.

```
                         Context (workspace tab + its panes)
                                    │
                  ┌─────────────────┼─────────────────┐
                  │                 │                 │
              Entities          Resources          Capabilities
           (PaneTabItem,        (Asset system,      (PaneKindDefinition,
            future Asset         Phase 1)            Command Bus,
            references)                              Phase 1)
                  │                 │                 │
                  └────────┬────────┴────────┬────────┘
                           │                 │
                      Protocols          Applications
                  (Clipboard, Command    (forked engines:
                   Bus — Phase 1)         Penpot/Blender/
                           │              Godot/FreeCAD/...)
                           │                 │
                           └────────┬────────┘
                                    │
                                  Agent
                                    │
                              (Capability only —
                               no direct Domain access)
```

## 전환 방향을 한 줄씩 정리

두 번째 에세이의 마무리 구도를 가져왔습니다. 모든 문장이 이미 확정된 결정이어서가 아니라, 향후 설계 결정이 불분명할 때 유용한 점검 기준이 되기 때문입니다.

- Not "which application can do this" but "which capability can
  accomplish this."
- Not "where is my data" but "what is this data related to."
- Not "I need to move between applications" but "the context carries
  the work across applications."

And its own summary of the whole thing:

> We do not unify the worlds. We unify the context in which the worlds
> can coexist.

## 관련 문서

- [product-direction.md](./product-direction.md) — 이 문서에서 일반화한 fork/embed 원칙과 Phase 2의 네 가지 목표 범주
- [roadmap.md](./roadmap.md) — 이 문서의 Entity/Resource/Capability 형태를 반영해야 할 Phase 1 모듈 목록(Asset, Clipboard, Command Bus, Shortcut Registry)
- [core-model.md](./core-model.md) — 계층형 primitive(Graph, Geometry, 조합으로서의 World)를 설명하고 “도구가 Core Model을 공유한다”는 구상과 이 문서를 조정
- [native-architecture.md](./native-architecture.md)
  — 자원 집약적 포크 엔진을 위한 "Application Isolation" / out-of-process 방향을 설명합니다. 같은 "내부 모델을 합치지 않는다" 원칙을 데이터 모델링이 아닌 호스팅 아키텍처 관점에서 다룹니다.
