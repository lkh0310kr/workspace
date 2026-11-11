# Editor breadcrumb

`EditorBreadcrumbs` renders the active file's workspace-relative path above the editor surface. The host supplies the path, lazy directory listing, and file-open callback; the shared component owns path labels, segment menus, keyboard dismissal, and sibling selection.

## Visible result

- A `Workspace` root label and one segment for every non-empty path component are shown for a file-backed editor.
- Untitled documents (`path === null`) show no breadcrumb.
- Long segments truncate visually and retain their complete path in the accessible title.
- Activating a segment opens a menu of siblings in that segment's parent directory. Selecting a file calls the existing host file router with its code, Markdown, or viewer kind.
- Selecting a directory browses that directory's children in the same menu. Escape dismisses the menu; changing active path also closes it.
- Breadcrumbs are path-only. Markdown headings remain in the separate outline control; symbol breadcrumbs require a symbol provider and are not part of this contract.

## Ownership and API

`packages/editor/src/EditorBreadcrumbs.tsx` exports `EditorBreadcrumbs`, `EditorBreadcrumbEntry`, and `EditorBreadcrumbsProps` from the package root. `path` is provider-relative. `onLoadChildren(directoryPath)` returns entries with `name`, `path`, and `kind`; `directory` entries are browsable and file kinds are `code`, `markdown`, or `viewer`. `onOpenFile(path, kind)` delegates routing to the host.

The Desktop host resolves the parent directory through `EditorProvider`, lists its children, and maps provider `asset` to breadcrumb `viewer`. The shared component never imports a filesystem, Electron API, or provider implementation.

## Regeneration scenarios

| ID | Input/action | Required result |
|---|---|---|
| BREADCRUMB-01 | Open a file at `notes/ideas/today.md` | Workspace, notes, ideas, today.md appear in order |
| BREADCRUMB-02 | Open an untitled Markdown document | No path breadcrumb is rendered |
| BREADCRUMB-03 | Activate `ideas` | A sibling menu for `notes` appears; current item is identifiable |
| BREADCRUMB-04 | Choose another file from a segment menu | Host opens it with its file kind; active path updates and menu closes |
| BREADCRUMB-05 | Choose a directory from the menu, then Escape | Its children appear in the same menu; Escape closes it |
| BREADCRUMB-06 | Activate a path segment with keyboard | Menu receives focus; Up/Down/Home/End move among items, Escape closes and returns focus to the segment, outside click dismisses |

Current presentation styles are in `packages/editor/src/tree.css`; Desktop placement is in `apps/workspace-app/src/renderer/src/panes/EditorContent.tsx`.
