import { memo, useEffect, useRef, useState } from "react";
import { getCurrentResolvedTheme, subscribeThemeChange } from "../theme";
import { TERMINAL_SCROLLBACK_ROWS, XTERM_THEMES } from "../terminalThemes";
import { TerminalSearch, useTerminalSearchThemeKey } from "../components/TerminalSearch";
import { SingleLeafPaneManager } from "../lib/pane-manager/single-leaf-pane-manager";
import { connectPanePty } from "../terminal/connectPanePty";
import { configureTerminalOutputBacklogCap } from "../lib/pane-manager/pane-terminal-output-scheduler";
import { ptyResize } from "../electron";

interface Props {
  terminalId: number;
  active: boolean;
  visible: boolean;
  zoom?: number;
}

const TERMINAL_BASE_FONT_SIZE = 14;

function TerminalSurfaceInner({ terminalId, active, visible, zoom = 1 }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const managerRef = useRef<SingleLeafPaneManager | null>(null);
  const ptyDisposeRef = useRef<(() => void) | null>(null);
  const searchRef = useRef<import("@xterm/addon-search").SearchAddon | null>(null);
  const hasFocusRef = useRef(false);
  const searchThemeKey = useTerminalSearchThemeKey();
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    configureTerminalOutputBacklogCap(TERMINAL_SCROLLBACK_ROWS);
    const host = hostRef.current;
    if (!host) return;

    const shouldSuspend = !visible || !active;
    const manager = new SingleLeafPaneManager(host, {
      terminalGpuAcceleration: "auto",
      initialRenderingSuspended: shouldSuspend,
      debugLabel: `terminal-${terminalId}`,
      linkOpenHint: () => "open in browser",
      onLinkClick: (_paneId, _event, uri) => {
        window.open(uri, "_blank");
      },
      terminalOptions: () => ({
        fontSize: Math.round(TERMINAL_BASE_FONT_SIZE * zoom),
        theme: XTERM_THEMES[getCurrentResolvedTheme()],
        scrollback: TERMINAL_SCROLLBACK_ROWS,
      }),
      onPaneCreated: (pane) => {
        searchRef.current = pane.searchAddon;
        const { dispose } = connectPanePty(pane, terminalId);
        ptyDisposeRef.current = dispose;
        pane.container.addEventListener("focusin", () => {
          hasFocusRef.current = true;
        });
        pane.container.addEventListener("focusout", () => {
          hasFocusRef.current = false;
        });
      },
    });

    manager.createInitialPane({ leafId: `terminal-${terminalId}`, focus: !shouldSuspend });
    managerRef.current = manager;
    if (shouldSuspend) {
      manager.setRenderingSuspended(true);
    }

    const unsubscribeTheme = subscribeThemeChange((resolved) => {
      const pane = manager.getPane();
      if (pane) pane.terminal.options.theme = XTERM_THEMES[resolved];
    });

    return () => {
      unsubscribeTheme();
      ptyDisposeRef.current?.();
      ptyDisposeRef.current = null;
      manager.destroy();
      managerRef.current = null;
      searchRef.current = null;
    };
  }, [terminalId]);

  useEffect(() => {
    const pane = managerRef.current?.getPane();
    if (!pane) return;
    pane.terminal.options.fontSize = Math.round(TERMINAL_BASE_FONT_SIZE * zoom);
    managerRef.current?.refit();
  }, [zoom]);

  useEffect(() => {
    const manager = managerRef.current;
    if (!manager) return;
    const show = visible && active;
    manager.setRenderingSuspended(!show);
    if (show) {
      const pane = manager.getPane();
      if (pane) {
        manager.refit();
        ptyResize(terminalId, pane.terminal.cols, pane.terminal.rows).catch(console.error);
        pane.terminal.focus();
      }
    }
  }, [visible, active, terminalId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const pane = managerRef.current?.getPane();
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
        if (!hasFocusRef.current && !searchOpen) return;
        e.preventDefault();
        if (searchOpen) {
          setSearchOpen(false);
          pane?.terminal.focus();
        } else {
          setSearchOpen(true);
        }
      } else if (e.key === "Escape" && searchOpen) {
        setSearchOpen(false);
        pane?.terminal.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [searchOpen]);

  const closeSearch = () => {
    setSearchOpen(false);
    managerRef.current?.getPane()?.terminal.focus();
  };

  return (
    <div className="terminal-pane-shell">
      <TerminalSearch
        isOpen={searchOpen}
        onClose={closeSearch}
        searchAddonRef={searchRef}
        themeKey={searchThemeKey}
      />
      <div className="terminal-pane-host pane-manager-root" ref={hostRef} />
    </div>
  );
}

export const TerminalSurface = memo(TerminalSurfaceInner);
