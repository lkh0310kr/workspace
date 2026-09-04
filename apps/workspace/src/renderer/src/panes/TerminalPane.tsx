import { memo, useEffect, useRef, useState } from "react";
import type { SearchAddon } from "@xterm/addon-search";
import "@xterm/xterm/css/xterm.css";
import "../assets/terminal-xterm-overrides.css";
import { getCurrentResolvedTheme, subscribeThemeChange } from "../theme";
import { XTERM_THEMES } from "../terminalThemes";
import { TerminalSearch, useTerminalSearchThemeKey } from "../components/TerminalSearch";
import { createPaneDOM } from "../lib/pane-manager/pane-dom-creation";
import { buildTerminalPaneOptions } from "../lib/pane-manager/build-terminal-pane-options";
import { disposePane, openTerminal } from "../lib/pane-manager/pane-lifecycle";
import type { ManagedPaneInternal } from "../lib/pane-manager/pane-manager-types";
import {
  registerTerminalPane,
  unregisterTerminalPane,
} from "../lib/pane-manager/pane-terminal-registry";
import { refitPaneTerminal } from "../lib/pane-manager/pane-terminal-refit";
import { resumePaneRendering, suspendPaneRendering } from "../lib/pane-manager/pane-rendering-control";
import { resolveExplicitTerminalTitleAgentType } from "../../../shared/agent/terminal-title-agent-type";
import type { TuiAgent } from "../../../shared/agent/tui-agent";
import { shouldFocusTerminalFromPanePointerDown } from "../lib/pane-manager/pane-pointer-focus";
import { focusTerminalTextarea } from "../lib/focus-terminal-textarea";
import { connectPanePty } from "../terminal/connectPanePty";
import { installTerminalKeyHandler } from "../terminal/installTerminalKeyHandler";
import { installTerminalPasteHandler } from "../terminal/installTerminalPasteHandler";
import { copyTerminalSelection } from "../terminal/terminal-selection-copy";
import { termLog } from "../terminal/terminalDebugLog";
import { writeClipboardText } from "../electron";

interface Props {
  terminalId: number;
  rootPath?: string | null;
  visible: boolean;
  active: boolean;
  zoom?: number;
  terminalAgent?: TuiAgent;
  onTerminalTabUpdate?: (patch: { title?: string; terminalAgent?: TuiAgent | null }) => void;
}

const TERMINAL_BASE_FONT_SIZE = 14;

function applyTerminalSurfaceBackground(el: HTMLElement, resolved: ReturnType<typeof getCurrentResolvedTheme>) {
  const bg = XTERM_THEMES[resolved].background ?? "";
  el.style.setProperty("--terminal-surface-bg", bg);
}

