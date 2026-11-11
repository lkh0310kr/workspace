import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { EDITOR_NOTIFICATION_EVENT, type EditorNotificationDetail } from "@workspace/editor";

interface ToastItem extends EditorNotificationDetail {
  id: number;
}

/** App-wide toast host for notifications emitted by shared editor surfaces. */
export function GlobalToastViewport() {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  useEffect(() => {
    const timers = new Set<number>();
    const onNotification = (event: Event) => {
      const detail = (event as CustomEvent<EditorNotificationDetail>).detail;
      if (!detail || typeof detail.message !== "string") return;
      const id = ++nextId.current;
      setItems((current) => [...current, { ...detail, id }].slice(-3));
      const timer = window.setTimeout(() => {
        timers.delete(timer);
        setItems((current) => current.filter((item) => item.id !== id));
      }, 2600);
      timers.add(timer);
    };
    window.addEventListener(EDITOR_NOTIFICATION_EVENT, onNotification);
    return () => {
      window.removeEventListener(EDITOR_NOTIFICATION_EVENT, onNotification);
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, []);

  if (!items.length) return null;
  return createPortal(
    <div className="app-toast-viewport" role="region" aria-label="Notifications" aria-live="polite" aria-relevant="additions text">
      {items.map((item) => (
        <div key={item.id} className={`app-toast app-toast--${item.kind}`} role="status">
          {item.message}
        </div>
      ))}
    </div>,
    document.body,
  );
}
