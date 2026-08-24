import { memo, useEffect, useRef, useState } from "react";
import { Terminal, type ITheme } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { SerializeAddon } from "@xterm/addon-serialize";
import { SearchAddon } from "@xterm/addon-search";
import { openUrl } from "@tauri-apps/plugin-opener";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import "@xterm/xterm/css/xterm.css";
import { onPtyOutput, ptyResize, ptyWrite, debugLog } from "../tauri";
import { getCurrentResolvedTheme, subscribeThemeChange, type ResolvedTheme } from "../theme";

interface Props {
  terminalId: number;
  active: boolean;
  zoom?: number;
}

const TERMINAL_BASE_FONT_SIZE = 13;

// Same convention as a normal POSIX shell/terminal drag-drop (e.g. iTerm2,
// VS Code's integrated terminal): only quote when the path has characters
// a shell would otherwise split on or misinterpret.
function shellEscapePath(path: string): string {
  if (/^[a-zA-Z0-9_./@:-]+$/.test(path)) return path;
  return `'${path.replace(/'/g, "'\\''")}'`;
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
    // xterm's built-in ANSI palette is tuned for a dark background — its
    // "white"/"bright white" (used by CLI tools like Claude Code for
    // normal/emphasized text) resolve to near-white grays (#d3d7cf,
    // #eeeeec) that all but disappear against this light background.
    // Values below are Tango Light's palette with white/brightYellow/etc
    // darkened for contrast — same fix, same reasoning (Claude-style ANSI
    // accent text needs real contrast on light backgrounds, not Tango's
    // near-white legacy values) as ref-proj/orca's "Builtin Tango Light"
    // default light terminal theme.
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

function TerminalPaneInner({ terminalId, active, zoom = 1 }: Props) {
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
      fontSize: Math.round(TERMINAL_BASE_FONT_SIZE * zoom),
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, 'Apple SD Gothic Neo', monospace",
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

    const syncSize = () => {
      fit.fit();
      ptyResize(terminalId, term.cols, term.rows).catch(console.error);
    };

    term.onData((data) => {
      debugLog(`[hangul-trace] term.onData data=${JSON.stringify(data)}`).catch(() => {});
      const bytes = new TextEncoder().encode(data);
      ptyWrite(terminalId, bytes).catch(console.error);
    });

    // WKWebView's Korean IME never fires compositionstart/update/end, and
    // dispatches `input` *before* the matching `keydown` (confirmed via
    // [hangul-trace] captures during investigation). xterm's own
    // `_inputEvent` fallback treats "input with no keydown seen yet" as an
    // IME committing text directly (its intended case: mobile keyboards),
    // and forwards it to the PTY immediately — but for Korean that first
    // `insertText` is only the *start* of a syllable block, which the OS
    // goes on to revise via `insertReplacementText` as more jamo are typed
    // (반 -> 바 -> 반, etc). xterm doesn't act on `insertReplacementText` at
    // all, so those revisions are silently dropped and only the
    // incomplete first jamo of each block reaches the shell — the same
    // `_keyDownSeen`-gate bug class reported upstream for other WKWebView
    // IMEs (https://github.com/xtermjs/xterm.js/issues/5887), just
    // manifesting as corruption instead of a dropped character.
    //
    // Fix: intercept both inputTypes ourselves in the capture phase on
    // `host` (an ancestor of xterm's hidden textarea, so we see the event
    // before xterm's own listener on the textarea itself does) and only
    // forward a block once we're sure it's finalized: when the next block
    // starts, a non-Hangul keystroke arrives, or after a short idle
    // window as a fallback. Never touch `textarea.value` ourselves — the
    // browser's own composition already lands on the correct final text
    // there; we only track how much of it we've already sent.
    const HANGUL_RE = /[ᄀ-ᇿ㄰-㆏ꥠ-꥿가-힣ힰ-퟿]/;
    let hangulSentLength = 0;
    let hangulIdleTimer: number | null = null;

    const trace = (line: string) => debugLog(`[hangul-trace] ${line}`).catch(() => {});

    // `textarea.value` isn't ours alone — xterm's own (working, ASCII)
    // input path clears/rewrites it independently of our tracking, and it
    // can also just get shorter for reasons outside our control (new PTY
    // line, focus change). `hangulSentLength` is only ever supposed to
    // describe *this* value's already-sent prefix; once the value gets
    // shorter than it, that number describes a value that no longer
    // exists, and every future `.slice(hangulSentLength)` silently returns
    // "" — dropping all subsequent Hangul input. Resync before trusting it.
    const resyncHangulBaseline = () => {
      const len = term.textarea?.value.length ?? 0;
      if (len < hangulSentLength) hangulSentLength = 0;
    };

    // Suppressing xterm's own echo for these events (`e.stopPropagation()`
    // below) is what makes buffering safe, but it also means nothing shows
    // up on screen while a block is still composing — the terminal's
    // actual echo only ever comes from the shell receiving real bytes,
    // which we're deliberately delaying. Paint a local preview of the
    // still-unsent tail ourselves so typing doesn't look like it's doing
    // nothing, and erase it the instant we actually send.
    //
    // The real echo for a just-sent block doesn't land in the same tick,
    // though — `ptyWrite` is a Tauri IPC round trip (invoke -> Rust pty
    // write -> shell echo -> pty read -> event back to JS), so there's a
    // real, if usually small, delay before it's actually on screen. If the
    // *next* block's preview gets written before that arrives, it lands at
    // a cursor position the still-in-flight echo hasn't reached yet, and
    // the two visibly collide once it does. Deferring preview writes for a
    // short grace window after every real send gives that round trip a
    // head start — not a guarantee under extreme typing speed, but this is
    // a local pty, so the round trip is normally single-digit ms.
    const PREVIEW_GRACE_MS = 20;
    let previewWidth = 0;
    let previewDeferUntil = 0;
    let previewWriteTimer: number | null = null;

    const hangulDisplayWidth = (s: string): number => {
      let width = 0;
      for (const ch of s) {
        const code = ch.codePointAt(0) ?? 0;
        width += code >= 0x1100 && code <= 0xd7ff ? 2 : 1;
      }
      return width;
    };
    const writePreviewNow = (pending: string) => {
      const newWidth = hangulDisplayWidth(pending);
      if (previewWidth > 0) {
        term.write(`\x1b[${previewWidth}D`);
        // A jamo revision almost always keeps the syllable block the same
        // display width (하 -> 핫 -> 하 are all 2 columns) — the new text
        // fully overwrites the old in place, so there's nothing to blank
        // first. Erasing unconditionally on every revision was the source
        // of the visible flicker at fast typing speed; only actually
        // needed when the new text is narrower and would otherwise leave
        // old cells trailing past its end.
        if (newWidth < previewWidth) term.write(`\x1b[${previewWidth}X`);
      }
      previewWidth = newWidth;
      if (pending) term.write(pending);
    };
    const updateHangulPreview = (pending: string) => {
      if (previewWriteTimer !== null) {
        window.clearTimeout(previewWriteTimer);
        previewWriteTimer = null;
      }
      const wait = previewDeferUntil - Date.now();
      if (wait > 0) {
        previewWriteTimer = window.setTimeout(() => {
          previewWriteTimer = null;
          writePreviewNow(pending);
        }, wait);
      } else {
        writePreviewNow(pending);
      }
    };

    const sendHangul = (text: string) => {
      if (!text) return;
      trace(`sendHangul text=${JSON.stringify(text)}`);
      ptyWrite(terminalId, new TextEncoder().encode(text)).catch(console.error);
      previewDeferUntil = Date.now() + PREVIEW_GRACE_MS;
    };

    const flushHangulUpTo = (splitPoint: number) => {
      const value = term.textarea?.value ?? "";
      if (splitPoint > hangulSentLength) {
        updateHangulPreview("");
        sendHangul(value.slice(hangulSentLength, splitPoint));
        hangulSentLength = splitPoint;
      }
    };
    const flushAllPendingHangul = () => {
      if (hangulIdleTimer !== null) {
        window.clearTimeout(hangulIdleTimer);
        hangulIdleTimer = null;
      }
      flushHangulUpTo(term.textarea?.value.length ?? 0);
    };
    const onHangulInput = (e: Event) => {
      resyncHangulBaseline();
      const ie = e as InputEvent;
      const isReplacement = ie.inputType === "insertReplacementText";
      const isHangulInsert =
        ie.inputType === "insertText" && !!ie.data && HANGUL_RE.test(ie.data);
      // Internal IME churn, not a character of its own: the composing tail
      // grows via insertCompositionText and gets torn down via
      // deleteCompositionText (data=null) right before the real commit
      // (insertFromComposition, handled below like any other boundary
      // event) re-adds it. Neither is something xterm's own path ever
      // sends on its own — confirmed via [hangul-trace]: no term.onData
      // follows either — so advancing hangulSentLength past them (as the
      // boundary branch below would, treating the still-uncommitted tail
      // as "xterm already sent it") was a lie. The next deleteComposition's
      // natural shrink then tripped resyncHangulBaseline's reset-to-0, and
      // the following flush re-sent the *entire* buffer from scratch —
      // this was the actual source of the "반반갑반갑습..." growing-prefix
      // duplication, not anything about sendHangul/flushHangulUpTo
      // themselves. Only refresh the on-screen preview here; leave
      // hangulSentLength untouched.
      const isComposingChurn =
        ie.inputType === "insertCompositionText" || ie.inputType === "deleteCompositionText";
      trace(
        `input inputType=${ie.inputType} data=${JSON.stringify(ie.data)} isReplacement=${isReplacement} isHangulInsert=${isHangulInsert} isComposingChurn=${isComposingChurn} hangulSentLength=${hangulSentLength} textareaValue=${JSON.stringify(term.textarea?.value)}`,
      );

      if (isComposingChurn) {
        updateHangulPreview((term.textarea?.value ?? "").slice(hangulSentLength));
        e.stopPropagation();
        return;
      }

      if (!isReplacement && !isHangulInsert) {
        // Not part of a Hangul composition block. Whatever's pending from
        // a *finished* Hangul block should land in the PTY before this
        // next character does — but this character itself is not ours to
        // send: xterm's own (working) keydown path already delivers it via
        // `term.onData` (confirmed via [hangul-trace]: `term.onData`
        // fires for it immediately on keydown, before this `input` event
        // even arrives). Flush only up to, not including, it — then mark
        // it as accounted for *without* sending it ourselves, so it isn't
        // mistaken for still-pending Hangul and swept into some later
        // flush (that was the bug: skipping it here without advancing
        // past it just meant the *next* flush re-sent it).
        const value = term.textarea?.value ?? "";
        flushHangulUpTo(value.length - (ie.data?.length ?? 0));
        hangulSentLength = value.length;
        // Whatever the preview was still showing (the composing tail this
        // commit replaces) is now stale — xterm's own path is about to
        // echo the real character in that same spot, so leaving the old
        // preview glyphs un-erased would show both overlapping/adjacent
        // (the "표시자가 앞에 뜸" offset bug). hangulSentLength == value.length
        // now, so this is just an erase, not a redraw of new content.
        updateHangulPreview("");
        return;
      }

      if (isHangulInsert) {
        // A brand new block started — the previous one (if any) is done
        // composing and safe to send, but not this new block's
        // just-typed first jamo, which may still get revised.
        const value = term.textarea?.value ?? "";
        flushHangulUpTo(value.length - (ie.data?.length ?? 0));
      }
      updateHangulPreview((term.textarea?.value ?? "").slice(hangulSentLength));

      e.stopPropagation();
      if (hangulIdleTimer !== null) window.clearTimeout(hangulIdleTimer);
      hangulIdleTimer = window.setTimeout(flushAllPendingHangul, 500);
    };
    host.addEventListener("input", onHangulInput, true);

    // `input` events only cover text characters. A non-composing key with
    // no text of its own — Enter, Backspace, Tab, arrows — never fires one,
    // so it reaches xterm's normal keydown handling (and gets sent to the
    // PTY) without ever passing through `onHangulInput` above. Without this,
    // pressing Enter right after finishing a Hangul block races xterm's own
    // send of that keystroke against our up-to-500ms idle flush, and the
    // last syllable can arrive at the shell *after* the Enter that was
    // meant to submit it. Flush first for any keydown that isn't part of
    // composition (keyCode 229) so ordering always stays correct.
    const MODIFIER_KEYS = new Set(["Shift", "Control", "Alt", "Meta", "CapsLock", "AltGraph"]);
    const onKeydownBoundary = (e: KeyboardEvent) => {
      resyncHangulBaseline();
      trace(
        `keydown key=${JSON.stringify(e.key)} code=${e.code} keyCode=${e.keyCode} hangulSentLength=${hangulSentLength} textareaValue=${JSON.stringify(term.textarea?.value)}`,
      );
      // A modifier held to produce the *next* jamo (Shift for the doubled
      // consonants ㅆ/ㄲ/ㄸ/ㅃ/ㅉ, e.g.) isn't itself a composition
      // boundary — flushing on it can cut a block off mid-revision (같은
      // `_keyDownSeen`-poisoning class as xtermjs/xterm.js#5887's held-Shift
      // report, just triggered by our own boundary check instead of
      // xterm's).
      //
      // key="Unidentified"/keyCode=0 is excluded too — WKWebView's 2-beolsik
      // IME fires a synthetic CapsLock+Unidentified keydown pair as part of
      // its own internal signaling *during* composition, not from any real
      // keystroke. It carries no character and isn't a real boundary, but
      // treating it as one raced the still-mid-composition last syllable:
      // this flushed it early via sendHangul (marking it "already sent"
      // via hangulSentLength), then the real deleteCompositionText/
      // insertFromComposition commit landed with hangulSentLength now
      // *ahead* of what deleteCompositionText's natural shrink expected,
      // tripping resyncHangulBaseline's reset-to-0 and re-sending the
      // entire buffer from scratch — confirmed via [hangul-trace] on a
      // live repro (the "아니 내말은..." duplication).
      if (e.keyCode !== 229 && e.keyCode !== 0 && !MODIFIER_KEYS.has(e.key)) flushAllPendingHangul();
    };
    host.addEventListener("keydown", onKeydownBoundary, true);

    syncSize();
    requestAnimationFrame(() => {
      syncSize();
      term.focus();
    });

    const resizeObserver = new ResizeObserver(() => syncSize());
    resizeObserver.observe(host);
    window.addEventListener("resize", syncSize);

    // Drop targeting is done by hand (position hit-test against this
    // pane's own host rect) rather than a plain HTML5 `ondrop`: Tauri
    // intercepts OS-level drag-drop at the webview level (that's what
    // `dragDropEnabled` in tauri.conf.json controls) and only exposes it
    // through this per-webview event, not through the DOM drag events a
    // browser would normally fire. A hidden/inactive pane's host has a
    // zero-size rect, so it naturally never matches.
    let unlistenDragDrop: (() => void) | undefined;
    getCurrentWebview()
      .onDragDropEvent((event) => {
        if (event.payload.type !== "drop") return;
        const logical = event.payload.position.toLogical(window.devicePixelRatio);
        const rect = host.getBoundingClientRect();
        if (
          logical.x < rect.left ||
          logical.x > rect.right ||
          logical.y < rect.top ||
          logical.y > rect.bottom
        ) {
          return;
        }
        const text = event.payload.paths.map(shellEscapePath).join(" ") + " ";
        ptyWrite(terminalId, new TextEncoder().encode(text)).catch(console.error);
        term.focus();
      })
      .then((unlisten) => {
        unlistenDragDrop = unlisten;
      })
      .catch(console.error);

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
      unlistenDragDrop?.();
      host.removeEventListener("input", onHangulInput, true);
      host.removeEventListener("keydown", onKeydownBoundary, true);
      if (hangulIdleTimer !== null) window.clearTimeout(hangulIdleTimer);
      if (previewWriteTimer !== null) window.clearTimeout(previewWriteTimer);
      // Erase any still-unsent preview before the scrollback snapshot below
      // — otherwise a mid-composition remount (switching workspace tabs)
      // would bake that preview text into the cached scrollback as if it
      // were real terminal content. Synchronous, not through
      // `updateHangulPreview`: `term` is about to be disposed, so a
      // deferred write landing after that would hit a dead terminal.
      writePreviewNow("");
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

  // Live zoom changes (Cmd+'+'/Cmd+'-') without recreating the terminal —
  // xterm supports reassigning `fontSize` on an existing instance; it just
  // needs a re-fit (cell size changed) and the pty told about the new
  // cols/rows that follow from that.
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
