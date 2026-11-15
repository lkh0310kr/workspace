# Hardware blink fixture

Phase 63 fixture for the Arduino Uno D13 GPIO boundary.

- `hardware-sim.json`: D13 → 220Ω → LED → GND
- `firmware/blink/blink.ino`: Arduino CLI-compatible source sketch
- `firmware/blink/blink.ino.hex`: Uno build used by avr8js when a compiler is unavailable
- `gpio-timeline.json`: recorded delegate output used by deterministic Rust CI
- `runtime.expected.json`: stable Phase 64 state after replaying one second

The recorded timeline isolates the circuit contract from avr8js and the
compiler. The real sidecar must emit the same board-local `D13` events.

The checked-in hex was generated from the adjacent source with Arduino CLI
1.5.1, `arduino:avr:uno`, and Arduino AVR core 1.8.8.

Phase 65 treats that adjacent hex as an offline startup fallback. Saving the
connected `.ino` runs Arduino CLI and atomically publishes the new artifact to
`build/hardware-sim/firmware.hex`; diagnostics and its checksum are written to
`build/hardware-sim/build-result.json` before the Rust/avr8js generation restarts.
