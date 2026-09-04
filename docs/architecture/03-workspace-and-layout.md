# Workspace & layout

## Workspace tab rail

UI: `apps/workspace/src/renderer/src/components/WorkspaceTabRail.tsx`

Switching calls `switchToTab(tabId)`:

1. `dismissWorkspacePortals()` — closes registered body portals
2. `interactionCoordinator.setActiveWorkspaceTab(tabId)` — pointer-events policy
3. IPC `workspace:select-tab` → main persists → `workspace:updated` → React re-render

All workspace tab `<Layout>` instances stay mounted in `App.tsx`. Only the active tab’s host is visible:

```tsx
// apps/workspace/src/renderer/src/App.tsx
className={`layout-host-item${active ? " layout-host-item--active" : ""}`}
style={{
  visibility: active ? "visible" : "hidden",
  pointerEvents: active ? "auto" : "none",
}}
```

CSS (`apps/workspace/src/renderer/src/assets/styles.css`):

- `.layout-host` — `position: relative` container
- `.layout-host-item` — `position: absolute; inset: 0; z-index: 0`
- `.layout-host-item--active` — `z-index: 1`

**Do not** use `display: none` on workspace tab hosts — it conflicts with webview compositing (see [06-browser-embeds.md](./06-browser-embeds.md)).

## flexlayout-react

- One `Model` per workspace tab in `App.tsx` `modelsRef: Map<number, Model>`
- Custom tab strip disabled globally; pane tabs use `PaneTabStrip`
- `tabEnableRenderOnDemand: false` — all flexlayout tab nodes stay rendered
- Layout mutations debounced 250ms → `workspace:set-tab-layout`

### Factory per workspace tab

`makeFactory(tabId)` passes:

- `workspaceTabId` → `PaneGroup`
- `visible={tabId === activeTabId && node.isVisible()}` — flexlayout node visibility + workspace tab

`makeOnAction(tabId)` / `makeOnModelChange(tabId)` operate on that tab’s model only.

`pendingRebalanceRef` is a **per-tab** `Map<number, string | null>` so concurrent drags in different workspace tabs do not overwrite each other.

### Layout ref map

`apps/workspace/src/renderer/src/layout/layoutRef.ts`:

- `instances: Map<number, ILayoutApi>` — one flexlayout `Layout` ref per workspace tab
- `setActiveLayoutTab(tabId)` — pane drag targets the active tab’s instance
- `redrawAllLayouts()` — window resize

Historical note: a single shared layout ref caused drag placeholder bugs when multiple layouts were mounted; fixed by keyed map.

## PaneGroup (pane-level tabs)

`apps/workspace/src/renderer/src/panes/PaneGroup.tsx`

Each flexlayout tab node holds `PaneGroupConfig`:

```typescript
{
  tabs: PaneTabItem[];      // terminal | browser | code | markdown
  activeTabId: string;
  zoom?: number;
}
```

### Local active tab state

`localActiveId` updates immediately on click; an effect writes to flexlayout model for persistence. Avoids full model round-trip before paint (reported laggy tab switches).

### Content mount strategy

Every pane tab’s content is rendered in a loop; inactive items:

```css
visibility: hidden;
pointer-events: none;
```

**Critical:** `visible && active` — workspace-tab `hidden` on ancestor does not cascade if child sets `visibility: visible` alone. Both flags are required.

### Pane kinds

| Kind | Component | Mount key |
|------|-----------|-----------|
| `terminal` | `TerminalPane` → `TerminalSurface` | `terminalId` |
| `browser` | `BrowserContent` | `tabId + item.id` |
| `code` / `markdown` | `EditorContent` | `item.id` |

## Layout actions

`apps/workspace/src/renderer/src/layout/layoutActions.ts` — add/close/move tabs in pane groups, add panes to tabsets.

`apps/workspace/src/renderer/src/layout/layoutActions.ts` generates stable pane node ids (`crypto.randomUUID()`) so TreeView state keys correctly per pane.

## Legacy layout migration

`App.tsx` `migrateLegacyTabNode` wraps old single-component tab nodes into one-tab `PaneGroupConfig` on load so older `workspace.json` files keep working.

## Drag & drop

| Drag type | Mechanism |
|-----------|-----------|
| Pane tab chip reorder | HTML5 DnD in `PaneTabStrip`, payload in `tabDrag.ts` module singleton |
| Pane split drag | flexlayout `moveTabWithDragAndDrop` via `startPaneDrag` |
| Tab chip drop outside strip | Window-level drop → `moveTabToNewPane` |

Overlay blocks during drag: `pushOverlayBlock('pane-tab-strip-drag')` — see [04-interaction-coordinator.md](./04-interaction-coordinator.md).

## Related docs

- [04-interaction-coordinator.md](./04-interaction-coordinator.md)
- [05-terminal-pipeline.md](./05-terminal-pipeline.md)
- [06-browser-embeds.md](./06-browser-embeds.md)
