import { useEffect, useRef, useState, type KeyboardEvent } from "react";

export interface EditorBreadcrumbEntry {
  name: string;
  path: string;
  kind: "directory" | "code" | "markdown" | "viewer";
}

export interface EditorBreadcrumbsProps {
  path: string | null;
  onLoadChildren: (directoryPath: string) => Promise<EditorBreadcrumbEntry[]>;
  onOpenFile: (path: string, kind: "code" | "markdown" | "viewer") => void;
}

function parentPath(path: string): string {
  const index = path.lastIndexOf("/");
  return index < 0 ? "" : path.slice(0, index);
}

/** Workspace-relative file location with sibling menus for each path segment. */
export function EditorBreadcrumbs({ path, onLoadChildren, onOpenFile }: EditorBreadcrumbsProps) {
  const [menu, setMenu] = useState<{ anchorPath: string; directoryPath: string; entries: EditorBreadcrumbEntry[]; loading: boolean } | null>(null);
  const rootRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const segments = path?.split("/").filter(Boolean) ?? [];

  useEffect(() => setMenu(null), [path]);
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setMenu(null);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, []);
  useEffect(() => {
    if (!menu || menu.loading) return;
    rootRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [menu]);

  const openMenu = async (anchorPath: string, directoryPath: string) => {
    setMenu({ anchorPath, directoryPath, entries: [], loading: true });
    try {
      const entries = await onLoadChildren(directoryPath);
      setMenu((current) => current?.anchorPath === anchorPath && current.directoryPath === directoryPath ? { anchorPath, directoryPath, entries, loading: false } : current);
    } catch {
      setMenu((current) => current?.anchorPath === anchorPath && current.directoryPath === directoryPath ? { anchorPath, directoryPath, entries: [], loading: false } : current);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      setMenu(null);
      triggerRef.current?.focus();
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const items = [...(rootRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    if (items.length === 0) return;
    event.preventDefault();
    const currentIndex = items.indexOf(document.activeElement as HTMLElement);
    const nextIndex = event.key === "Home" ? 0
      : event.key === "End" ? items.length - 1
        : event.key === "ArrowDown" ? (currentIndex + 1) % items.length
          : (currentIndex <= 0 ? items.length - 1 : currentIndex - 1);
    items[nextIndex].focus();
  };

  if (!path || segments.length === 0) return null;
  let currentPath = "";
  const crumbs = segments.map((name, index) => {
    currentPath = currentPath ? `${currentPath}/${name}` : name;
    return { name, path: currentPath, directoryPath: parentPath(currentPath), isCurrent: index === segments.length - 1 };
  });

  return (
    <nav ref={rootRef} className="editor-breadcrumbs" aria-label="File location" onKeyDown={handleKeyDown}>
      <span className="editor-breadcrumb-root">Workspace</span>
      {crumbs.map((crumb) => (
        <span className="editor-breadcrumb-slot" key={crumb.path}>
          <span className="editor-breadcrumb-separator" aria-hidden="true">/</span>
          <button
            type="button"
            className="editor-breadcrumb-segment"
            aria-current={crumb.isCurrent ? "page" : undefined}
            aria-haspopup="menu"
            aria-expanded={menu?.anchorPath === crumb.path}
            title={crumb.path}
            onClick={(event) => {
              triggerRef.current = event.currentTarget;
              void openMenu(crumb.path, crumb.directoryPath);
            }}
          >{crumb.name}</button>
          {menu?.anchorPath === crumb.path && (
            <div className="editor-breadcrumb-menu" role="menu" aria-label={`Items in ${menu.directoryPath || "workspace"}`}>
              {menu.directoryPath !== crumb.directoryPath && <button type="button" role="menuitem" className="editor-breadcrumb-option" onClick={() => void openMenu(crumb.path, crumb.directoryPath)}>← Back</button>}
              {menu.loading ? <span className="editor-breadcrumb-empty" role="status">Loading…</span>
                : menu.entries.length === 0 ? <span className="editor-breadcrumb-empty">No sibling items</span>
                  : menu.entries.map((entry) => (
                    <button
                      type="button"
                      role="menuitem"
                      className={`editor-breadcrumb-option${entry.path === crumb.path ? " is-current" : ""}`}
                      key={entry.path}
                      title={entry.path}
                      onClick={() => {
                        if (entry.kind === "directory") void openMenu(crumb.path, entry.path);
                        else {
                          onOpenFile(entry.path, entry.kind);
                          setMenu(null);
                        }
                      }}
                    ><span aria-hidden="true">{entry.kind === "directory" ? "▸ " : ""}</span>{entry.name}</button>
                  ))}
            </div>
          )}
        </span>
      ))}
    </nav>
  );
}
