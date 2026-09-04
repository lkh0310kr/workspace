import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getBrowserHistory } from "../browserHistory";
import { buildAddressBarSuggestions, type AddressBarSuggestion } from "../browserAddressBarSuggestions";
import { interactionCoordinator } from "../interaction/InteractionCoordinator";

// Real-browser-style address bar: history-based autocomplete dropdown,
// select-all on focus, Escape reverts to the actual current URL, Enter
// always navigates the typed text (Chrome's behavior — a highlighted
// dropdown row is only taken by clicking or Arrow+Enter... actually Chrome
// takes Enter on the highlighted row too; matched here via `committedValue`
// tracking, see handleKeyDown), Arrow Up/Down previews a row into the
// input without committing. Loosely ported from Orca's BrowserAddressBar.tsx
// (ref-proj/orca), rebuilt without Radix Popover/shadcn/Zustand (none of
// which this app has) — a portaled plain div positioned under the input
// instead of a Popover, module-level localStorage history instead of a
// synced store.
interface Props {
  value: string;
  /** The webview's actual current URL — what Escape reverts to when the
   * user was editing but never arrow-previewed a suggestion. */
  currentUrl: string;
  onChange: (value: string) => void;
  onNavigate: (url: string) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  /** After the autocomplete portal closes — return focus to the page guest. */
  onDismiss?: () => void;
}

export function BrowserAddressBar({
  value,
  currentUrl,
  onChange,
  onNavigate,
  inputRef,
  onDismiss,
}: Props) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<{ left: number; top: number; width: number } | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  // The value before Arrow-key preview started overwriting the input —
  // restored on Escape/blur, and what suggestions are actually matched
  // against while previewing (so arrowing through rows doesn't re-filter
  // the list against the previewed URL text).
  const prePreviewValueRef = useRef<string | null>(null);
  const blurTimerRef = useRef<number | null>(null);

  const query = prePreviewValueRef.current ?? value;
  const suggestions = useMemo(
    () => buildAddressBarSuggestions(getBrowserHistory(), query),
    // getBrowserHistory() is a plain synchronous read of a module-level
    // cache — re-run this only when the query itself changes, same as
    // Orca does keying off its store snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [query],
  );

  const updateRect = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setRect({ left: r.left, top: r.bottom + 4, width: r.width });
  }, [inputRef]);

  const restoreTypedQuery = useCallback(() => {
    if (prePreviewValueRef.current === null) return;
    const typed = prePreviewValueRef.current;
    prePreviewValueRef.current = null;
    onChange(typed);
  }, [onChange]);

  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  const close = useCallback(() => {
    if (blurTimerRef.current !== null) {
      window.clearTimeout(blurTimerRef.current);
      blurTimerRef.current = null;
    }
    restoreTypedQuery();
    setOpen(false);
    onDismissRef.current?.();
  }, [restoreTypedQuery]);

  // Escape: if arrow-previewing a suggestion, just cancel that preview
  // (handled by close() above). Otherwise revert whatever was typed back
  // to the page's actual current URL — same as a real browser address bar.
  const revertToCurrentUrl = useCallback(() => {
    if (prePreviewValueRef.current !== null) return;
    onChange(currentUrl);
  }, [currentUrl, onChange]);

  const handleFocus = useCallback(() => {
    if (blurTimerRef.current !== null) {
      window.clearTimeout(blurTimerRef.current);
      blurTimerRef.current = null;
    }
    inputRef.current?.select();
    updateRect();
    setSelectedIndex(0);
    setOpen(true);
  }, [inputRef, updateRect]);

  const handleBlur = useCallback(() => {
    // Delay so a click on a suggestion row registers (mousedown on the
    // portaled row fires before this blur's effect runs) before the list
    // unmounts.
    blurTimerRef.current = window.setTimeout(() => {
      blurTimerRef.current = null;
      close();
    }, 150);
  }, [close]);

  const selectIndex = useCallback(
    (index: number) => {
      const suggestion = suggestions[index];
      if (!suggestion) return;
      setSelectedIndex(index);
      if (index === 0 && suggestion.isSearch) {
        // Row 0's search action mirrors what Enter already does with the
        // typed query — keep the input showing the typed text.
        prePreviewValueRef.current = null;
        onChange(query);
        return;
      }
      if (prePreviewValueRef.current === null) prePreviewValueRef.current = query;
      onChange(suggestion.url);
    },
    [suggestions, query, onChange],
  );

  const commit = useCallback(
    (url: string) => {
      prePreviewValueRef.current = null;
      setOpen(false);
      onNavigate(url);
      onDismissRef.current?.();
    },
    [onNavigate],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Escape") {
        e.preventDefault();
        revertToCurrentUrl();
        close();
        inputRef.current?.blur();
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        // Chrome: Enter navigates the current input text (which Arrow
        // Up/Down already previews into the field) — not necessarily row 0.
        commit(query.trim() ? query : value);
        return;
      }
      if (!open || suggestions.length === 0) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        selectIndex(selectedIndex < suggestions.length - 1 ? selectedIndex + 1 : 0);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        selectIndex(selectedIndex > 0 ? selectedIndex - 1 : suggestions.length - 1);
      }
    },
    [close, commit, query, value, inputRef, open, suggestions, selectedIndex, selectIndex],
  );

  useEffect(() => {
    if (!open) return;
    const onResize = () => updateRect();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open, updateRect]);

  useEffect(() => {
    if (!open) return;
    return interactionCoordinator.registerPortal(`browser-address-bar:${inputRef.current?.id ?? "default"}`, close);
  }, [open, close, inputRef]);

  return (
    <>
      <input
        ref={inputRef}
        className="browser-url"
        value={value}
        onChange={(e) => {
          prePreviewValueRef.current = null;
          setSelectedIndex(0);
          onChange(e.target.value);
        }}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder="https://..."
        spellCheck={false}
        autoCapitalize="none"
        autoCorrect="off"
      />
      {open && suggestions.length > 0 && rect
        ? createPortal(
            <div
              className="browser-address-suggestions"
              style={{ left: rect.left, top: rect.top, width: rect.width }}
            >
              {suggestions.map((suggestion: AddressBarSuggestion, i: number) => (
                <div
                  key={suggestion.url + i}
                  className={`browser-address-suggestion${i === selectedIndex ? " active" : ""}`}
                  onMouseEnter={() => setSelectedIndex(i)}
                  onMouseDown={(e) => {
                    // preventDefault keeps the input focused so `commit`'s
                    // state updates aren't immediately undone by blur.
                    e.preventDefault();
                    commit(suggestion.url);
                  }}
                >
                  <span className="browser-address-suggestion-title">{suggestion.title}</span>
                  {suggestion.subtitle && (
                    <span className="browser-address-suggestion-subtitle">{suggestion.subtitle}</span>
                  )}
                </div>
              ))}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
