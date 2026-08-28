# Context modeling philosophy (reference, not a spec)

**Status:** Philosophy/reference only, adapted from a pasted essay — not
transcribed as-is. Filtered against what this codebase actually is (a
lightweight Electron pane/tab shell, not a knowledge-graph platform) and
mapped onto concrete existing code and the Phase 1 module list in
[`ROADMAP.md`](../ROADMAP.md). Sections below are split into what's
actually relevant to decide now vs. what's explicitly premature — the
point of this doc is to not accidentally build something incompatible
with the philosophy later, not to implement all of it now.

## The one sentence

> Domain owns meaning. Workspace owns context. Agent connects them.

This isn't new — it's the exact principle already recorded in
[`ideation.md`](../ideation.md)'s fork/embed section: don't merge a
forked app's internal Shape/Mesh/Scene/Process model into a shared
"Universal Object", keep the app's own engine intact, and let Workspace
provide only the infra layer around it (File System, Project, Asset,
Clipboard, Command Bus, Shortcut Registry — Phase 1's list). What this
essay adds is a more precise vocabulary for *what Workspace's half
actually contains* — which turns out to matter once Phase 2 has more
than one forked app open at once and something needs to reference "that
shape in Penpot" or "that scene in Godot" without Workspace pretending
to understand what a Shape or a Scene *is*.

## Why this matters for the actual plan, not just abstractly

Phase 2 (2D/3D/Video/Engineering, fork real engines per
[`ROADMAP.md`](../ROADMAP.md)) already commits to "Domain owns meaning."
The "Workspace owns context" half is *not* decided yet — what does
Workspace track about a Penpot shape or a Godot scene that lets it do
anything useful (cross-pane copy/paste, an agent referencing "that
object", search across open panes) without reaching into Penpot's or
Godot's internals? The concepts below are one concrete answer, filtered
to what's cheap to adopt now vs. what's real infrastructure to build
only once there's a second forked app that actually needs it.

## Concepts worth adopting now

### Entity — the minimum shape for "something a Domain app has that Workspace might reference"

```ts
interface Entity {
  id: string;      // namespaced, e.g. "penpot:shape:183" — self-describing, never collides across domains
  type: string;     // owned by the domain, Workspace doesn't interpret it
  metadata?: Record<string, unknown>;
  provenance?: Provenance; // see below
}
```

`PaneTabItem` (`layout/paneTypes.ts`) is already a lightweight Entity —
scoped to "a tab," not to objects *inside* a forked app (one shape inside
Penpot, one mesh inside Godot). If a forked-app pane ever needs to
expose its internal objects to Workspace (cross-app copy/paste, an agent
referencing a specific object), this is the right minimum contract —
**not** a bigger shared type per domain. This is also the shape Phase
1's planned **Asset system** should probably just *be*, rather than
inventing a separate ad-hoc one.

### Resource — data that's genuinely domain-agnostic

Images, fonts, audio, video, binary blobs — not owned by whichever pane
imported them first. This is exactly Phase 1's already-planned Asset
system; this section doesn't add anything new, it just confirms the
shape is right (id/type/name/source/metadata, not per-pane-kind
duplication of "how do I load a PNG").

### Capability over Universal Type

Already how `PaneKindDefinition` works today
(`panes/paneKindRegistry.ts`): `hasFileExplorer`, `pickerEntries`,
`createItem`, `render` — a pane kind declares what it *can do*, and
nothing in the registry needs to know what a "vector" or "browser" kind
*is* internally. This philosophy's contribution is validating that the
same pattern should extend to **actions**, not just rendering — which is
exactly what Phase 1's planned **Command Bus** already is
(`db.query.run`, `packet.filter.apply` register into one registry
instead of Workspace needing to know what those commands do).

### Integration through protocols, not shared internals

Restates `ideation.md`'s fork/embed principle (`third-party/<app>`
untouched, `integrations/<app>` adapters, no merged Document Model) with
one addition: the *mechanism* for cross-app interaction should always be
a defined contract (Clipboard MIME conventions, Command Bus, Asset
references) — never one forked app's internals calling into another's.
Confirms Phase 1's Clipboard protocol and Command Bus items are load-
bearing, not a nice-to-have.

### Provenance — cheap now, expensive to retrofit

```ts
interface Provenance {
  source: "user" | "agent" | "imported" | "generated";
  createdBy?: string; // agent id, import path, etc.
  timestamp?: number;
}
```

Not yet part of any plan, but worth baking into the Asset/Entity schema
*from day one* even before anything else in this doc gets built —
retrofitting a source-tracking field onto existing data later is real
migration work; adding it to a schema that doesn't exist yet is free.
Directly relevant to this specific app: it's edited by both a human and
an AI agent (this very session), so "did a person write this, or did
Claude generate it" is a real, near-term distinction — not a speculative
one the way a full Relation graph (below) currently is.

### Agent boundary — relevant now, not speculative

> Agent reads Context, acts only through Capability, never reaches into
> Domain internals directly.

Worth stating explicitly for this app's own still-open **MCP / agent
orchestration** item (`ROADMAP.md`'s History section). Concretely: if
this app ever exposes its state to an MCP server, or lets an agent act
on open panes programmatically, the interface should be
Capability-shaped (open/read/write/search per pane kind — the same
contract `PaneKindDefinition` already gives human interaction) — not "an
agent gets a raw handle to whatever file happens to be open."

## Concepts to explicitly not build now

Recorded so they aren't lost, and so nothing gets accidentally built
incompatibly with them later — but none of these have a concrete need
yet, and this project's own standing convention (`paneKindRegistry.ts`
itself, extracted only after 6 pane kinds existed) is to build shared
abstractions after a second real consumer needs them, not speculatively:

- **Relation graph** (typed Entity↔Entity relations with confidence/
  provenance) — real knowledge-graph infrastructure. Nothing in this app
  currently produces enough cross-domain entities to relate. Revisit
  only once Entity/Asset has real usage across 2+ forked apps.
- **Knowledge layer** (embeddings + graph + full-text + structured data,
  side by side) — this app already has full-text search (`fs:search`
  IPC) and no vector/graph layer; adding those without a concrete need
  is exactly the premature-abstraction pattern this project avoids
  elsewhere.
- **Contextual Truth** (Fact vs. Interpretation vs. Inference vs.
  Generation as a formal taxonomy) — real epistemological rigor, but no
  current feature needs to distinguish these formally. `Provenance.source`
  above covers the one distinction that's actually near-term relevant
  (user vs. agent).
- **Lifecycle state machine** (Discovered→Loaded→Active→Idle→Suspended→
  Released) as a general Resource concept — this app already has an
  informal version for panes (hide/show, the cold-park idea in the old
  Phase 3 backlog), but formalizing it generally is premature until a
  second real resource-heavy consumer exists (a forked 3D/CAD engine is
  the obvious future candidate, once one is actually running).
- **Security boundary / per-Capability permissions** — a real concern
  once Agent/MCP work starts for real (this app is currently
  single-user, everything already runs with the user's own permissions).

## Adapted architecture sketch

The original essay's diagram spans domains this app isn't targeting
(Research/Office). Narrowed to this app's actual Phase 2 scope:

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

## Related docs

- [ideation.md](../ideation.md) — the fork/embed principles this doc
  generalizes, and the four-category Phase 2 target list
- [ROADMAP.md](../ROADMAP.md) — Phase 1's module list (Asset, Clipboard,
  Command Bus, Shortcut Registry) this doc's Entity/Resource/Capability
  shapes should inform when those actually get built
- [09-future-native-architecture.md](./09-future-native-architecture.md)
  — the "Application Isolation" / out-of-process direction for heavy
  forked engines, same "don't merge internals" principle from a
  hosting-architecture angle instead of a data-modeling one
