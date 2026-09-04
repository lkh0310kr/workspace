import { useId, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { interactionCoordinator } from "../interaction/InteractionCoordinator";

export type ContextMenuItem =
  | { type: "separator" }
  | {
      type: "button";
      label: string;
      icon?: string;
      active?: boolean;
      disabled?: boolean;
      onClick: () => void;
    }
  | {
      type: "submenu";
      label: string;
      items: ContextMenuItem[];
    };

interface Props {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

function clampPosition(x: number, y: number, width: number, height: number) {
  const margin = 4;
  return {
    left: Math.min(Math.max(x, margin), window.innerWidth - width - margin),
    top: Math.min(Math.max(y, margin), window.innerHeight - height - margin),
  };
}

function ContextMenuPanel({
  items,
  style,
  onClose,
  flyout = false,
}: {
  items: ContextMenuItem[];
  style?: CSSProperties;
  onClose: () => void;
  flyout?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [openSubmenu, setOpenSubmenu] = useState<number | null>(null);
  const [flipLeft, setFlipLeft] = useState(false);
  const [position, setPosition] = useState(style ?? {});

  useLayoutEffect(() => {
    if (flyout || !panelRef.current || style?.left === undefined || style?.top === undefined) return;
    const rect = panelRef.current.getBoundingClientRect();
    setPosition(clampPosition(style.left as number, style.top as number, rect.width, rect.height));
  }, [flyout, style?.left, style?.top]);

  useLayoutEffect(() => {
    if (!flyout || !panelRef.current) return;
    const rect = panelRef.current.getBoundingClientRect();
    setFlipLeft(rect.right > window.innerWidth - 4);
  }, [flyout, items, openSubmenu]);

  const runButton = (item: Extract<ContextMenuItem, { type: "button" }>) => {
    if (item.disabled) return;
    item.onClick();
    onClose();
  };

  return (
    <div
      ref={panelRef}
      className={`context-menu${flyout ? " context-menu-flyout" : ""}${flipLeft ? " context-menu-flyout-left" : ""}`}
      style={flyout ? style : position}
      onClick={(e) => e.stopPropagation()}
    >
      {items.map((item, index) => {
        if (item.type === "separator") {
          return <div key={index} className="context-menu-sep" />;
        }

        if (item.type === "button") {
          return (
            <button
              key={index}
              type="button"
              className={`context-menu-item${item.active ? " active" : ""}`}
              disabled={item.disabled}
              onClick={() => runButton(item)}
            >
              {item.icon ? <span className="context-menu-icon">{item.icon}</span> : null}
              <span className="context-menu-label">{item.label}</span>
            </button>
          );
        }

        const open = openSubmenu === index;
        return (
          <div
            key={index}
            data-submenu-index={index}
            className="context-menu-submenu-row"
            onMouseEnter={() => setOpenSubmenu(index)}
            onMouseLeave={(e) => {
              const related = e.relatedTarget as Node | null;
              if (!e.currentTarget.contains(related)) setOpenSubmenu(null);
            }}
          >
            <div className={`context-menu-item context-menu-submenu-trigger${open ? " open" : ""}`}>
              <span className="context-menu-label">{item.label}</span>
              <span className="context-menu-chevron">›</span>
            </div>
            {open ? (
              <ContextMenuPanel
                items={item.items}
                onClose={onClose}
                flyout
                style={{ left: "100%", top: 0 }}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function ContextMenu({ x, y, items, onClose }: Props) {
  const portalId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  // Why: callers routinely pass an inline `() => setX(null)` onClose, a new
  // identity every render. registerPortal's cleanup+re-register on identity
  // change calls interactionCoordinator.reconcile(), which notifies every
  // subscriber (e.g. usePaneVisibility) and forces a re-render — feeding
  // right back into a new onClose identity. A ref keeps every effect below
  // mount-stable regardless of the caller's callback stability (STA "Maximum
  // update depth exceeded" on TreeView right-click).
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useLayoutEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  useLayoutEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return;
      onCloseRef.current();
    };
    const timer = window.setTimeout(() => {
      document.addEventListener("pointerdown", onPointerDown, true);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, []);

  useLayoutEffect(() => {
    return interactionCoordinator.registerPortal(portalId, () => onCloseRef.current());
  }, [portalId]);

  return createPortal(
    <div ref={rootRef}>
      <ContextMenuPanel items={items} style={{ left: x, top: y }} onClose={onClose} />
    </div>,
    document.body,
  );
}
