import { memo, useEffect, useRef, useState } from "react";
import { Terminal, type ITheme } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { SerializeAddon } from "@xterm/addon-serialize";
import { SearchAddon } from "@xterm/addon-search";
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
        openUrl(uri).catch(console.error);
      }),
    );
  } catch (err) {
    console.error("terminal: web-links addon failed to load", err);
  }
  return { serialize };
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
  // See the IME comment in the mount effect below.
  const imeActiveRef = useRef(false);
  const imeCommittedRef = useRef("");
  const pendingWritesRef = useRef<Uint8Array[]>([]);

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
    const { serialize } = loadOptionalAddons(term);
    termRef.current = term;
    fitRef.current = fit;
    searchRef.current = search;

    const cached = scrollbackCache.get(terminalId);
    if (cached) term.write(cached);

    // CONFIRMED via captured event trace (not guessed): in this WKWebView
    // embed, `compositionstart`/`compositionupdate`/`compositionend` NEVER
    // fire for real Korean IME input — zero occurrences across a full
    // multi-syllable sentence, despite keydown reporting `keyCode===229`
    // (the standard "this key was IME-processed" marker) for every jamo,
    // and despite the hidden textarea's `value` building up perfectly
    // correct composed Hangul the whole time. This is a known class of
    // WebKit bug (Safari/WKWebView unreliably dispatching CompositionEvent
    // for CJK). Because those events never fire, xterm.js's
    // CompositionHelper — which is supposed to buffer everything and send
    // once, on compositionend — never activates; it falls back to naive
    // per-`input`-event diffing, which forwards some intermediate jamo
    // fragments to `onData` and silently drops others, producing exactly
    // the garbled "ㅇ지ㄷ ㅇ러ㄱ ㄴ느ㄷ?"-style output that was reported.
    //
    // Fix: since composition events are dead here, derive composition
    // boundaries ourselves from the one signal that *is* reliable —
    // `keydown.keyCode === 229` means "still composing," any other keydown
    // means the previous cluster is finalized (you can't keep composing
    // Hangul past a Space/Enter/Backspace/Latin key). While a cluster is
    // open we suppress xterm's own (buggy, fragment-based) onData sends
    // and buffer incoming PTY output (same rationale as before: don't let
    // the terminal's cursor move out from under an in-progress local
    // composition); on the boundary we read `term.textarea.value` directly
    // — proven correct by the trace — take the portion added since the
    // cluster started, and send that as one clean write, then reset.
    const onImeKeydown = (e: KeyboardEvent) => {
      if (e.keyCode === 229) {
        if (!imeActiveRef.current) {
          imeActiveRef.current = true;
          imeCommittedRef.current = term.textarea?.value ?? "";
        }
        return;
      }
      flushIme();
    };
    const flushIme = () => {
      if (!imeActiveRef.current) return;
      imeActiveRef.current = false;
      const value = term.textarea?.value ?? "";
      const committed = imeCommittedRef.current;
      if (value.startsWith(committed) && value.length > committed.length) {
        const delta = value.slice(committed.length);
        ptyWrite(terminalId, new TextEncoder().encode(delta)).catch(console.error);
      }
      imeCommittedRef.current = "";
      if (term.textarea) term.textarea.value = "";
      if (pendingWritesRef.current.length > 0) {
        for (const chunk of pendingWritesRef.current) term.write(chunk);
        pendingWritesRef.current = [];
      }
    };
    // Capture phase: must run and clear imeActiveRef *before* xterm's own
    // (bubble-phase) keydown handler decides whether to call onData for
    // the boundary key itself (confirmed via trace: for a plain key like
    // Space, xterm calls onData synchronously from keydown, before any
    // input event) — otherwise the boundary key would still see stale
    // "still composing" state.
    term.textarea?.addEventListener("keydown", onImeKeydown, true);
    const onBlur = () => flushIme();
    term.textarea?.addEventListener("blur", onBlur);

    // Deliberately verbose instrumentation kept from the investigation —
    // routed through console.log so it lands in debugOverlay.ts
    // (Ctrl+Shift+D), since WKWebView doesn't forward console output
    // anywhere else observable. Useful to re-verify this fix against a
    // real reproduction, and cheap to leave in.
    const imeTrace = (label: string, e: Event) => {
      const ke = e as KeyboardEvent;
      const ce = e as CompositionEvent;
      const parts = [`[ime-trace] ${label}`];
      if ("key" in e) parts.push(`key=${JSON.stringify(ke.key)}`);
      if ("code" in e) parts.push(`code=${JSON.stringify(ke.code)}`);
      if ("keyCode" in e) parts.push(`keyCode=${ke.keyCode}`);
      if ("isComposing" in e) parts.push(`isComposing=${ke.isComposing}`);
      if ("data" in e) parts.push(`data=${JSON.stringify(ce.data)}`);
      if (e.type === "input") parts.push(`textareaValue=${JSON.stringify(term.textarea?.value)}`);
      console.log(parts.join(" "));
    };
    const imeEvents = ["keydown", "keypress", "compositionstart", "compositionupdate", "compositionend", "input"];
    for (const type of imeEvents) {
      term.textarea?.addEventListener(type, (e) => imeTrace(type, e));
    }

    const syncSize = () => {
      fit.fit();
      ptyResize(terminalId, term.cols, term.rows).catch(console.error);
    };

    term.onData((data) => {
      console.log(`[ime-trace] term.onData data=${JSON.stringify(data)}`);
      // Suppressed during an active IME cluster — xterm's own composition
      // fragments are unreliable here (see the IME comment above);
      // flushIme() sends the correct, fully-composed text instead.
      if (imeActiveRef.current) return;
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
      term.textarea?.removeEventListener("keydown", onImeKeydown, true);
      term.textarea?.removeEventListener("blur", onBlur);
      pendingWritesRef.current = [];
      imeActiveRef.current = false;
      imeCommittedRef.current = "";
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
      if (imeActiveRef.current) {
        pendingWritesRef.current.push(bytes);
      } else {
        termRef.current.write(bytes);
      }
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
