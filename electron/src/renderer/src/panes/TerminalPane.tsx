import { memo, useEffect, useRef, useState } from "react";
import type { SearchAddon } from "@xterm/addon-search";
import "@xterm/xterm/css/xterm.css";
import "../assets/terminal-xterm-overrides.css";
import { getCurrentResolvedTheme, subscribeThemeChange } from "../theme";
import { XTERM_THEMES } from "../terminalThemes";
import { TerminalSearch, useTerminalSearchThemeKey } from "../components/TerminalSearch";
import { createPaneDOM } from "../lib/pane-manager/pane-dom-creation";
import { disposePane, openTerminal } from "../lib/pane-manager/pane-lifecycle";
import type { ManagedPaneInternal } from "../lib/pane-manager/pane-manager-types";
import { refitPaneTerminal } from "../lib/pane-manager/pane-terminal-refit";
import { connectPanePty } from "../terminal/connectPanePty";
import { installTerminalKeyHandler } from "../terminal/installTerminalKeyHandler";
import { copyTerminalSelection } from "../terminal/terminal-selection-copy";
import { writeClipboardText } from "../electron";

interface Props {
  terminalId: number;
  visible: boolean;
  active: boolean;
  zoom?: number;
}

const TERMINAL_BASE_FONT_SIZE = 14;
const PANE_ID = 1;

function applyTerminalSurfaceBackground(el: HTMLElement, resolved: ReturnType<typeof getCurrentResolvedTheme>) {
  const bg = XTERM_THEMES[resolved].background ?? "";
  el.style.setProperty("--terminal-surface-bg", bg);
}

function TerminalPaneInner({ terminalId, visible, active, zoom = 1 }: Props) {
  const shellRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const paneRef = useRef<ManagedPaneInternal | null>(null);
  const ptyDisposeRef = useRef<(() => void) | null>(null);
  const searchRef = useRef<SearchAddon | null>(null);
  const hasFocusRef = useRef(false);
  const searchThemeKey = useTerminalSearchThemeKey();
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const pane = createPaneDOM(PANE_ID, `terminal-${terminalId}`, {
      terminalGpuAcceleration: "off",
      linkOpenHint: () => "open in browser",
      onLinkClick: (_paneId, _event, uri) => {
        window.open(uri, "_blank");
      },
      terminalOptions: () => ({
        fontSize: Math.round(TERMINAL_BASE_FONT_SIZE * zoom),
        theme: XTERM_THEMES[getCurrentResolvedTheme()],
      }),
    });

    host.appendChild(pane.container);
    openTerminal(pane);
    paneRef.current = pane;
    searchRef.current = pane.searchAddon;

    const resolved = getCurrentResolvedTheme();
    if (shellRef.current) applyTerminalSurfaceBackground(shellRef.current, resolved);
    applyTerminalSurfaceBackground(host, resolved);

    const { dispose } = connectPanePty(pane, terminalId);
    ptyDisposeRef.current = dispose;

    const keyHandlerDispose = installTerminalKeyHandler({
      terminal: pane.terminal,
      sendInput: (data) => pane.terminal.input(data),
      hasFocus: () => hasFocusRef.current,
    });

    const onFocusIn = () => {
      hasFocusRef.current = true;
    };
    const onFocusOut = () => {
      hasFocusRef.current = false;
    };
    pane.container.addEventListener("focusin", onFocusIn);
    pane.container.addEventListener("focusout", onFocusOut);

    const unsubscribeTheme = subscribeThemeChange((resolved) => {
      pane.terminal.options.theme = XTERM_THEMES[resolved];
      if (shellRef.current) applyTerminalSurfaceBackground(shellRef.current, resolved);
      const hostEl = hostRef.current;
      if (hostEl) applyTerminalSurfaceBackground(hostEl, resolved);
    });

    return () => {
      unsubscribeTheme();
      keyHandlerDispose();
      pane.container.removeEventListener("focusin", onFocusIn);
      pane.container.removeEventListener("focusout", onFocusOut);
      ptyDisposeRef.current?.();
      ptyDisposeRef.current = null;
      disposePane(pane);
      pane.container.remove();
      paneRef.current = null;
      searchRef.current = null;
    };
  }, [terminalId]);

  useEffect(() => {
    const pane = paneRef.current;
    if (!pane) return;
    pane.terminal.options.fontSize = Math.round(TERMINAL_BASE_FONT_SIZE * zoom);
    refitPaneTerminal(pane);
  }, [zoom]);

  useEffect(() => {
    if (!visible || !active) return;
    const pane = paneRef.current;
    if (!pane) return;
    requestAnimationFrame(() => {
      refitPaneTerminal(pane);
      pane.terminal.focus();
    });
  }, [visible, active]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const pane = paneRef.current;
      const term = pane?.terminal;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "c") {
        if (!hasFocusRef.current || !term?.hasSelection()) return;
        e.preventDefault();
        void copyTerminalSelection({ terminal: term, writeClipboardText });
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
        if (!hasFocusRef.current && !searchOpen) return;
        e.preventDefault();
        if (searchOpen) {
          setSearchOpen(false);
          term?.focus();
        } else {
          setSearchOpen(true);
        }
      } else if (e.key === "Escape" && searchOpen) {
        setSearchOpen(false);
        term?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [searchOpen]);

  return (
    <div className="terminal-pane-shell" ref={shellRef}>
      <TerminalSearch
        isOpen={searchOpen}
        onClose={() => {
          setSearchOpen(false);
          paneRef.current?.terminal.focus();
        }}
        searchAddonRef={searchRef}
        themeKey={searchThemeKey}
      />
      <div className="terminal-pane-host pane-manager-root" ref={hostRef} />
    </div>
  );
}

export const TerminalPane = memo(TerminalPaneInner);
