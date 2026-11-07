# hardware-sim-core

Rust simulation truth for AI-readable Hardware-as-Code. The core validates the
project, runs the button/LED circuit and consumes GPIO events. Workspace can
connect an avr8js Uno emulator through the persistent process bridge.

The first vertical slice is a physical momentary button circuit:

```text
Arduino Uno 5V → 220Ω resistor → LED → button → GND
```

The LED is off when the button is open and on while it is pressed.

```bash
cargo test
cargo run --example button_led
cargo run --bin hardware-sim -- \
  ../../apps/workspace/test-fixtures/hardware-blink/hardware-sim.json \
  --replay-gpio ../../apps/workspace/test-fixtures/hardware-blink/gpio-timeline.json \
  --dump-stdout
```

The example emits stable JSON runtime snapshots for released → pressed →
released. Opening `apps/workspace/test-fixtures/hardware-button-led/hardware-sim.json`
in Workspace renders the first interactive button/LED pane. That pane speaks
JSONL to the persistent `hardware-sim` process; it does not duplicate circuit
behavior in TypeScript.

For headless AI debugging, `--dump-stdout` emits the direct `RuntimeState` JSON
and `--dump <runtime.json>` publishes the same stable snapshot to a replaceable
file. `--replay-gpio` deterministically applies a recorded MCU event timeline
before dumping.

The current scope is tracked in [`docs/planning/feature-status.md`](../../docs/planning/feature-status.md); implementation lives in this crate and the Workspace adapter.
