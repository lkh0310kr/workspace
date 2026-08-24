import { memo, useEffect, useRef, useState } from "react";
import { Terminal, type ITheme } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { SerializeAddon } from "@xterm/addon-serialize";
import { SearchAddon } from "@xterm/addon-search";
import "@xterm/xterm/css/xterm.css";
import { onPtyOutput, ptyResize, ptyWrite, writeClipboardText } from "../electron";
import { getCurrentResolvedTheme, subscribeThemeChange, type ResolvedTheme } from "../theme";

// Port of ui/src/panes/TerminalPane.tsx. Two things from the Tauri version
// are deliberately NOT carried over:
//   - The WKWebView-specific Hangul IME composition workaround (a large
//     block intercepting `input`/`keydown` to buffer and manually flush
//     composed text). It exists to route around a WKWebView-only IME event
//     ordering bug; Chromium's own IME event model is different, and the
//     Orca xterm.js patch (applied via patches/xterm.orca-upstream.patch)
//     is the intended fix path here instead — confirmed working via live
//     Korean typing before this port ("ㅇㅇ 잘된다 계속 진행해줘").
//   - OS-level drag-drop-to-terminal via getCurrentWebview().onDragDropEvent
//     (a Tauri-only API). Electron's <webview>/BrowserWindow drag-drop story
//     is different enough that it needs its own investigation, not a blind
//     port — left as a follow-up, not a silent regression.
interface Props {
  terminalId: number;
  active: boolean;
  zoom?: number;
}

const TERMINAL_BASE_FONT_SIZE = 13;

const XTERM_THEMES: Record<ResolvedTheme, ITheme> = {
  dark: {
    background: "#1e1e1e",
    foreground: "#d4d4d4",
    cursor: "#d4d4d4",
    selectionBackground: "#2b3a52",
  },
  light: {
    background: "#fbfbfa",
    foreground: "#1a1a1a",
    cursor: "#1a1a1a",
    selectionBackground: "#dde8f7",
    black: "#2e3436",
    red: "#cc0000",
    green: "#4e9a06",
    yellow: "#8e7700",
    blue: "#3465a4",
    magenta: "#75507b",
    cyan: "#05727e",
    white: "#6a6a6a",
    brightBlack: "#555753",
    brightRed: "#ef2929",
    brightGreen: "#1b7a1b",
    brightYellow: "#6d5a00",
    brightBlue: "#204a87",
    brightMagenta: "#ad7fa8",
    brightCyan: "#034b50",
    brightWhite: "#3d3d3d",
  },
};

// Same rationale as the Tauri version: the pty session outlives the React
// component (killed only when its workspace tab closes, not on unmount —
// e.g. switching workspace tabs remounts every pane), so a serialized
// snapshot is stashed here and replayed on remount.
const scrollbackCache = new Map<number, string>();

function loadOptionalAddons(term: Terminal): { serialize: SerializeAddon | null } {
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
        // Routed through the host window's setWindowOpenHandler (see
        // main/index.ts), which calls shell.openExternal — same effect as
        // Tauri's openUrl plugin call.
        window.open(uri, "_blank");
      }),
    );
  } catch (err) {
    console.error("terminal: web-links addon failed to load", err);
  }
  return { serialize };
}

function TerminalPaneInner({ terminalId, active, zoom = 1 }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const searchRef = useRef<SearchAddon | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const hasFocusRef = useRef(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: Math.round(TERMINAL_BASE_FONT_SIZE * zoom),
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, 'Apple SD Gothic Neo', monospace",
      theme: XTERM_THEMES[getCurrentResolvedTheme()],
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    const search = new SearchAddon();
    term.loadAddon(search);
    term.open(host);

    // tmux mouse mode (pty.ts's tmux.conf, `mouse on`) intercepts drag
    // entirely and does its own copy-mode selection instead of a normal
    // DOM text selection — on release it writes the selected text out via
    // an OSC 52 escape sequence, not anything the OS clipboard sees on its
    // own. xterm.js parses the sequence but has no clipboard access itself
    // (sandboxed renderer), so without this handler the drag looked live
    // (tmux's highlight appears) but nothing was ever copied. Reported as
    // "드래그하면 노란색으로 드래그되고... 텍스트 복사도 안되고".
    // Format is `52;<Pc>;<base64|?>` — `data` here is everything after
    // "52;". `?` is a clipboard *read* request, which is intentionally
    // left unhandled (returning false) rather than echoing real clipboard
    // contents back into the pty.
    const oscClipboard = term.parser.registerOscHandler(52, (data) => {
      const payload = data.slice(data.indexOf(";") + 1);
      if (payload === "?" || payload === "") return false;
      try {
        writeClipboardText(atob(payload));
        return true;
      } catch {
        return false;
      }
    });

    const { serialize } = loadOptionalAddons(term);
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
      if (serialize) {
        try {
          scrollbackCache.set(terminalId, serialize.serialize());
        } catch (err) {
          console.error("terminal: failed to serialize scrollback", err);
        }
      }
      unsubscribeTheme();
      oscClipboard.dispose();
      host.removeEventListener("focusin", onFocusIn);
      host.removeEventListener("focusout", onFocusOut);
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
    const term = termRef.current;
    const fit = fitRef.current;
    if (!term || !fit) return;
    term.options.fontSize = Math.round(TERMINAL_BASE_FONT_SIZE * zoom);
    fit.fit();
    ptyResize(terminalId, term.cols, term.rows).catch(console.error);
  }, [zoom, terminalId]);

  useEffect(() => {
    const unlisten = onPtyOutput((payload) => {
      if (payload.id !== terminalId || !termRef.current) return;
      const binary = atob(payload.data_b64);
      const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
      termRef.current.write(bytes);
    });
    return unlisten;
  }, [terminalId]);

  useEffect(() => {
    if (active && fitRef.current && termRef.current) {
      fitRef.current.fit();
      ptyResize(terminalId, termRef.current.cols, termRef.current.rows).catch(console.error);
      termRef.current.focus();
    }
  }, [active, terminalId]);

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
