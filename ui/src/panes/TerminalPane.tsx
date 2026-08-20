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

// Hangul Jamo (U+1100–U+11FF), Hangul Compatibility Jamo (U+3130–U+318F),
// and Hangul Syllables (U+AC00–U+D7A3) — see the IME comment in the mount
// effect below for why single characters in these blocks are treated as
// leaked composition fragments.
const HANGUL_FRAGMENT_RE = /[ᄀ-ᇿ㄰-㆏가-힣]/;

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
    // boundaries ourselves from signals that *are* reliable — a keydown
    // with `keyCode === 229` means "still composing." A second, real
    // finding from re-testing this against a live trace: the *first*
    // jamo of a cluster is not reliably tagged 229 (its keydown sometimes
    // reports `key/code === "Unidentified", keyCode === 0` instead), but
    // in every captured trace that "Unidentified" keydown immediately
    // precedes the CapsLock-remapped-to-Korean/English toggle the user's
    // machine uses, right before typing starts — so it's treated as an
    // arm signal too. Any other keydown is a boundary (you can't keep
    // composing Hangul past a Space/Enter/Backspace/Latin key) and
    // triggers a flush.
    //
    // A second confirmed bug from that same trace: xterm's own keydown
    // listener runs before ours (it was attached earlier, during
    // `term.open()`, and same-target listeners run in registration order
    // regardless of capture/bubble — capture does NOT give us priority
    // here), so it can call `onData` directly for a jamo, or for the
    // boundary key itself (e.g. Space), *before* our keydown listener has
    // run to arm/disarm `imeActiveRef`. A boolean flag checked inside the
    // `onData` callback can't outrun that ordering. Fix: suppress by
    // *content* instead of by flag — a leaked composition fragment is
    // always a single Hangul jamo/syllable character (confirmed: every
    // leaked fragment across both traces was length-1, in the Hangul
    // Jamo/Compatibility-Jamo/Syllables Unicode blocks), which a real
    // boundary key's own data (Space, Enter, a Latin letter) never is —
    // and a real paste of Korean text arrives as one multi-character
    // `onData` call, which the length===1 check leaves untouched. This
    // needs no timing assumptions at all.
    //
    // A third confirmed bug from that trace: an original version of this
    // fix diffed `term.textarea.value` against a "committed" prefix
    // captured when the cluster armed. That's wrong — Hangul jamo merge
    // *in place* (e.g. "ㅂ"+"ㅏ" becomes "바", not "ㅂ바"), so the
    // captured prefix can vanish entirely from the value by flush time,
    // and `startsWith` silently failed, dropping the whole cluster. Fix:
    // always clear `term.textarea.value` after every flush, so whatever
    // has accumulated *since* is the entire delta — no prefix-matching
    // needed.
    const flushIme = () => {
      const value = term.textarea?.value ?? "";
      if (value.length > 0) {
        ptyWrite(terminalId, new TextEncoder().encode(value)).catch(console.error);
        if (term.textarea) term.textarea.value = "";
      }
      if (pendingWritesRef.current.length > 0) {
        for (const chunk of pendingWritesRef.current) term.write(chunk);
        pendingWritesRef.current = [];
      }
    };
    const onImeKeydown = (e: KeyboardEvent) => {
      if (e.keyCode === 229 || e.code === "Unidentified") {
        imeActiveRef.current = true;
        return;
      }
      imeActiveRef.current = false;
      flushIme();
    };
    term.textarea?.addEventListener("keydown", onImeKeydown);
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
      // Suppressed by content, not by a timing-dependent flag — see the
      // IME comment above for why. A leaked composition fragment is
      // always a single character in a Hangul Unicode block; a real
      // paste arrives as a multi-character string and passes through.
      if (data.length === 1 && HANGUL_FRAGMENT_RE.test(data)) return;
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
      term.textarea?.removeEventListener("keydown", onImeKeydown);
      term.textarea?.removeEventListener("blur", onBlur);
      pendingWritesRef.current = [];
      imeActiveRef.current = false;
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
