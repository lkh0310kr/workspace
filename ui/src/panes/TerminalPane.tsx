import { memo, useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { onPtyOutput, ptyResize, ptyWrite } from "../tauri";

interface Props {
  terminalId: number;
  active: boolean;
}

function TerminalPaneInner({ terminalId, active }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      theme: {
        background: "#0d0d0d",
        foreground: "#d4d4d4",
        cursor: "#d4d4d4",
        selectionBackground: "#1c2430",
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);
    termRef.current = term;
    fitRef.current = fit;

    const syncSize = () => {
      fit.fit();
      ptyResize(terminalId, term.cols, term.rows).catch(console.error);
    };

    term.onData((data) => {
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

    return () => {
      host.removeEventListener("mousedown", focusTerm);
      window.removeEventListener("resize", syncSize);
      resizeObserver.disconnect();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, [terminalId]);

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

  return (
    <div
      className="terminal-host"
      ref={hostRef}
      tabIndex={0}
      onFocus={() => termRef.current?.focus()}
    />
  );
}

export const TerminalPane = memo(TerminalPaneInner);
