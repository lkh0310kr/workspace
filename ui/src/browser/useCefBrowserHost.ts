import { isTauri } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { measureElementRect, normalizeBrowserUrl } from "../browser";
import {
  cefBack,
  cefForward,
  cefHidePane,
  cefNavigate,
  cefReload,
  cefReportFrame,
  cefToggleDevtools,
  onCefAddress,
  onCefLoading,
  onCefProgress,
} from "./cefBrowser";
import { isOverlayBlocked, subscribeOverlayBarrier } from "./overlayBarrier";

interface Options {
  paneId: string;
  initialUrl?: string;
  contentRef: React.RefObject<HTMLDivElement | null>;
  visible: boolean;
}

/// Same shape as `useBrowserHost` (the WKWebView `browser` pane's hook) —
/// windowed CEF is a native child view positioned the same way, just backed
/// by different Tauri commands. Kept as a separate hook rather than a
/// parameterized/shared one so a bug in one backend can't silently affect
/// the other.
export function useCefBrowserHost({
  paneId,
  initialUrl = "https://example.com",
  contentRef,
  visible,
}: Options) {
  const [url, setUrl] = useState(initialUrl);
  // Real 0-1 main-frame load progress (`cef-progress`), null = not loading.
  // Not derived from `is_loading` in `cef-loading`: that flag stays true as
  // long as *anything* (background analytics, polling) is in flight, which
  // on sites like google.com is effectively forever — this made the
  // progress bar look permanently stuck.
  const [progress, setProgress] = useState<number | null>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const currentRef = useRef(normalizeBrowserUrl(initialUrl));
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const visibleRef = useRef(visible);

  useEffect(() => {
    visibleRef.current = visible;
  }, [visible]);

  const isPaneVisible = useCallback(() => visibleRef.current && !isOverlayBlocked(), []);

  const reportFrame = useCallback(
    async (nextUrl?: string) => {
      if (!isTauri()) return;
      const content = contentRef.current;
      if (!content) return;
      const rect = measureElementRect(content);
      if (!rect) return;
      const url = nextUrl ?? currentRef.current;
      console.log(
        `[cef] reportFrame paneId=${paneId} url=${url} rect=${rect.x},${rect.y},${rect.width}x${rect.height} visible=${isPaneVisible()}`,
      );
      await cefReportFrame(paneId, url, rect, isPaneVisible());
    },
    [contentRef, isPaneVisible, paneId],
  );

  const scheduleSync = useCallback(() => {
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => {
      void reportFrame().catch(console.error);
    }, 16);
  }, [reportFrame]);

  const navigate = useCallback(() => {
    const next = normalizeBrowserUrl(url);
    console.log(`[cef] navigate() paneId=${paneId} url=${next}`);
    currentRef.current = next;
    setUrl(next);
    if (!isTauri()) return;
    setProgress(0);
    void cefNavigate(paneId, next)
      .catch((e) => {
        console.log(`[cef] cefNavigate FAILED ${String(e)}, falling back to reportFrame`);
        return reportFrame(next);
      })
      .catch(console.error);
  }, [paneId, reportFrame, url]);

  const back = useCallback(() => {
    console.log(`[cef] back() paneId=${paneId}`);
    if (isTauri()) cefBack(paneId).catch(console.error);
  }, [paneId]);

  const forward = useCallback(() => {
    console.log(`[cef] forward() paneId=${paneId}`);
    if (isTauri()) cefForward(paneId).catch(console.error);
  }, [paneId]);

  const reload = useCallback(() => {
    console.log(`[cef] reload() paneId=${paneId}`);
    if (isTauri()) {
      setProgress(0);
      cefReload(paneId).catch(console.error);
    }
  }, [paneId]);

  const toggleDevtools = useCallback(() => {
    if (isTauri()) cefToggleDevtools(paneId).catch(console.error);
  }, [paneId]);

  useEffect(() => {
    const next = normalizeBrowserUrl(initialUrl);
    currentRef.current = next;
    setUrl(initialUrl);
  }, [initialUrl]);

  useEffect(() => {
    if (!isTauri()) return;
    console.log(`[cef] mount paneId=${paneId}`);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => scheduleSync());
    });

    return () => {
      console.log(`[cef] unmount paneId=${paneId}`);
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
      void cefHidePane(paneId).catch(console.error);
    };
  }, [paneId, scheduleSync]);

  useEffect(() => {
    if (!isTauri()) return;
    scheduleSync();
  }, [visible, scheduleSync]);

  useEffect(() => {
    if (!isTauri()) return;
    return subscribeOverlayBarrier(scheduleSync);
  }, [scheduleSync]);

  useEffect(() => {
    if (!isTauri()) return;
    const unlisten = onCefProgress(({ paneId: eventPaneId, progress: p }) => {
      if (eventPaneId !== paneId) return;
      // 1.0 means the main frame is done — hide the bar rather than parking
      // it at a static 100% fill.
      setProgress(p >= 1 ? null : p);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [paneId]);

  useEffect(() => {
    if (!isTauri()) return;
    const unlisten = onCefLoading(({ paneId: eventPaneId, canGoBack: cgb, canGoForward: cgf }) => {
      if (eventPaneId !== paneId) return;
      setCanGoBack(cgb);
      setCanGoForward(cgf);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [paneId]);

  useEffect(() => {
    if (!isTauri()) return;
    const unlisten = onCefAddress(({ paneId: eventPaneId, url: newUrl }) => {
      if (eventPaneId !== paneId) return;
      console.log(`[cef] address change paneId=${paneId} url=${newUrl}`);
      currentRef.current = newUrl;
      setUrl(newUrl);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [paneId]);

  useEffect(() => {
    if (!isTauri()) return;
    const content = contentRef.current;
    if (!content) return;

    const observer = new ResizeObserver(() => scheduleSync());
    observer.observe(content);

    const onLayoutChange = () => scheduleSync();
    window.addEventListener("resize", onLayoutChange);
    window.addEventListener("scroll", onLayoutChange, true);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", onLayoutChange);
      window.removeEventListener("scroll", onLayoutChange, true);
    };
  }, [contentRef, scheduleSync]);

  return {
    url,
    setUrl,
    navigate,
    back,
    forward,
    reload,
    toggleDevtools,
    progress,
    canGoBack,
    canGoForward,
  };
}
