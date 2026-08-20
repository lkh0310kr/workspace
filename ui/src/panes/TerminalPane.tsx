import { memo, useEffect, useRef, useState } from "react";
import { Terminal, type ITheme } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { SerializeAddon } from "@xterm/addon-serialize";
import { SearchAddon } from "@xterm/addon-search";
import { WebglAddon } from "@xterm/addon-webgl";
import { openUrl } from "@tauri-apps/plugin-opener";
import "@xterm/xterm/css/xterm.css";
import { onPtyOutput, ptyResize, ptyWrite } from "../tauri";
import { getCurrentResolvedTheme, subscribeThemeChange, type ResolvedTheme } from "../theme";

interface Props {
  terminalId: number;
  active: boolean;
}

// xterm takes colors as JS options, not CSS — can't just point it at
// styles.css's custom properties. Mirrors the --bg-base/--text/--accent
// tokens there for each resolved theme.
const XTERM_THEMES: Record<ResolvedTheme, ITheme> = {
  dark: {
    background: "#0d0d0d",
    foreground: "#d4d4d4",
    cursor: "#d4d4d4",
    selectionBackground: "#1c2430",
  },
  light: {
    background: "#f7f7f7",
    foreground: "#1a1a1a",
    cursor: "#1a1a1a",
    selectionBackground: "#dbe6f5",
  },
};

// The PTY session outlives the React component (it's only killed when its
// workspace tab is closed, not on unmount — e.g. switching workspace tabs
// remounts every pane). xterm's own buffer doesn't survive that remount, so
// stash a serialized snapshot here and replay it before live output resumes,
// otherwise scrollback visually resets to blank on every tab switch.
const scrollbackCache = new Map<number, string>();

// Best-effort addon loading: none of these are essential to a working
// terminal, so one failing (unsupported API, odd webview environment) must
// not take the whole pane down with it.
function loadOptionalAddons(term: Terminal): SerializeAddon | null {
  let serialize: SerializeAddon | null = null;
  try {
    serialize = new SerializeAddon();
    term.loadAddon(serialize);
  } catch (err) {
    console.error("terminal: serialize addon failed to load", err);
    serialize = null;
  }
  try {
    term.loadAddon(new Unicode11Addon());
    term.unicode.activeVersion = "11";
  } catch (err) {
    console.error("terminal: unicode11 addon failed to load", err);
  }
  try {
    term.loadAddon(
      new WebLinksAddon((_event, uri) => {
        openUrl(uri).catch(console.error);
      }),
    );
  } catch (err) {
    console.error("terminal: web-links addon failed to load", err);
  }
  // GPU-accelerated rendering. `crates/terminal-gpu` is a prior, explicitly
  // "archived" attempt at a from-scratch native wgpu renderer — reviving it
  // means owning font-atlas rendering, grid diffing, and a native-surface
  // embed into the Tauri window from scratch (the same category of open-
  // ended native-embedding project that the CEF windowed-pane work turned
  // out to be — see cef_host.rs). xterm.js's own maintained WebGL addon
  // gets the actual goal (GPU-accelerated terminal rendering) with none of
  // that risk, so that's what's wired in here instead.
  try {
    const webgl = new WebglAddon();
    // WebGL contexts can be lost (GPU driver reset, OS resource pressure,
    // tab backgrounding on some platforms) — xterm's own docs call out
    // disposing the addon on loss so it falls back to the default
    // (canvas/DOM) renderer rather than leaving the terminal stuck blank.
    webgl.onContextLoss(() => {
      webgl.dispose();
    });
    term.loadAddon(webgl);
  } catch (err) {
    console.error("terminal: webgl addon failed to load, using default renderer", err);
  }
  return serialize;
}

