import { isTauri } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  browserBack,
  browserDetach,
  browserForward,
  browserNavigate,
  browserReload,
  browserReportFrame,
  browserToggleDevtools,
  measureElementRect,
  normalizeBrowserUrl,
} from "../browser";
import { isOverlayBlocked, subscribeOverlayBarrier } from "./overlayBarrier";
import { onBrowserLoading } from "../tauri";

interface Options {
  paneId: string;
  initialUrl?: string;
  contentRef: React.RefObject<HTMLDivElement | null>;
  visible: boolean;
}

export function useBrowserHost({
  paneId,
  initialUrl = "https://example.com",
  contentRef,
  visible,
}: Options) {
  const [url, setUrl] = useState(initialUrl);
  const [frameUrl, setFrameUrl] = useState(() => normalizeBrowserUrl(initialUrl));
  const [loading, setLoading] = useState(false);
  const currentRef = useRef(normalizeBrowserUrl(initialUrl));
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const visibleRef = useRef(visible);

  useEffect(() => {
    visibleRef.current = visible;
  }, [visible]);

  const isWebviewVisible = useCallback(
    () => visibleRef.current && !isOverlayBlocked(),
    [],
  );

  const reportFrame = useCallback(
    async (nextUrl?: string) => {
      if (!isTauri()) return;
      const content = contentRef.current;
      if (!content) return;
      const rect = measureElementRect(content);
      if (!rect) return;
      await browserReportFrame(
        paneId,
        nextUrl ?? currentRef.current,
        rect,
        isWebviewVisible(),
      );
    },
    [contentRef, isWebviewVisible, paneId],
  );

  const scheduleSync = useCallback(() => {
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => {
      void reportFrame().catch(console.error);
    }, 16);
  }, [reportFrame]);

  const navigate = useCallback(() => {
    const next = normalizeBrowserUrl(url);
    currentRef.current = next;
    setUrl(next);
    setFrameUrl(next);
    if (!isTauri()) return;
    setLoading(true);
    void browserNavigate(paneId, next)
      .catch(() => reportFrame(next))
      .catch(console.error);
  }, [paneId, reportFrame, url]);

  const back = useCallback(() => {
    if (isTauri()) {
      browserBack(paneId).catch(console.error);
    }
  }, [paneId]);

  const forward = useCallback(() => {
    if (isTauri()) {
      browserForward(paneId).catch(console.error);
    }
  }, [paneId]);

  const reload = useCallback(() => {
    if (isTauri()) {
      setLoading(true);
      browserReload(paneId).catch(console.error);
    }
  }, [paneId]);

  const toggleDevtools = useCallback(() => {
    if (isTauri()) {
      browserToggleDevtools(paneId).catch(console.error);
    }
  }, [paneId]);

  useEffect(() => {
    const next = normalizeBrowserUrl(initialUrl);
    currentRef.current = next;
    setUrl(initialUrl);
    setFrameUrl(next);
  }, [initialUrl]);

  useEffect(() => {
    if (!isTauri()) return;

    let active = true;
    void browserDetach(paneId)
      .catch(() => {})
      .finally(() => {
        if (!active) return;
        requestAnimationFrame(() => {
          requestAnimationFrame(() => scheduleSync());
        });
      });

    return () => {
      active = false;
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
      void browserDetach(paneId).catch(console.error);
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
    const unlisten = onBrowserLoading(({ paneId: eventPaneId, loading: next }) => {
      if (eventPaneId === paneId) setLoading(next);
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

  return { url, setUrl, frameUrl, navigate, back, forward, reload, toggleDevtools, loading };
}