function TerminalPaneInner({
  terminalId,
  rootPath,
  visible,
  active,
  zoom = 1,
  terminalAgent,
  onTerminalTabUpdate,
}: Props) {
  const shellRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const paneRef = useRef<ManagedPaneInternal | null>(null);
  const ptyDisposeRef = useRef<(() => void) | null>(null);
  const onTerminalTabUpdateRef = useRef(onTerminalTabUpdate);
  onTerminalTabUpdateRef.current = onTerminalTabUpdate;
  const terminalAgentRef = useRef(terminalAgent);
  terminalAgentRef.current = terminalAgent;
  const searchRef = useRef<SearchAddon | null>(null);
  const hasFocusRef = useRef(false);
  const wasShownRef = useRef(false);
  const searchThemeKey = useTerminalSearchThemeKey();
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const platformInfo = window.api.platformInfo.get();

    const pane = createPaneDOM(terminalId, `terminal-${terminalId}`, {
      terminalGpuAcceleration: "auto",
      linkOpenHint: () => "open in browser",
      onLinkClick: (_paneId, _event, uri) => {
        window.open(uri, "_blank");
      },
      terminalOptions: () => ({
        ...buildTerminalPaneOptions({
          rootPath,
          terminalAgent,
          zoom,
          osRelease: platformInfo.osRelease,
        }),
        theme: XTERM_THEMES[getCurrentResolvedTheme()],
      }),
    });

    host.appendChild(pane.container);
    openTerminal(pane);
    paneRef.current = pane;
    searchRef.current = pane.searchAddon;
    registerTerminalPane(terminalId, pane);

    const resolved = getCurrentResolvedTheme();
    if (shellRef.current) applyTerminalSurfaceBackground(shellRef.current, resolved);
    applyTerminalSurfaceBackground(host, resolved);

    const { dispose, transport } = connectPanePty(pane, terminalId, {
      onTitleChange: (title) => {
        const terminalAgent = resolveExplicitTerminalTitleAgentType(title);
        onTerminalTabUpdateRef.current?.({
          title,
          terminalAgent: terminalAgent ?? null,
        });
      },
    });
    ptyDisposeRef.current = dispose;

    const keyHandlerDispose = installTerminalKeyHandler({
      terminal: pane.terminal,
      transport,
      terminalId,
      getTerminalAgent: () => terminalAgentRef.current,
      isFocused: () => {
        const active = document.activeElement;
        const root = pane.terminal.element;
        return (
          active === pane.terminal.textarea ||
          (!!root && active instanceof Node && root.contains(active))
        );
      },
    });

    const pasteHandlerDispose = installTerminalPasteHandler({
      terminal: pane.terminal,
      container: pane.container,
      getTerminalAgent: () => terminalAgentRef.current,
      isFocused: () => {
        const active = document.activeElement;
        const root = pane.terminal.element;
        return (
          active === pane.terminal.textarea ||
          (!!root && active instanceof Node && root.contains(active))
        );
      },
    });

    const onFocusIn = () => {
      hasFocusRef.current = true;
      window.api.terminal.setFocused(terminalId);
      termLog(
        "terminal:focus",
        "focusin",
        {
          activeElement:
            document.activeElement === pane.terminal.textarea ? "textarea" : "child",
        },
        terminalId,
      );
    };
    const onFocusOut = (event: FocusEvent) => {
      const root = pane.terminal.element;
      const next = event.relatedTarget;
      if (next instanceof Node && root?.contains(next)) {
        return;
      }
      hasFocusRef.current = false;
      window.api.terminal.setFocused(null);
      termLog("terminal:focus", "focusout", {}, terminalId);
    };

    pane.container.addEventListener("focusin", onFocusIn);
    pane.container.addEventListener("focusout", onFocusOut);
    const onPointerDown = (event: PointerEvent) => {
      if (!shouldFocusTerminalFromPanePointerDown(event.target)) {
        return;
      }
      pane.terminal.focus();
    };
    pane.container.addEventListener("pointerdown", onPointerDown);

    const unsubscribeTheme = subscribeThemeChange((resolved) => {
      pane.terminal.options.theme = XTERM_THEMES[resolved];
      if (shellRef.current) applyTerminalSurfaceBackground(shellRef.current, resolved);
      const hostEl = hostRef.current;
      if (hostEl) applyTerminalSurfaceBackground(hostEl, resolved);
    });

    return () => {
      unsubscribeTheme();
      keyHandlerDispose();
      pasteHandlerDispose();
      window.api.terminal.setFocused(null);
      pane.container.removeEventListener("focusin", onFocusIn);
      pane.container.removeEventListener("focusout", onFocusOut);
      pane.container.removeEventListener("pointerdown", onPointerDown);
      ptyDisposeRef.current?.();
      ptyDisposeRef.current = null;
      unregisterTerminalPane(terminalId, pane);
      disposePane(pane);
      pane.container.remove();
      paneRef.current = null;
      searchRef.current = null;
    };
  }, [terminalId, rootPath]);

  useEffect(() => {
    const pane = paneRef.current;
    if (!pane) return;
    pane.terminal.options.fontSize = Math.round(TERMINAL_BASE_FONT_SIZE * zoom);
    refitPaneTerminal(pane);
  }, [zoom]);

  useEffect(() => {
    const shown = visible && active;
    const pane = paneRef.current;
    const host = hostRef.current;
    if (host) {
      host.style.pointerEvents = shown ? "auto" : "none";
    }
    if (!pane) return;

    if (!shown) {
      suspendPaneRendering(pane);
      return;
    }

    resumePaneRendering(pane);

    const refit = (): void => {
      refitPaneTerminal(pane);
    };

    const becameShown = shown && !wasShownRef.current;
    wasShownRef.current = shown;

    requestAnimationFrame(() => {
      refit();
      if (becameShown) {
        focusTerminalTextarea(pane.container);
        pane.terminal.focus();
      }
    });
    const timer = window.setTimeout(() => {
      refit();
      if (becameShown) {
        focusTerminalTextarea(pane.container);
        pane.terminal.focus();
      }
    }, 50);

    if (!host) {
      return () => {
        clearTimeout(timer);
      };
    }

    const ro = new ResizeObserver(() => {
      if (visible && active) refitPaneTerminal(pane);
    });
    ro.observe(host);

    return () => {
      clearTimeout(timer);
      ro.disconnect();
    };
  }, [visible, active, terminalId]);

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
