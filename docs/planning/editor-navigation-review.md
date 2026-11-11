# Editor navigation review

This review compares the TreeView and Editor behavior with the reported scroll cancellation and requested editor breadcrumbs. The navigation fixes and code/Markdown breadcrumb described below are implemented; image/document viewer breadcrumbs and configurable auto-reveal remain future scope. VS Code and Zed are reference points for interaction outcomes, not full feature parity targets.

## Findings

| ID | Finding | Evidence in this repository | User-visible consequence | Priority |
|---|---|---|---|---|
| NAV-01 | Tree scroll restoration previously used only a raw pixel offset and did not persist the visible row identity. | `TreeView.tsx` retains the first visible row path and intra-row offset across projection changes and saves them in pane-scoped explorer state. | The same visible row is restored after closing/reopening the panel or remounting the tree; row insertions/removals above it preserve its viewport position. If the anchor row is deleted, the nearest surviving row at its previous index is used. | Implemented |
| NAV-02 | Active-file synchronization previously updated selection without reveal. | The selected-path effect now expands ancestors and reveals the row after it enters the visible projection. | Tab switches and external file opens bring the active file into view. Tree-originated opening shares the same path. | Implemented |
| NAV-03 | Directory reads previously had no latest-request/root guard. | `loadDir` now checks per-branch sequence, workspace root, and provider identity before committing. | Slower stale responses cannot replace newer branch data or data from another provider/root. | Implemented |
| NAV-04 | The Editor had no file-path breadcrumb bar. | `packages/editor/src/EditorBreadcrumbs.tsx` is mounted by Desktop `EditorContent` for code and Markdown files; viewer panes are not yet integrated. | Users can inspect the workspace-relative path and open sibling files from a segment menu. | Implemented for code/Markdown |
| NAV-05 | The tree specification omitted scroll anchoring and active-file reveal outcomes. | The Treeview spec now records behavior and TREE-08–TREE-11 regeneration scenarios; `breadcrumbs.md` records BREADCRUMB-01–06. | Future implementations have explicit visible outcomes. | Implemented |

## Reference behavior

| Capability | VS Code | Zed | Product implication |
|---|---|---|---|
| Path breadcrumbs | File path is shown above the editor; segments provide navigation, with sibling choices available from path segments. Symbol breadcrumbs are available when language support provides them. | Project path and syntax context are shown above the editor. | Define file path breadcrumbs as the first outcome. Symbol breadcrumbs should be a later extension gated by an actual symbol provider. |
| Active file in project tree | Explorer can reveal the active file and its location. | Project Panel auto-reveals the file active in the editor by default; the behavior has a setting. | Decide and specify active-file reveal separately from preserving the user's scroll during ordinary tree mutations. |
| Preview versus pinned tabs | Single click opens preview; editing or double-clicking promotes it to a persistent tab. | Single click or Space previews; editing/double-click promotes, and middle-click opens persistently. | Existing tree single/double activation is broadly aligned; no parity work is proposed here. |

Official references: [VS Code breadcrumbs](https://code.visualstudio.com/docs/editing/editingevolved), [VS Code interface and Explorer](https://code.visualstudio.com/docs/editing/getting-started/userinterface), [Zed Project Panel](https://zed.dev/docs/project-panel), [Zed settings](https://zed.dev/docs/reference/all-settings), [Zed Outline Panel](https://zed.dev/docs/outline-panel).

## Proposed result contract

The following outcomes are implemented for the Desktop code/Markdown editor and TreeView. Viewer breadcrumbs and a user preference for auto-reveal are not included yet.

### Tree navigation

1. When tree contents change without an explicit navigation request, the same first visible row remains at the same viewport position when that row still exists. If it was removed, use the closest surviving row at its former position. Persist the anchor identity and its intra-row offset, not only a pixel offset. Hiding/showing or resizing the panel preserves the saved position.
2. Expanding/collapsing a branch, refreshing a folder, or loading children above the viewport must not send the viewport to the top or a different unrelated region.
3. When the active editor file changes through a tab switch, Quick Open, or another surface, expand its ancestors and reveal its row in the tree. If reveal is disabled by a future preference, update active state without moving the viewport. Tree-originated opening must not cause a second jump.
4. Stale directory responses must not replace newer data for the same branch or data belonging to a newer workspace root.
5. Selection, keyboard focus, active editor item, and visible scroll anchor are distinct state. Updating one must not implicitly reset the others except where an explicit navigation action requires it.

### Editor breadcrumbs

1. For a file-backed editor or viewer, show its workspace-relative path above the content surface. The workspace root is the leading context; separators and truncation must keep the current filename identifiable.
2. Activating a path segment offers navigation to sibling entries at that level; choosing an entry opens it using the existing file-kind routing. Folder navigation can reveal that folder in TreeView.
3. Rename, move, workspace-root changes, and tab switches update the breadcrumb from the active item's current identity/path. Unsaved untitled documents have no fabricated filesystem path.
4. Breadcrumbs are keyboard reachable and expose current item and menu semantics to assistive technology. Long paths have an accessible full-path name and a predictable overflow treatment.
5. Path breadcrumbs ship independently of symbol breadcrumbs. A later symbol trail may use Markdown headings or language symbols only when a provider can report stable ranges and labels.

## Review decisions to record before implementation

- Whether active-file auto-reveal should become configurable. It is currently always enabled; Zed documents a configurable setting.
- Whether breadcrumbs should extend to every file-backed surface (including image/PDF viewers). Current implementation covers code and Markdown editors.
- Whether breadcrumb sibling menus include hidden/ignored entries and how they sort. Reuse the current workspace tree visibility and ordering rules unless product requirements choose otherwise.
- Whether the breadcrumb root is workspace name, workspace folder, or a shortened absolute path for single-file workspaces.

## Implementation status

1. TreeView anchor preservation and stale-load invalidation — implemented.
2. Active-file ancestor expansion and reveal — implemented.
3. Shared path breadcrumbs with host-provided child listing and file routing — implemented for code/Markdown.
4. Automated UI regression scenarios for scrolling, root changes, active-file reveal, rename/move, keyboard access, and long paths — still needed.

The exact reported scroll reproduction was not captured in a running app before implementation. App typecheck passed after the changes; automated tests were not added or run.
