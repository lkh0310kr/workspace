# Hardware Simulator — Arduino Uno learning-lab roadmap

**방향:** Tinkercad Circuits의 SKU 개수를 복제하지 않는다. Arduino Uno 학습 회로가
실제 펌웨어로 동작하고, AI가 회로·빌드·런타임을 파일로 읽을 수 있는지를 동급 기준으로
삼는다. Hardware-as-Code가 authoring truth이고 Electron은 orchestration/view다.

## 현재 기준선

Phase 60–65가 제공하는 것:

- `hardware-sim.json` v1, Rust validation/digital circuit/runtime dump
- button/LED 및 Uno D13 Blink
- avr8js ATmega328P delegate
- firmware save → Arduino CLI compile → generation-safe restart
- build 결과 `build/hardware-sim/build-result.json`

현재 한계:

- component catalog는 `catalog.rs`의 세 match arm
- avr8js bridge는 D13 output만 관찰
- circuit → MCU input, ADC, PWM aggregate, USART/I2C/SPI가 없음
- 전압·전류·정격·transient solver가 없음
- pane은 고정된 한 줄 회로 표현

선택 Phase 66 World Engine overlay는 이 로드맵의 선행 조건이 아니다.

## 완료 기준

“Tinkercad급”은 아래 golden lessons가 동일 firmware, 동일 stimulus에서 결정론적으로
통과할 때 성립한다.

1. Blink 및 PWM LED fade
2. external button + `INPUT_PULLUP` + interrupt
3. potentiometer → `analogRead` → PWM + Serial
4. servo sweep
5. HC-SR04 distance pulse
6. TMP36와 DHT22 read
7. HD44780 LCD “Hello World”
8. WS2812B/NeoPixel color sequence
9. 74HC595 shift-out
10. L293D DC motor direction/speed
11. RC transient + oscilloscope + multimeter

각 lesson은 source `.ino`, HaC, stimulus timeline, expected runtime/trace를 함께 가진다.

## Phase 70 — Unit-safe catalog foundation

**목표:** 부품 하나를 추가할 때 Rust의 catalog/validate/circuit 세 파일에 새 match arm을
넣지 않도록 한다.

- `catalog-data/boards/*.json`, `catalog-data/parts/*.json`을 Rust binary에 embed
- `BoardDefinition`: pins, rails, capabilities, MCU port map, electrical ratings
- `PartDefinition`: pins, params, ratings, behavior ID, runtime state schema, provenance
- `Quantity`: value, unit, optional min/typ/max; 내부 계산은 dimension-safe SI quantity
- v1 loader 유지. `params.ohm: 220`은 legacy shorthand로 220 Ohm으로 migration
- unknown behavior/type, 잘못된 dimension, min/max 역전, 출처 누락을 contract error로 고정

기본 unit allowlist:

`V`, `A`, `Ohm`, `F`, `H`, `W`, `Hz`, `s`, `degC`, `percentRH`, `lux`, `m`.
표시 prefix(mV, kOhm, uF 등)는 parse 후 SI로 정규화한다.

## Phase 71 — Uno MCU parity

**목표:** Uno의 Arduino core I/O가 외부 회로와 양방향으로 연결된다.

- Port B/C/D 전체를 D0–D13, A0–A5에 mapping
- DDR/PORT/PIN semantics: input, output, high-impedance, internal pull-up
- circuit가 digital input과 pin-change/external interrupt를 구동
- Timer0/1/2 PWM edge와 duty trace
- ATmega328P 10-bit ADC에 0–AREF voltage 주입
- built-in D13 LED, reset, 5V/3V3/GND/AREF capability 정리

`digitalRead`, `digitalWrite`, `pinMode`, `analogRead`, `analogWrite`,
`attachInterrupt` fixture가 완료 조건이다.

## Phase 72 — Netlist and mixed-signal kernel

**목표:** 디지털 reachability를 보존하면서 Arduino 학습에 필요한 기본 전기량을 푼다.

- pair connections를 explicit net으로 canonicalize
- net voltage, branch current, logic threshold, contention/over-current runtime
- R/C, independent source, switch, diode/LED, BJT의 DC/transient subset
- MCU와 solver를 기본 1 ms slice로 co-simulate; edge-sensitive device는 더 이른 event를 요청
- ADC는 slice 마지막 voltage를 주입하고 PWM은 edge trace와 averaged value를 모두 유지

범용 SPICE를 새로 작성하지 않는다. BSD-3-Clause Rust `thevenin`을 ngspice golden
circuits와 비교해 다음 gate를 모두 통과할 때만 in-process backend로 채택한다.

