# hardware-sim-core

AI가 읽을 수 있는 Hardware-as-Code를 위한 Rust 시뮬레이션 기준 구현입니다. 코어는 프로젝트를 검증하고 버튼/LED 회로를 실행하며 GPIO 이벤트를 처리합니다. Workspace는 지속 실행 프로세스 브리지를 통해 avr8js Uno emulator와 연결할 수 있습니다.

첫 번째 end-to-end 기능은 물리적 momentary button 회로입니다.

```text
Arduino Uno 5V → 220Ω resistor → LED → button → GND
```

버튼이 열려 있을 때 LED는 꺼지고, 누르는 동안 켜집니다.

```bash
cargo test
cargo run --example button_led
cargo run --bin hardware-sim -- \
  ../../apps/workspace/test-fixtures/hardware-blink/hardware-sim.json \
  --replay-gpio ../../apps/workspace/test-fixtures/hardware-blink/gpio-timeline.json \
  --dump-stdout
```

예제는 released → pressed → released 상태의 안정적인 JSON runtime snapshot을 출력합니다. `apps/workspace/test-fixtures/hardware-button-led/hardware-sim.json`을 열면 Workspace에서 첫 대화형 버튼/LED pane을 표시합니다. pane은 지속 실행되는 `hardware-sim` 프로세스와 JSONL로 통신하며 회로 로직을 TypeScript에서 중복 구현하지 않습니다.

headless AI 디버깅에서 `--dump-stdout`은 `RuntimeState` JSON을 직접 출력합니다. `--dump <runtime.json>`은 같은 안정적 스냅샷을 교체 가능한 파일에 기록합니다. 덤프 전에 `--replay-gpio`로 기록된 MCU 이벤트 타임라인을 결정적으로 재생할 수 있습니다.

현재 범위는 [`docs/planning/feature-status.md`](../../docs/planning/feature-status.md)에서 추적합니다. 구현은 이 crate와 Workspace adapter에 있습니다.
