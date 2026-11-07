import { useCallback, useEffect, useRef, useState } from "react";
import {
  onHardwareSimRuntime,
  onHardwareSimStatus,
  reloadHardwareSim,
  setHardwareSimButton,
  startHardwareSim,
  stopHardwareSim,
  type HardwareBuildResult,
  type HardwareRuntimeState,
} from "../electron";
import { onFileChanged } from "../fileSystem";
import { classifyHardwareSimChange } from "./hardwareSimWatch";

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
  const pendingRuntimeRef = useRef(new Map<number, HardwareRuntimeState>());
  const pressedRef = useRef(false);
  const [runtime, setRuntime] = useState<HardwareRuntimeState | null>(null);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [firmware, setFirmware] = useState<string | null>(null);
  const [build, setBuild] = useState<HardwareBuildResult | null>(null);
  const [phase, setPhase] = useState<"starting" | "building" | "restarting" | "live" | "build_failed">(
    "starting",
  );
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const unsubscribeRuntime = onHardwareSimRuntime((update) => {
      if (sessionIdRef.current === update.sessionId) {
        setRuntime(update.state);
      } else {
        pendingRuntimeRef.current.set(update.sessionId, update.state);
      }
    });
    const unsubscribeStatus = onHardwareSimStatus((update) => {
      if (sessionIdRef.current !== update.sessionId) return;
      setPhase(update.phase);
      if (update.build) setBuild(update.build);
      if (update.phase === "build_failed" && update.build) {
        setError(update.build.diagnostics.join("\n"));
      }
    });
    setStarting(true);
    setPhase("starting");
    setError(null);
    setRuntime(null);
    setSessionId(null);
    setFirmware(null);
    setBuild(null);
    void startHardwareSim(tabId, filePath)
      .then((result) => {
        if (cancelled) {
          void stopHardwareSim(result.sessionId);
          return;
        }
        sessionIdRef.current = result.sessionId;
        setSessionId(result.sessionId);
        setFirmware(result.firmware);
        setRuntime(pendingRuntimeRef.current.get(result.sessionId) ?? result.state);
        pendingRuntimeRef.current.delete(result.sessionId);
        setPhase("live");
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
      unsubscribeRuntime();
      unsubscribeStatus();
      pendingRuntimeRef.current.clear();
      const sessionId = sessionIdRef.current;
      sessionIdRef.current = null;
      setSessionId(null);
      if (sessionId !== null) void stopHardwareSim(sessionId);
    };
  }, [tabId, filePath]);

  useEffect(() => {
    if (sessionId === null) return;
    let cancelled = false;
    let running = false;
    let pending: ReturnType<typeof classifyHardwareSimChange> = null;
    const priority = { project: 3, "firmware-source": 2, "firmware-hex": 1 } as const;

    const requestReload = async (
      reason: Exclude<ReturnType<typeof classifyHardwareSimChange>, null>,
    ) => {
      if (running) {
        if (!pending || priority[reason] > priority[pending]) pending = reason;
        return;
      }
      running = true;
      let next: typeof pending = reason;
      while (next && !cancelled) {
        const current = next;
        pending = null;
        try {
          const result = await reloadHardwareSim(sessionId, current);
          if (cancelled) return;
          setRuntime(result.state);
          setFirmware(result.firmware);
          if (result.build) setBuild(result.build);
          if (result.status === "build_failed") {
            setPhase("build_failed");
            setError(result.build?.diagnostics.join("\n") ?? "Firmware build failed");
          } else {
            setPhase("live");
            setError(null);
          }
        } catch (reason) {
          if (!cancelled) {
            setPhase("build_failed");
            setError(reason instanceof Error ? reason.message : String(reason));
          }
        }
        next = pending;
      }
      running = false;
    };

    const unsubscribe = onFileChanged((paths) => {
      const reason = classifyHardwareSimChange(filePath, firmware, paths);
      if (reason) void requestReload(reason);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [filePath, firmware, sessionId]);

  const button = firstComponentWithBoolean(runtime, "pressed");
  const led = firstComponentWithBoolean(runtime, "on");
  const busy = phase === "building" || phase === "restarting";
  const phaseLabel = {
    starting: "Starting…",
    building: "Building…",
    restarting: "Restarting…",
    live: "Live",
    build_failed: "Build failed",
  }[phase];

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
          <span>
            Rust core{button ? "" : " + avr8js"} · {runtime.time_ns} ns
            {build?.hexSha256 ? ` · ${build.hexSha256.slice(0, 8)}` : ""}
          </span>
        </div>
        <span
          className={`hardware-sim-live${busy || updating ? " updating" : ""}${
            phase === "build_failed" ? " failed" : ""
          }`}
        >
          {updating && !busy ? "Stepping…" : phaseLabel}
        </span>
      </header>

      <div
        className="hardware-sim-circuit"
        aria-label={button ? "Button controlled LED circuit" : "Firmware controlled LED circuit"}
      >
        {button ? (
          <div className="hardware-sim-rail">5V</div>
        ) : (
          <div className="hardware-sim-firmware">
            <strong>avr8js</strong>
            <span>D13 output</span>
          </div>
        )}
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
        {button ? (
          <button
            type="button"
            className={`hardware-sim-button${button.value ? " pressed" : ""}`}
            aria-pressed={button.value}
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
        ) : null}
        {button ? <div className="hardware-sim-wire" /> : null}
        <div className="hardware-sim-rail ground">GND</div>
      </div>

      <p className="hardware-sim-hint">
        {button
          ? "Hold the button: pointer down/up is sent to the persistent Rust simulator."
          : "Compiled Arduino firmware drives D13; Rust propagates each GPIO event through the circuit."}
      </p>
      {error ? <div className="hardware-sim-inline-error">{error}</div> : null}
    </div>
  );
}
