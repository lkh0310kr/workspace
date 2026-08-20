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

// True only if every character in `s` is in a Hangul block — used to
// recognize a leaked composition fragment regardless of its length (see
// the IME comment in the mount effect below: a fast typist can make
// WebKit batch more than one jamo into a single input/onData event).
function isPureHangul(s: string): boolean {
  return s.length > 0 && Array.from(s).every((ch) => HANGUL_FRAGMENT_RE.test(ch));
}

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
  const previewActiveRef = useRef(false);
  const imeConsumedLenRef = useRef(0);
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
    // run to arm/disarm `imeActiveRef`. A boolean flag alone checked
    // inside the `onData` callback can't outrun that ordering, so it's
    // combined with content: suppress when we know a cluster is open
    // (`imeActiveRef`) *and* the data is pure Hangul — a real boundary
    // key's own data (Space, Enter, a Latin letter) is never Hangul, so
    // it's unaffected regardless of the flag's exact timing. A fifth
    // confirmed bug, from re-testing at normal (faster) typing speed
    // instead of the careful pace of the first two traces: leaked
    // fragments aren't always a single character — a fast typist makes
    // WebKit batch more than one jamo into a single input/onData event
    // (observed as doubled syllables, e.g. "는는"), which an earlier
    // `data.length === 1` check let through unsuppressed and caused that
    // doubling. `isPureHangul` has no length limit; a real paste of
    // Korean text is distinguished by `imeActiveRef` being false (no
    // keydown-driven composition preceded it), not by length.
    //
    // A third confirmed bug from that trace: an original version of this
    // fix diffed `term.textarea.value` against a "committed" prefix
    // captured when the cluster armed. That's wrong — Hangul jamo merge
    // *in place* (e.g. "ㅂ"+"ㅏ" becomes "바", not "ㅂ바"), so the
    // captured prefix can vanish entirely from the value by flush time,
    // and `startsWith` silently failed, dropping the whole cluster.
    //
    // A fourth confirmed bug, from a follow-up re-test after that fix:
    // reported as "space seems to happen twice." Root cause — since
    // compositionstart/end never fire here, `term.textarea.value` isn't
    // just accumulating the current Hangul cluster, it accumulates
    // *everything* typed since the last flush, including plain ASCII/
    // Space keystrokes that xterm's own onData already sent directly
    // (confirmed in the original trace: textareaValue kept growing across
    // an entire sentence, spaces included). Sending the raw value at
    // flush time re-sent those already-delivered characters a second
    // time. Fix: extract only the Hangul-range characters from the value
    // — the ASCII/space characters in there were already forwarded by
    // xterm directly and must not be resent.
    //
    // A seventh confirmed bug, caused by the fix directly above: that
    // fix cleared `term.textarea.value = ""` after every send. Captured
    // log evidence: `flushIme sending hangulOnly="확"` immediately
    // followed by a separate, independent `onData data="확"
    // imeActive=false` — "확" reaching the PTY twice, i.e. exactly the
    // "characters shown twice" report. Root cause: `term.textarea.value`
    // is xterm's own live-bound element; xterm keeps its own private,
    // undocumented "last known value" for its input-diffing fallback
    // path, and mutating the DOM value directly doesn't tell xterm about
    // it — it desyncs, and later resynchronizes by independently
    // replaying stale content through its own onData. Fix: never mutate
    // `term.textarea.value` at all. Track how much of it we've already
    // consumed as a length offset instead (`imeConsumedLenRef`) and only
    // ever read `value.slice(imeConsumedLenRef.current)` — this is the
    // same "track an offset into value you don't own" pattern real
    // terminal/IME integrations use specifically to avoid fighting the
    // browser for ownership of a shared input element.
    // Reported: even with the fix working, typing didn't *feel* like
    // Orca (or any native IME) — raw jamo only ever appeared once a
    // cluster flushed, instead of updating live as each jamo/syllable
    // composes, which is the normal IME UX (candidate text visible
    // immediately, refined in place as more jamo merge in). That's
    // achievable without touching what actually gets sent to the PTY:
    // render the in-progress cluster as a purely local overlay at the
    // cursor via `term.write()`, anchored with a cursor save (`\x1b[s`)
    // on the first jamo of a cluster and redrawn via cursor-restore +
    // erase-to-end-of-line (`\x1b[u\x1b[0K`) on every subsequent update
    // — never sent through `ptyWrite`, so it can't reintroduce the
    // fragment-corruption bug. `flushIme` erases the preview immediately
    // before sending the real, finalized text, which the shell then
    // echoes back for real. Safe against the terminal's cursor moving
    // out from under the anchor mid-composition because incoming PTY
    // output is already held in `pendingWritesRef` for the same duration
    // (see below) — nothing else can move the cursor while a preview is
    // anchored.
    const clearPreview = () => {
      if (!previewActiveRef.current) return;
      term.write("\x1b[u\x1b[0K");
      previewActiveRef.current = false;
    };
    const updatePreview = (hangulOnly: string) => {
      if (!previewActiveRef.current) {
        if (hangulOnly.length === 0) return;
        term.write("\x1b[s");
        previewActiveRef.current = true;
      }
      term.write("\x1b[u\x1b[0K" + hangulOnly);
    };
    // The portion of `term.textarea.value` not yet consumed — never
    // mutate the value itself (see the seventh-bug comment above); only
    // ever advance this offset once its content has been dealt with.
    //
    // An eighth confirmed bug: an earlier version of this reset the
    // offset to 0 whenever the value was shorter than it, meant to
    // handle a real Backspace. Log evidence it was wrong: the value
    // transiently *shrinks then regrows* as an ordinary part of WebKit's
    // own jamo-merge redraw (e.g. "...확" → "..." → "...확" again,
    // confirmed adjacent in the trace, with no Backspace keydown between
    // them — a delete-then-reinsert the browser does internally, not a
    // user edit). That transient dip was tripping the reset, which threw
    // away the offset and made the *entire session's already-sent
    // history* look unconsumed again at the next flush — exactly the
    // "다른서비스참고해서다른서비스참고해서" duplication reported. Real
    // Backspace doesn't need handling here at all: the byte it produces
    // goes through xterm's own direct (non-IME) onData path, entirely
    // separate from this offset. So this offset should only ever move
    // forward — a shrink, transient or real, just means there's nothing
    // new yet, not that history should be replayed.
    const unconsumed = () => {
      const raw = term.textarea?.value ?? "";
      return raw.length > imeConsumedLenRef.current ? raw.slice(imeConsumedLenRef.current) : "";
    };
    const flushIme = () => {
      const pending = unconsumed();
      clearPreview();
      if (pending.length > 0) {
        imeConsumedLenRef.current = term.textarea?.value.length ?? imeConsumedLenRef.current;
        const hangulOnly = Array.from(pending)
          .filter((ch) => HANGUL_FRAGMENT_RE.test(ch))
          .join("");
        if (hangulOnly.length > 0) {
          console.log(`[ime-trace] flushIme sending hangulOnly=${JSON.stringify(hangulOnly)} pending=${JSON.stringify(pending)}`);
          ptyWrite(terminalId, new TextEncoder().encode(hangulOnly)).catch(console.error);
        }
      }
      if (pendingWritesRef.current.length > 0) {
        for (const chunk of pendingWritesRef.current) term.write(chunk);
        pendingWritesRef.current = [];
      }
    };
    const onImeInput = () => {
      if (!imeActiveRef.current) return;
      const hangulOnly = Array.from(unconsumed())
        .filter((ch) => HANGUL_FRAGMENT_RE.test(ch))
        .join("");
      updatePreview(hangulOnly);
    };
    term.textarea?.addEventListener("input", onImeInput);
    // Reported after re-testing the boundary-only version: text stayed
    // buffered until a boundary key (Space/Enter) was pressed, so nothing
    // showed up if the user just paused. A cluster only ever ends on an
    // explicit boundary keydown otherwise, so add an idle timeout as a
    // second, independent way to reach the same flush.
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    const clearIdleTimer = () => {
      if (idleTimer !== null) {
        clearTimeout(idleTimer);
        idleTimer = null;
      }
    };
    // 150ms: comfortably above normal inter-jamo keystroke gaps (typing
    // is continuous well under this) but short enough that a genuine
    // pause doesn't read as "stuck waiting for a boundary key."
    const scheduleIdleFlush = () => {
      clearIdleTimer();
      idleTimer = setTimeout(() => {
        idleTimer = null;
        imeActiveRef.current = false;
        flushIme();
      }, 150);
    };
    // A sixth confirmed bug, from re-testing at fast typing speed:
    // captured a keydown for the literal Space key with keyCode === 229
    // (confirmed in the log: `key=" " code=Space keyCode=229` — WebKit's
    // 229 tagging is itself unreliable under load, not just its
    // composition/input-event firing). Trusting keyCode alone meant that
    // Space got treated as "still composing" instead of a boundary, so
    // it never triggered a flush there — the space just accumulated into
    // the same open cluster and was later stripped by the Hangul-only
    // filter, gluing two words together with no space between them
    // (matches "치ㅁㅕㄴ이러게", "게되는데요" in what was typed). Fix:
    // decide by what `e.key` actually *is*, not by the browser's keyCode
    // — only arm/keep-composing when the key is itself a single Hangul
    // jamo character, or the "Unidentified" arm precursor. Space, Enter,
    // Backspace, and everything else always reads as a boundary now,
    // regardless of what keyCode claims.
    const onImeKeydown = (e: KeyboardEvent) => {
      const isJamoKey = e.key.length === 1 && HANGUL_FRAGMENT_RE.test(e.key);
      if (isJamoKey || e.code === "Unidentified") {
        imeActiveRef.current = true;
        scheduleIdleFlush();
        return;
      }
      clearIdleTimer();
      imeActiveRef.current = false;
      flushIme();
    };
    term.textarea?.addEventListener("keydown", onImeKeydown);
    const onBlur = () => {
      clearIdleTimer();
      flushIme();
    };
    term.textarea?.addEventListener("blur", onBlur);

    // Lightweight tracing, safe to leave on: keydown/input are bounded
    // by human typing speed, unlike the earlier version that also traced
    // every term.onData call (including mouse-wheel SGR sequences during
    // scroll) and caused a real, reported perf regression — removed.
    const onImeTraceKeydown = (e: KeyboardEvent) => {
      console.log(`[ime-trace] keydown key=${JSON.stringify(e.key)} code=${e.code} keyCode=${e.keyCode}`);
    };
    const onImeTraceInput = () => {
      console.log(`[ime-trace] input textareaValue=${JSON.stringify(term.textarea?.value)}`);
    };
    term.textarea?.addEventListener("keydown", onImeTraceKeydown);
    term.textarea?.addEventListener("input", onImeTraceInput);

    const syncSize = () => {
      fit.fit();
      ptyResize(terminalId, term.cols, term.rows).catch(console.error);
    };

    term.onData((data) => {
      // See the IME comment above for why this checks both the flag and
      // the content, and why length alone isn't a safe filter.
      if (imeActiveRef.current && isPureHangul(data)) {
        console.log(`[ime-trace] suppressed onData data=${JSON.stringify(data)}`);
        return;
      }
      if (isPureHangul(data)) {
        console.log(`[ime-trace] onData data=${JSON.stringify(data)} imeActive=${imeActiveRef.current}`);
      }
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
      clearIdleTimer();
      term.textarea?.removeEventListener("keydown", onImeKeydown);
      term.textarea?.removeEventListener("blur", onBlur);
      term.textarea?.removeEventListener("input", onImeInput);
      term.textarea?.removeEventListener("keydown", onImeTraceKeydown);
      term.textarea?.removeEventListener("input", onImeTraceInput);
      pendingWritesRef.current = [];
      imeActiveRef.current = false;
      previewActiveRef.current = false;
      imeConsumedLenRef.current = 0;
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
