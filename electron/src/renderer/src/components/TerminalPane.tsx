import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

// First-pass port of TerminalPane.tsx — just enough to prove the node-pty
// main-process layer actually drives a real, visible xterm.js terminal
// end-to-end. Deliberately not porting the Hangul IME composition
// workarounds yet: those were reverse-engineered against WKWebView's IME
// event model, which Electron (Chromium) may or may not share — needs its
// own live-typing verification once this milestone is confirmed working,
// not carried over blind.
export function TerminalPane(): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null);
  const idRef = useRef<number | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      theme: { background: "#1e1e1e", foreground: "#e0e0e0" },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);
    fit.fit();

    let disposed = false;

    window.api.pty.spawn(term.cols, term.rows).then((id) => {
      if (disposed) {
        window.api.pty.dispose(id);
        return;
      }
      idRef.current = id;
    });

    const offData = window.api.pty.onData((id, data) => {
      if (id !== idRef.current) return;
      term.write(data);
    });

    term.onData((data) => {
      if (idRef.current === null) return;
      window.api.pty.write(idRef.current, new TextEncoder().encode(data));
    });

    const resizeObserver = new ResizeObserver(() => {
      fit.fit();
      if (idRef.current !== null) {
        window.api.pty.resize(idRef.current, term.cols, term.rows);
      }
    });
    resizeObserver.observe(host);

    return () => {
      disposed = true;
      resizeObserver.disconnect();
      offData();
      if (idRef.current !== null) window.api.pty.dispose(idRef.current);
      term.dispose();
    };
  }, []);

  return <div ref={hostRef} style={{ width: "100%", height: "100%" }} />;
}