- R/R-C/diode/BJT 20개 회로가 ngspice 대비 명시 tolerance 이내
- non-convergence가 structured error이며 NaN을 runtime에 내보내지 않음
- 100-node, 10초 simulated lesson이 interactive budget 안에 들어옴

불합격 시 mature ngspice를 persistent delegate/oracle로 사용한다. backend는
`ElectricalSolver` 경계 뒤에 두어 HaC와 RuntimeState를 바꾸지 않는다.

## Phase 73 — Core learning parts

행동 family 단위로 구현한다. 색상·크기 variant는 catalog data로 처리한다.

- topology: breadboard, wire, connector
- passive: resistor, capacitor, potentiometer, LDR
- switch: pushbutton, toggle, slide, DIP
- semiconductor: rectifier diode, LED, RGB LED, NPN transistor
- source: battery, regulated DC source, ground
- analog sensor: TMP36
- output: piezo/passive buzzer

각 부품은 pin contract, params/rating validation, behavior test, burnout warning,
runtime state, one golden fixture를 가진다.

## Phase 74 — Protocols and instruments

- USART TX/RX와 baud-aware Serial Monitor
- SPI mode/clock/select trace
- TWI/I2C address/arbitration/ACK의 Uno master subset
- timing-sensitive single-wire device를 위한 edge scheduler
- multimeter: DC voltage/current/resistance
- oscilloscope: sampled channels, trigger, timebase
- logic analyzer: digital edge trace + UART/I2C/SPI decode
- function generator: DC/sine/square/triangle source

계측기는 circuit truth를 수정하지 않고 timestamped trace를 구독한다.

## Phase 75 — Sensors and actuators

- HC-SR04: distance parameter → 10 us trigger/echo pulse
- PIR: motion stimulus + hold time
- DHT22/AM2302: temperature/humidity → 40-bit timing protocol
- SG90: pulse width → target/current angle
- DC motor: voltage/PWM → direction/speed/current approximation
- relay: coil state, contact topology, flyback validation

현실 환경값은 component params가 아니라 replay 가능한 `stimulus` event로 변경한다.

## Phase 76 — Displays, logic, and drivers

- 7-segment common-anode/common-cathode
- HD44780 LCD1602 4/8-bit command/DDRAM/CGRAM subset
- WS2812B single-wire chain
- matrix keypad
- 74HC595/74HC165 shift registers
- L293D H-bridge
- LM358 educational macro-model

화면 결과도 `components[id].state`에 문자, segment, pixel, angle 등을 먼저 기록하고
renderer는 그 상태만 그린다.

## Phase 77 — Catalog-driven simulator pane

- 고정 button/LED strip을 part renderer/control registry로 교체
- component list, pins, state, stimulus controls, diagnostics 표시
- MIT `wokwi-elements`를 visual-only adapter로 사용 가능
- layout은 additive HaC metadata이며 Rust electrical truth와 분리

simulation-first 범위에서는 drag/drop schematic authoring을 완료 조건으로 두지 않는다.

## Phase 78 — Distribution and parity

- macOS/Windows/Linux에 Rust binary, avr8js sidecar, Arduino CLI + pinned AVR core stage
- analog backend와 license/NOTICE 포함
- build cache invalidation: source, board FQBN, core/library versions, flags의 content hash
- golden lesson CI, deterministic replay, performance budget, crash/orphan process test
- headless CLI와 pane이 같은 runtime/build artifacts를 소비하는지 확인

## 오픈소스 사용 경계

- `wokwi/avr8js` (MIT): MCU/peripheral delegate. 이미 사용 중.
- `wokwi/wokwi-elements` (MIT): Phase 77 visual only.
- `davidmonterocrespo24/velxio` (AGPL): compiler UX, part registry, mixed-signal
  slicing을 구조 참고/교차검증만 하고 코드를 복사하지 않는다.
- `ngspice/ngspice` (modified BSD 중심): analog oracle/delegate 후보. pinned revision의
  `COPYING`을 packaging 전에 다시 audit한다.
- `cramt/thevenin` (BSD-3-Clause): Rust 후보지만 2026년 초기 프로젝트이므로 Phase 72
  qualification gate 없이는 채택하지 않는다.

## Promotion rule

새 부품은 다음 순서로만 `supported`가 된다.

1. datasheet source와 추출 section 고정
2. unit-safe spec validation
3. behavior contract + invalid/warning cases
4. firmware integration fixture
5. runtime snapshot/trace
6. renderer adapter

시각 요소만 있거나 pin 이름만 등록된 부품은 `visual_only` 또는 `catalog_only`로 표시하며
지원 부품 수에 포함하지 않는다.
