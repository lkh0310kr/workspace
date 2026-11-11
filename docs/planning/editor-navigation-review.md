# Editor navigation review

This review compares the current TreeView and Editor behavior with the user's reported scroll cancellation and requested editor breadcrumbs. VS Code and Zed are reference points for interaction outcomes; this document does not declare full feature parity as a product goal.

## Findings

| ID | Finding | Evidence in this repository | User-visible consequence | Priority |
|---|---|---|---|---|
| NAV-01 | Tree scroll restoration uses a raw pixel offset, not a visible-row anchor. | `TreeView.tsx` stores/restores `scrollTop`; projected rows change when branches load, expand, collapse, refresh, or selection triggers data loading. | Rows inserted or removed above the viewport can move the user's context; a shorter tree can clamp the old offset. This is consistent with the reported jump, but the exact reproduction and root cause have not been confirmed. | P1 |
| NAV-02 | Active-file synchronization updates selection/focus state but does not reveal the row. | `selectedPath` effect updates selection, anchor, and focused path; `scrollRowIntoView` is used by keyboard navigation. | Switching editor tabs or opening a file through another surface can leave the active item outside the visible tree or inside a collapsed branch. | P1 |
| NAV-03 | Directory reads have no latest-request or root-generation guard. | `loadDir` commits every completed result into the path-keyed branch map. | A slower old read can overwrite a newer refresh or data for a new root that uses the same relative path. This is a race candidate from code inspection, not a reproduced failure. | P1 |
| NAV-04 | The shared Editor has no file-path breadcrumb bar. | No breadcrumb component or path breadcrumb contract exists in `packages/editor`; Markdown has a heading outline, which is a different navigation surface. | Users cannot see or traverse the current file's workspace path from the editor header. | P1 |
| NAV-05 | The tree specification does not define scroll anchoring or cross-surface active-file reveal outcomes. | `packages/editor/docs/treeview/README.md` describes pixel scroll persistence and ancestor expansion before tree-originated opens, but has no acceptance case for list mutation or external activation. | Implementations can preserve a number while losing the visible context, or update selection without making it visible, and still appear to satisfy the current spec. | P1 |

## Reference behavior

| Capability | VS Code | Zed | Product implication |
|---|---|---|---|
| Path breadcrumbs | File path is shown above the editor; segments provide navigation, with sibling choices available from path segments. Symbol breadcrumbs are available when language support provides them. | Project path and syntax context are shown above the editor. | Define file path breadcrumbs as the first outcome. Symbol breadcrumbs should be a later extension gated by an actual symbol provider. |
| Active file in project tree | Explorer can reveal the active file and its location. | Project Panel auto-reveals the file active in the editor by default; the behavior has a setting. | Decide and specify active-file reveal separately from preserving the user's scroll during ordinary tree mutations. |
| Preview versus pinned tabs | Single click opens preview; editing or double-clicking promotes it to a persistent tab. | Single click or Space previews; editing/double-click promotes, and middle-click opens persistently. | Existing tree single/double activation is broadly aligned; no parity work is proposed here. |

Official references: [VS Code breadcrumbs](https://code.visualstudio.com/docs/editing/editingevolved), [VS Code interface and Explorer](https://code.visualstudio.com/docs/editing/getting-started/userinterface), [Zed Project Panel](https://zed.dev/docs/project-panel), [Zed settings](https://zed.dev/docs/reference/all-settings), [Zed Outline Panel](https://zed.dev/docs/outline-panel).

## Proposed result contract

These are proposals for product review, not claims about shipped behavior.

### Tree navigation

1. When tree contents change without an explicit navigation request, the same first visible row remains at the same viewport position when that row still exists. If it was removed, use the closest surviving row at its former position. Persist the anchor identity and its intra-row offset, not only a pixel offset.
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

- Whether active-file auto-reveal is always enabled or configurable. VS Code and Zed both make reveal behavior available; Zed documents it as enabled by default and configurable.
- Whether breadcrumbs belong to every file-backed surface (including image/PDF viewers) or text editors only. This review proposes all file-backed surfaces for consistent location context.
- Whether breadcrumb sibling menus include hidden/ignored entries and how they sort. Reuse the current workspace tree visibility and ordering rules unless product requirements choose otherwise.
- Whether the breadcrumb root is workspace name, workspace folder, or a shortened absolute path for single-file workspaces.

## Suggested implementation order

1. Add deterministic TreeView anchor preservation and stale-load invalidation; retain explicit reveal as a separate command.
2. Add active-file ancestor expansion and reveal with one navigation path shared by tab changes and external opens.
3. Add the shared path breadcrumb surface and host-provided path/sibling navigation contract.
4. Add UI-level regression scenarios for scrolling, root changes, active-file reveal, rename/move, keyboard access, and long paths.

Code was inspected, but the reported scroll bug was not reproduced in a running app during this review. No product code or automated tests were changed.
