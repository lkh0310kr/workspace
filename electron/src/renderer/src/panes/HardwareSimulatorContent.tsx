import { useCallback, useEffect, useRef, useState } from "react";
import {
  setHardwareSimButton,
  startHardwareSim,
  stopHardwareSim,
  type HardwareRuntimeState,
} from "../electron";

interface Props {
  tabId: number;
  filePath: string;
}

function firstComponentWithBoolean(
  runtime: HardwareRuntimeState | null,
  key: string,
): { id: string; value: boolean } | null {
  if (!runtime) return null;
  for (const [id, component] of Object.entries(runtime.components)) {
    const value = component.state[key];
    if (typeof value === "boolean") return { id, value };
  }
  return null;
}

export function HardwareSimulatorContent({ tabId, filePath }: Props) {
  const sessionIdRef = useRef<number | null>(null);
  const pressedRef = useRef(false);
  const [runtime, setRuntime] = useState<HardwareRuntimeState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setStarting(true);
    setError(null);
    setRuntime(null);
    void startHardwareSim(tabId, filePath)
      .then((result) => {
        if (cancelled) {
          void stopHardwareSim(result.sessionId);
          return;
        }
        sessionIdRef.current = result.sessionId;
        setRuntime(result.state);
      })
      .catch((reason) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : String(reason));
        }
      })
      .finally(() => {
        if (!cancelled) setStarting(false);
      });

    return () => {
      cancelled = true;
      const sessionId = sessionIdRef.current;
      sessionIdRef.current = null;
      if (sessionId !== null) void stopHardwareSim(sessionId);
    };
  }, [tabId, filePath]);

  const button = firstComponentWithBoolean(runtime, "pressed");
  const led = firstComponentWithBoolean(runtime, "on");

  const setPressed = useCallback(
    async (pressed: boolean) => {
      if (pressedRef.current === pressed) return;
      pressedRef.current = pressed;
      const sessionId = sessionIdRef.current;
      if (sessionId === null || !button) return;
      setUpdating(true);
      setError(null);
      try {
        setRuntime(await setHardwareSimButton(sessionId, button.id, pressed));
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : String(reason));
      } finally {
        setUpdating(false);
      }
    },
    [button],
  );

  if (starting) {
    return <div className="hardware-sim-status">Starting Rust circuit kernel…</div>;
  }
  if (!runtime) {
    return (
      <div className="hardware-sim-status hardware-sim-error">
        <strong>Hardware simulator could not start</strong>
        <span>{error ?? "Unknown error"}</span>
      </div>
    );
  }

  return (
    <div className="hardware-sim">
      <header className="hardware-sim-header">
        <div>
          <strong>Hardware Simulator</strong>
          <span>Rust core · {runtime.time_ns} ns</span>
        </div>
        <span className={`hardware-sim-live${updating ? " updating" : ""}`}>
          {updating ? "Stepping…" : "Live"}
        </span>
      </header>

      <div className="hardware-sim-circuit" aria-label="Button controlled LED circuit">
        <div className="hardware-sim-rail">5V</div>
        <div className="hardware-sim-wire" />
        <div className="hardware-sim-resistor" title="220 ohm resistor">
          220Ω
        </div>
        <div className="hardware-sim-wire" />
        <div
          className={`hardware-sim-led${led?.value ? " on" : ""}`}
          role="img"
          aria-label={led?.value ? "LED on" : "LED off"}
        >
          <span />
          <small>{led?.value ? "ON" : "OFF"}</small>
        </div>
        <div className="hardware-sim-wire" />
        <button
          type="button"
          className={`hardware-sim-button${button?.value ? " pressed" : ""}`}
          aria-pressed={button?.value ?? false}
          disabled={!button}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            void setPressed(true);
          }}
          onPointerUp={() => void setPressed(false)}
          onPointerCancel={() => void setPressed(false)}
          onLostPointerCapture={() => void setPressed(false)}
          onKeyDown={(event) => {
            if (event.repeat || (event.key !== " " && event.key !== "Enter")) return;
            event.preventDefault();
            void setPressed(true);
          }}
          onKeyUp={(event) => {
            if (event.key !== " " && event.key !== "Enter") return;
            event.preventDefault();
            void setPressed(false);
          }}
        >
          <span />
          Hold button
        </button>
        <div className="hardware-sim-wire" />
        <div className="hardware-sim-rail ground">GND</div>
      </div>

      <p className="hardware-sim-hint">
        Hold the button: pointer down/up is sent to the persistent Rust simulator.
      </p>
      {error ? <div className="hardware-sim-inline-error">{error}</div> : null}
    </div>
  );
}
