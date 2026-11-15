# Hardware 깜박임 fixture

Arduino Uno D13 GPIO 경계의 Phase 63 fixture입니다.

- `hardware-sim.json`: D13 → 220Ω → LED → GND
- `firmware/blink/blink.ino`: Arduino CLI-compatible source sketch
- `firmware/blink/blink.ino.hex`: Uno build used by avr8js when a compiler is unavailable
- `gpio-timeline.json`: recorded delegate output used by deterministic Rust CI
- `runtime.expected.json`: stable Phase 64 state after replaying one second

기록된 타임라인은 회로 계약을 avr8js 및 compiler와 분리합니다. 실제 sidecar도 같은 board-local `D13` 이벤트를 내보내야 합니다.

저장소에 포함된 hex는 인접한 source에서 Arduino CLI 1.5.1, `arduino:avr:uno`, Arduino AVR core 1.8.8로 생성했습니다.

Phase 65는 인접한 hex를 오프라인 시작 대체 경로로 사용합니다. 연결된 `.ino`를 저장하면 Arduino CLI를 실행하고 새 artifact를 `build/hardware-sim/firmware.hex`에 원자적으로 게시합니다. 진단 결과와 checksum은
Rust/avr8js generation을 재시작하기 전에 `build/hardware-sim/build-result.json`에 기록됩니다.
