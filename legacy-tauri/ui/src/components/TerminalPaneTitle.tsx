import { useEffect, useState } from "react";
import { hostname } from "../tauri";

// One process-wide fetch: the hostname can't change while the app is
// running, and every terminal pane header wants it.
let hostnamePromise: Promise<string> | null = null;
function getHostname(): Promise<string> {
  if (!hostnamePromise) hostnamePromise = hostname().catch(() => "localhost");
  return hostnamePromise;
}

function formatClock(d: Date): string {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// Replaces tmux's own status bar (session/hostname/clock, now turned off
// — see tmux_conf_path in pty.rs) with the same info in our own header,
// instead of showing it twice.
export function TerminalPaneTitle() {
  const [host, setHost] = useState("");
  const [clock, setClock] = useState(() => formatClock(new Date()));

  useEffect(() => {
    let cancelled = false;
    getHostname().then((h) => {
      if (!cancelled) setHost(h);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const id = setInterval(() => setClock(formatClock(new Date())), 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <span>
      Terminal{host ? ` — ${host}` : ""} · {clock}
    </span>
  );
}