function TerminalPaneInner({ terminalId, active }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const searchRef = useRef<SearchAddon | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  // `active` (whether this pane's *workspace tab* is the visible one) is
  // hardcoded true for every terminal pane by its caller — no good for
  // scoping a keyboard shortcut when more than one terminal is open at
  // once (e.g. a split). Track real DOM focus instead, via `focusin`/
  // `focusout` bubbling up from xterm's internal hidden textarea.
  const hasFocusRef = useRef(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      theme: XTERM_THEMES[getCurrentResolvedTheme()],
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    const search = new SearchAddon();
    term.loadAddon(search);
    term.open(host);
    const serialize = loadOptionalAddons(term);
    termRef.current = term;
    fitRef.current = fit;
    searchRef.current = search;

    const cached = scrollbackCache.get(terminalId);
    if (cached) term.write(cached);

    const syncSize = () => {
      fit.fit();
      ptyResize(terminalId, term.cols, term.rows).catch(console.error);
    };

    term.onData((data) => {
      const bytes = new TextEncoder().encode(data);
      ptyWrite(terminalId, bytes).catch(console.error);
    });

    syncSize();
    requestAnimationFrame(() => {
      syncSize();
      term.focus();
    });

    const resizeObserver = new ResizeObserver(() => syncSize());
    resizeObserver.observe(host);
    window.addEventListener("resize", syncSize);

    const focusTerm = () => term.focus();
    host.addEventListener("mousedown", focusTerm);

    const onFocusIn = () => {
      hasFocusRef.current = true;
    };
    const onFocusOut = () => {
      hasFocusRef.current = false;
    };
    host.addEventListener("focusin", onFocusIn);
    host.addEventListener("focusout", onFocusOut);

    const unsubscribeTheme = subscribeThemeChange((resolved) => {
      term.options.theme = XTERM_THEMES[resolved];
    });

    return () => {
      host.removeEventListener("focusin", onFocusIn);
      host.removeEventListener("focusout", onFocusOut);
      if (serialize) {
        try {
          scrollbackCache.set(terminalId, serialize.serialize());
        } catch (err) {
          console.error("terminal: failed to serialize scrollback", err);
        }
      }
      unsubscribeTheme();
      host.removeEventListener("mousedown", focusTerm);
      window.removeEventListener("resize", syncSize);
      resizeObserver.disconnect();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
      searchRef.current = null;
    };
  }, [terminalId]);

  useEffect(() => {
    const unlisten = onPtyOutput((payload) => {
      if (payload.id !== terminalId || !termRef.current) return;
      const binary = atob(payload.data_b64);
      const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
      termRef.current.write(bytes);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [terminalId]);

  useEffect(() => {
    if (active && fitRef.current && termRef.current) {
      fitRef.current.fit();
      ptyResize(terminalId, termRef.current.cols, termRef.current.rows).catch(console.error);
      termRef.current.focus();
    }
  }, [active, terminalId]);

  // Only the terminal pane that actually has focus should react to Cmd+F
  // — every terminal pane has its own listener, so this must check real
  // DOM focus rather than `active` (hardcoded true for every instance by
  // the caller). Once the search bar is open, its own input steals DOM
  // focus away from the terminal itself, so `searchOpen` alone keeps this
  // instance responding to a second Cmd+F (toggle closed) or Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
        if (!hasFocusRef.current && !searchOpen) return;
        e.preventDefault();
        if (searchOpen) {
          setSearchOpen(false);
          termRef.current?.focus();
        } else {
          setSearchOpen(true);
        }
      } else if (e.key === "Escape" && searchOpen) {
        setSearchOpen(false);
        termRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [searchOpen]);

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  return (
    <div className="terminal-pane-shell">
      {searchOpen && (
        <div className="terminal-search-bar">
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (e.shiftKey) searchRef.current?.findPrevious(searchQuery);
                else searchRef.current?.findNext(searchQuery);
              }
            }}
          />
          <button type="button" onClick={() => searchRef.current?.findPrevious(searchQuery)}>
            ↑
          </button>
          <button type="button" onClick={() => searchRef.current?.findNext(searchQuery)}>
            ↓
          </button>
          <button
            type="button"
            onClick={() => {
              setSearchOpen(false);
              termRef.current?.focus();
            }}
          >
            ✕
          </button>
        </div>
      )}
      <div
        className="terminal-host"
        ref={hostRef}
        tabIndex={0}
        onFocus={() => termRef.current?.focus()}
      />
    </div>
  );
}

export const TerminalPane = memo(TerminalPaneInner);
