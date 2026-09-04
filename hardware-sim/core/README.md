# hardware-sim-core

Rust simulation truth for AI-readable Hardware-as-Code. Electron will remain a
thin shell; MCU emulators such as avr8js will later exchange pin events with
this crate.

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

Planning: [`docs/planning/hardware-sim-phase-plan.md`](../../docs/planning/hardware-sim-phase-plan.md).
