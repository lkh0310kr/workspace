# Interaction coordinator

Phase 1 stability layer: a single module owns overlay blocking, embed pointer-events, portal lifecycle, and focus handoff.

**Source:** `electron/src/renderer/src/interaction/InteractionCoordinator.ts`

**Singleton:** `interactionCoordinator`

## Problem it solves

Before centralization, multiple modules independently set `webview.style.pointerEvents`:

- `overlayBarrier` pushed `browserHideAll()` but **never restored** on pop (no subscribers to `subscribeOverlayBarrier`)
- `browserSyncPointerEvents` only ran on workspace tab switch
- `BrowserContent` set pointer-events per pane
- Orphan body portals blocked the entire app after workspace switch

Any missed restore path made the app feel “dead” until a coincidental tab switch.

## Architecture

```mermaid
flowchart TB
  subgraph inputs [State inputs]
    OB[overlay block stack]
    AT[activeWorkspaceTabId]
    PV[per-webview paneVisible]
    PR[portal registry]
  end
  IC[InteractionCoordinator.reconcile]
  inputs --> IC
  IC --> PE[webview pointer-events]
  IC --> FC[optional webview.focus]
  IC --> DBG[InteractionDebugPanel snapshot]
```

Every input change calls `reconcile(reason)` which applies the full policy in one pass.

## Overlay block stack

Wrapped by `electron/src/renderer/src/browser/overlayBarrier.ts`:

```typescript
pushOverlayBlock(source)  // e.g. 'splitter-drag', 'add-tab-picker', 'pane-tab-strip-drag'
popOverlayBlock(source)
```

| Source | Trigger location |
|--------|------------------|
| `splitter-drag` | `App.tsx` pointer handlers on `.flexlayout__splitter` |
| `add-tab-picker` | `PaneTabStrip.tsx` add-tab popover |
| `pane-tab-strip-drag` | `PaneTabStrip.tsx` flexlayout pane drag |

**Safety net:** capture-phase `mouseup` clears stuck blocks (`overlay-mouseup-safety`) when WebKit misses `dragend` over a native webview.

When `overlayStack.length > 0`, all webviews get `pointer-events: none` regardless of visibility.

## Webview pointer-events policy

Registered webviews (`registerWebview` / `unregisterWebview` from `BrowserContent`):

| Condition | `pointer-events` |
|-----------|------------------|
| Not active workspace tab | `none` |
| Overlay blocked | `none` |
| Pane not visible (`paneVisible === false`) | `none` |
| Active tab + not blocked + pane visible | `auto` |

Unregistered webviews (fallback DOM query) use active workspace tab + overlay only.

Visibility (`visibility: hidden`) is still set in `BrowserContent`; coordinator does not hide visually.

## Workspace tab activation

```typescript
interactionCoordinator.setActiveWorkspaceTab(tabId)
```

Called from:

- `WorkspaceTabRail.switchToTab` (optimistic, before IPC)
- `App.tsx` `useEffect([activeTabId])`

Moves focus off embeds before switching (`moveFocusFromEmbeds` → titlebar).

## Portal registry

```typescript
registerPortal(id, onDismiss) → unregister function
dismissAllPortals()
```

`dismissAllPortals` also removes legacy `.popover-catcher` nodes and dispatches `workspace:dismiss-portals` for components that still listen via `onWorkspaceDismissPortals`.

### Registered portals (current)

| Component | Registration |
|-----------|--------------|
| `Popover.tsx` | `useId()` on mount |
| `BrowserAddressBar.tsx` | suggestions dropdown when open |
| `TerminalSearch.tsx` | when search bar open |
| All `Popover` consumers | SettingsDialog, AppSettingsDialog, PanePicker, BrowserNavButton, SidebarQuickSwitchPopover, TextPrompt |

**Rule:** Any new `createPortal(..., document.body)` must register with the coordinator.

## Focus policy

- **Removed:** `BrowserContent` auto `webview.focus()` on every `visible` transition (stole focus from terminal/editor).
- **Added:** When pane becomes visible, coordinator focuses webview only if policy enables pointer-events on that guest.

## Debug panel

`electron/src/renderer/src/components/InteractionDebugPanel.tsx` — fixed bottom-right **IC** badge.

Shows: overlay count/sources, active workspace tab, webview count, portal ids, last reconcile reason.

If `overlayBlockCount > 0` stuck, badge highlights and offers **Clear overlay blocks**.

## Public API summary

| Method | Purpose |
|--------|---------|
| `pushOverlayBlock(source)` | Block embed interaction |
| `popOverlayBlock(source)` | Unblock + reconcile |
| `clearOverlayBlocks(reason?)` | Force clear stack |
| `isOverlayBlocked()` | Boolean |
| `setActiveWorkspaceTab(id)` | Workspace switch |
| `registerWebview(wv, { workspaceTabId, paneTabItemId })` | Track guest |
| `unregisterWebview(wv)` | Cleanup |
| `setBrowserPaneVisible(tabId, itemId, visible)` | Pane tab visibility |
| `registerPortal(id, dismiss)` | Portal lifecycle |
| `dismissAllPortals()` | Workspace switch / explicit dismiss |
| `getSnapshot()` | Debug state |
| `subscribe(listener)` | Debug panel updates |
| `reconcile(reason)` | Manual/full policy refresh |

## Adding a new overlay UI

1. `pushOverlayBlock('your-feature')` when overlay opens / drag starts
2. `popOverlayBlock('your-feature')` when it closes / drag ends
3. Do **not** call `browserHideAll()` directly
4. If using body portal, `registerPortal` or use `Popover`

## Related docs

- [03-workspace-and-layout.md](./03-workspace-and-layout.md)
- [06-browser-embeds.md](./06-browser-embeds.md)
- [07-future-phases.md](./07-future-phases.md)
