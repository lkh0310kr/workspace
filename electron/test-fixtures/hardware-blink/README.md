# Hardware blink fixture

Phase 63 fixture for the Arduino Uno D13 GPIO boundary.

- `hardware-sim.json`: D13 → 220Ω → LED → GND
- `firmware/blink.ino`: intended source firmware
- `gpio-timeline.json`: recorded delegate output used by deterministic Rust CI

The recorded timeline isolates the circuit contract from avr8js and the
compiler. The real sidecar must emit the same board-local `D13` events.
