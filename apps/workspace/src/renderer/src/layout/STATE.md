# Layout state ownership

This document is the source of truth for **who owns what** in the flexlayout
pane system. New code should follow these rules; refactors should converge
toward a single write API per concern.

## Per workspace tab (top-level rail tab)

| State | Owner today | Read from | Write through |
|-------|-------------|-----------|---------------|
| flexlayout `Model` instance | `workspaceLayoutModels.ts` (module `Map`) | `workspaceStore.getModel(tabId)` | `setLayoutModel` on hydrate; `persistLayout` on change |
| Saved layout JSON | main `Workspace` + `setSavedLayoutJson` cache | `TabInfo.layout_json` | `workspaceStore.persistLayout` (debounced) |
| Layout revision bump | `workspaceStore.layoutRevisions` | `useLayoutRevision(tabId)` | `bumpLayoutRevision` after structural tab/pane changes |

**Rule:** Do not call `useWorkspaceStore.getState()` from UI components for layout
mutations — use `layoutActions.ts` or `layoutSession.ts`.

## Per pane group (flexlayout tab node / `PaneGroup`)

| State | Owner today | Notes |
|-------|-------------|-------|
| Tab list + `activeTabId` in flexlayout config | `PaneGroupConfig` inside flexlayout JSON | **Persisted** — single source of truth (`layoutSession.ts`) |
| Focused tabset (split) | `workspaceStore.focusedPaneGroupTabSetByWorkspaceTab` | Set on pointer/focus in `PaneGroup` |

**Rule:** Pane chip activation writes only through `layoutSession.activatePaneTab` /
`layoutActions.setActiveTabInGroup` — not a parallel zustand copy.

## Per pane chip (browser, editor, terminal, …)

| Kind | Visibility / focus owner |
|------|--------------------------|
| Browser `<webview>` | **`BrowserContent` only** — registers with `InteractionCoordinator`, sets pane/chip visible, focus, zoom. `PaneGroup` must not duplicate coordinator calls. |
| Editor / viewer file tree | **`PaneGroup`** — one `WorkspaceExplorerSidebar` per pane group (below tab strip, beside content). Shown only when the active chip is explorer-capable. Expand/collapse state is persisted per pane group (`explorerStateKey`); active file highlight follows the editor tab without resetting expansion. |
| Editor | `EditorContent` + `activeEditorView` for global shortcuts |
| Terminal | `TerminalPane` + main-process `focusedTerminalId` for shell shortcuts |

## Workspace tab visibility (which rail tab is live)

| Source | Role |
|--------|------|
| `workspaceStore.activeTabId` | IPC-backed active tab |
| `optimisticWorkspaceTab` | Instant rail feedback before IPC returns |
| `InteractionCoordinator.activeWorkspaceTabId` | Browser embed policy input |

**Projection:** `workspaceScope.projectVisibleWorkspaceTabId()` merges the three.

**Rule:** Tab switches should go through `WorkspaceTabRail.switchToTab()` so
optimistic + store + coordinator stay aligned.

## Mutation entry points

- **Open/close/move pane tabs:** `layout/layoutActions.ts`
- **Flexlayout drag/drop policy:** `layoutMovePolicy.ts`, `layoutSplitPolicy.ts`
- **Persist after model change:** `useLayoutHostCallbacks.makeOnModelChange`
- **Empty layout guard:** `useEnsureDefaultTerminals` → `ensureTerminal` (default terminal pane)

## Do not

- Derive pane node ids from tab item ids (see `tabGroupNodeJson` comment in `layoutActions.ts`).
- Call `model.doAction(SET_ACTIVE_TABSET)` without bumping layout revision (stale split focus).
- Push browser visibility from both `PaneGroup` and `BrowserContent`.
