# Hardware Simulation — Phase Plan (AI-native, Hardware-as-Code)

**Status:** Active planning (2026-09-03)  
**North star:** 터미널의 AI 에이전트가 **회로·펌웨어를 읽고 → 고치고 → 컴파일 → 시뮬 → 핀/디바이스 상태로 디버그**할 수 있는 **코드 기반 하드웨어 랩**.  
**Workspace 역할:** 오케스트레이션만 (파일 열기, spawn, live reload, 로그). CAD 트랙과 동일.  
**관련:** [world-engine-simulation.md](./world-engine-simulation.md) · [cad-orchestration-phase-plan.md](./cad-orchestration-phase-plan.md) · [09-future-native-architecture.md](../architecture/09-future-native-architecture.md) · TODO `j-1`/`j-2` (설계 vs 시뮬, 자급자족 랩)

초안 스펙(Arduino + avr8js + Hardware-as-Code)은 **참고 인벤토리**다. 이 문서는 우리 코드베이스 원칙에 맞춰 **재결정**한 실행 계획이다.

**모델 정렬:** 회로는 새 우주가 아니라 Core Model의 **Graph + Resource + Time/State** 조합이다. 도구끼리 직접 연결하지 않는다. [10-core-model.md](../architecture/10-core-model.md) · [08-context-modeling.md](../architecture/08-context-modeling.md).

**첫 목표 H0 — 버튼으로 LED 켜기/끄기**

```
Arduino Uno 5V → 220Ω resistor → LED → momentary button → GND
```

- ✅ H0.1 Rust vertical slice: JSON load, validate, digital circuit, runtime dump, persistent JSONL process.
- ✅ H0.2 Workspace interaction: `hardware-sim.json` 열기 → 버튼 누름/뗌 → LED 표시.
- MCU/펌웨어는 H0가 아니다. H0가 UI까지 닫힌 뒤 Phase 63에서 avr8js를 붙인다.

---

## 0. 결정 (한 줄)

| 질문 | 결정 | 이유 |
|------|------|------|
| World Engine에 넣을까? | **넣지 않는다** | WE는 Rapier 고정 `dt` + Transform/물리. MCU는 **클럭 사이클·ns**, 상태는 **핀 전압/논리**. 도메인 키를 엔진에 넣지 않는다는 WE 계약과 충돌. |
| TypeScript가 커널인가? | **아니다** | 시뮬 진실은 `native/` Rust 계약 + headless test. Electron은 spawn/IPC/뷰. |
| Rust가 맞는가? | **맞다 — 회로·HaC·런타임만** | `world-engine-core`와 같은 패턴. AVR ISA를 Rust로 재구현하지는 않음. |
| MCU 백엔드 | **avr8js delegate** | 초안이 맞음. Wokwi 계열 검증된 AVR8. v1에서 cycle-accurate AVR을 직접 짜지 않는다. |
| AI 연동 | **전용 에이전트 없음** | CAD 뷰어와 같음: 터미널 Claude Code가 파일을 씀 → 시뮬이 reload/재실행. |

```
Workspace (Electron)  —  TreeView, PTY, live preview, spawn
        │
        ├── hardware-sim-core (Rust)     HaC load · validate · circuit step · runtime dump
        ├── avr8js sidecar (Node)        MCU + GPIO 샘플 → 코어로 핀 이벤트
        └── (나중) World Engine          시설 씬에서 LED 밝기 등 properties 소비만
```

---

## 1. 왜 World Engine이 아닌가

이미 있는 것:

- `native/world-engine-core`: wgpu + Rapier + hecs + Rhai, `World::step()`, `sim_var`, pick, save.
- 계약: **엔진 스키마에 도메인 필드 금지** (`feed_stock` 같은 키는 fixture 프로젝트 `properties`/`sim_var`).
- CAD 오케스트레이션: 공간 배치·메시·시설 시뮬. 전기가 아님.

Hardware 시뮬이 다른 점:

| | World Engine | Hardware sim |
|--|--------------|--------------|
| 시계 | 고정 물리 `dt` (예: 1/60s) | MCU 사이클 + 회로 이산 사건 (`time_ns`) |
| 상태 | Transform, velocity, `sim_var` | Pin High/Low/HiZ, 컴포넌트 파라미터 |
| 코드 | Rhai 정책 | **Arduino/C 펌웨어 → 머신코드** |
| 실패 모드 | 충돌, 떨어짐 | 단락, 핀 정격, 컴파일 에러 |

닭장 **기구**는 WE. 닭장 **컨트롤러 보드**(릴레이·온습도·펌웨어)는 이 트랙. 나중에 WE 엔티티 `properties.led_on` ← hardware runtime 브리지는 **Phase 66**, 커널 합병이 아님.

---

## 2. 왜 TypeScript 커널이 아닌가

avr8js는 JS라 MCU **한 조각**은 Node sidecar가 맞다. 그걸 이유로 회로 그래프·제약·결정론적 dump를 `electron/`에 두면:

- headless `*_contract.rs` / `cargo test` 패턴이 깨짐 (WE·CAD가 이미 이 축).
- 렌더러가 시뮬 진실이 됨 — 09-native 문서의 “Electron은 얇은 셸”과 반대.
- 바이브 코딩 루프는 **파일 + stdout JSON**이면 충분. React 회로 에디터는 v1 비목표.

**TypeScript가 하는 일 (허용):** sidecar 프로세스, IPC, 나중에 schematic/파형 pane, Model Viewer식 live reload UI.

---

## 3. 우리가 소유 vs delegate

CAD Phase 50 표의 하드웨어 판.

| 소유 | Delegate | 비목표 (v1) |
|------|----------|-------------|
| `hardware-sim.json` 스키마·로드 | avr8js (AVR8 MCU) | SPICE 아날로그, KiCad 재구현 |
| 연결 그래프, 디지털 이산 사건 | avr-gcc / arduino-cli 컴파일 | ARM/ESP32 전 칩 |
| 제약 검사 (전류, 필수 저항) | (나중) simavr/QEMU | 풀 GUI 스키매틱 에디터 |
| Runtime dump (AI가 읽는 JSON) | | World Engine에 GPIO 필드 추가 |

참고 제품: [Wokwi](https://wokwi.com) (Arduino + 회로 웹 시뮬). 베끼기 시 `ref-proj/`에 clone. 아키텍처는 WE처럼 **우리 스키마 + 우리 계약 테스트**.

---

## 4. 초안 스펙을 어떻게 줄이는가

초안의 `HardwareModel` Rust는 **카탈로그**로 유용하다 (핀 capability, ConstraintRule, ComponentType). v1 스키마에 전부 넣지 않는다.

WE와 맞춘 **얇은 진실**:

| 층 | 포맷 | 역할 |
|----|------|------|
| Authoring | `hardware-sim.json` (또는 `.yaml`) | Board + components + nets |
| Firmware | `firmware/*.ino` 등 | 에이전트가 고치는 소스 |
| Build | `build/` hex/elf | 컴파일러 산출 (gitignore 가능) |
| Runtime | ndjson / `runtime.json` | `time_ns`, pins, components — AI 디버그 |
| (나중) 시설 | `world-engine.json` `properties` | 시각화만 |

v1 JSON 최소 예 (`connections` = Graph; `firmware` = Resource; ids = Entity):

```json
{
  "version": 1,
  "board": { "id": "uno", "type": "arduino-uno" },
  "components": [
    { "id": "r1", "type": "resistor", "params": { "ohm": 220 } },
    { "id": "led1", "type": "led" }
  ],
  "connections": [
    { "from": "uno.D13", "to": "r1.a" },
    { "from": "r1.b", "to": "led1.a" },
    { "from": "led1.k", "to": "uno.GND" }
  ],
  "firmware": "firmware/blink.ino"
}
```

`type`은 문자열(+ allowlist 검사). `ComponentType` enum 전 목록은 **라이브러리 테이블**로 승격할 때만 Rust enum이 된다. `Custom(String)`을 처음부터 열어둠.

Firmware / SimulationConfig / RuntimeState 초안 구조는 **방향이 맞음** — 구현은 crate 모듈로 쪼개고, PinRef를 HashMap 키로 쓰려면 초안처럼 `PinRefKey`가 필요.

---

## 5. 시스템 흐름 (확정)

```
AI Agent (terminal)
   ↓  edit hardware-sim.json + firmware
Validate (Rust) → Compile (arduino-cli) → Load hex (avr8js)
   ↓
Loop: MCU step ↔ GPIO events ↔ circuit discrete-event
   ↓
Runtime dump (stdout / file)
   ↓
AI Agent reads dump · human sees optional pane later
```

MCU와 회로의 접합은 **핀 샘플 레이트** 계약 하나:

- avr8js가 GPIO 변경 시 이벤트 `{ t_ns, pin, level }`
- 코어가 넷을 전파, LED 등 디바이스 상태 갱신
- 버튼/센서는 코어가 MCU 핀을 구동 (입력)

아날로그 ADC는 v1 스텁(`unknown`) 가능. PWM은 디지털 평균 또는 “너무 빠름 → 밝기 파라미터” 중 하나로 **문서화 후** 고른다.

---

## 6. 코드 위치 (아직 생성하지 않음)

| 경로 | 역할 | 대응 |
|------|------|------|
| `native/hardware-sim-core/` | HaC, validate, circuit, dump | `world-engine-core` |
| `native/hardware-sim-cli/` 또는 core `examples/` | headless `step` / dump | `cargo run --example chase` |
| `electron/src/main/hardwareSim.ts` | persistent JSONL process (H0.2) | `worldEngine.ts` |
| `electron/test-fixtures/hardware-button-led/` | 첫 프로젝트 | `world-engine-chicken-coop-demo` |

Electron pane은 H0.2에서 **버튼 + LED만** 구현한다. 범용 스키매틱 에디터는 Phase 65 이후다. 회로 동작은 TypeScript로 복제하지 않고 JSONL을 통해 Rust 코어만 호출한다.

---

## 7. Phase 60+

CAD가 50번대라 하드웨어는 **60번대**. 병행 가능. 착수는 CAD 52를 막지 않음 — 다른 crate.

```
60 스키마·로드  →  61 validate
  →  62 디지털 회로 → 62.5 버튼/LED pane (H0 완료)
  →  63 avr8js + GPIO 브리지
  →  64 dump 계약 + blink fixture
  →  65 live reload (펌웨어 저장)
  →  66 (선택) WE properties 브리지
```

### Phase 60 — Hardware-as-Code contract

**상태:** ✅ DONE (2026-09-03)
**목표:** JSON 로드 + Rust 타입. 초안 전체 enum 복붙 금지.

| IN | OUT |
|----|-----|
| `hardware-sim.json` schema (version 1) | KiCad / Fritzing import |
| `HardwareProject { board, components, connections, firmware }` | MCU 실행 |
| fixture 1: 5V + resistor + LED + button | |

**산출물:** `hardware_load_contract.rs`  
**완료 기준:** 잘못된 JSON은 에러, blink fixture round-trip (필드 안정).

---

### Phase 61 — Validate

**상태:** ✅ DONE (H0 구조 검사 + POWER_GROUND_SHORT, 2026-09-03)  
**목표:** AI가 고치기 **전**에 실패를 기계가 말함.

최소 규칙:

- ✅ 넷에 GND/VCC 단락 없음 (`POWER_GROUND_SHORT`: 전선·닫힌 버튼. 저항은 부하로 허용)
- ✅ LED anode가 저항을 거쳐 전원에 연결
- ✅ LED cathode가 (닫힌 버튼을 포함한 경로로) GND에 연결
- ✅ 보드/컴포넌트 핀 이름 존재
- ✅ 디지털 출력 capability 검사 (`LED_OUTPUT_CAPABILITY_REQUIRED`)

**산출물:** `hardware_validate_contract.rs` — 고의 불량 fixture → 에러 코드.  
**완료 기준:** 에이전트가 에러 JSON만 보고 회로를 고칠 수 있음 (문구는 프로젝트, 코드는 코어).

---

### Phase 62 — Digital circuit (no MCU)

**상태:** ✅ DONE (H0.1, 2026-09-03)  
**목표:** 물리 버튼 open/closed → LED state.

이산 사건: 넷 논리, 저항은 v1에서 **존재 여부만** (옴의 법칙 전량은 나중).  
초안 `PinState { High, Low, HighImpedance, Unknown }` 유지.

**산출물:** `circuit_contract.rs`  
**완료 기준:** `button1=false → led1.on=false`; press → true; release → false. `time_ns`와 상태 JSON 결정론.

---

### Phase 62.5 — Interactive button/LED pane (H0.2)

**상태:** ✅ DONE (2026-09-03)  
**목표:** `hardware-sim.json`을 열고 Workspace에서 버튼을 누르면 Rust runtime의 LED가 켜짐.

| IN | OUT |
|----|-----|
| main: `hardware-sim` persistent JSONL child | TypeScript 회로 계산 |
| preload IPC: start / set_button / runtime / stop | 범용 스키매틱 편집 |
| renderer: button + LED + validation/runtime 상태 | MCU / firmware |

**완료 기준:** pointer down/up이 Rust `SetButton`으로 전달되고 runtime `led1.on` 표시가 따라옴. pane dispose 시 child 종료.

---

### Phase 63 — MCU delegate (avr8js)

**상태:** ✅ DONE (2026-09-03)
**목표:** blink.ino → hex → GPIO 토글이 회로에 들어옴.

| IN | OUT |
|----|-----|
| Node sidecar, hex 경로, 핀 이벤트 IPC/stdout | in-process V8 in Rust |
| 코어는 이벤트만 소비 | 자체 AVR 디코더 |

**산출물:** `mcu_bridge_contract` 녹화 타임라인 + 실제 avr8js/Uno hex sidecar + Electron runtime push.
**완료 기준:** 녹화 타임라인으로 LED 주기 assert. 실제 `blink.ino.hex`가 D13을 약 500ms마다 토글하고 Workspace LED가 Rust runtime 상태로 점멸.

`arduino-cli`가 없는 환경에서도 재현되도록 Uno hex fixture를 체크인했다. fixture hex는 Arduino CLI 1.5.1 + Arduino AVR core 1.8.8로 인접 `blink.ino`에서 생성.

---

### Phase 64 — Runtime dump (AI debug surface)

**상태:** 🟨 IN PROGRESS (JSONL + blink runtime state 완료)
**목표:** 초안 `RuntimeState`를 **파일/stdout**으로. 에이전트가 `cat` / 로그로 읽음.

필드: `time_ns`, pins, component states. 도메인 문자열 키는 fixture `state` 맵 (WE `sim_var`와 같은 범용 슬롯). H0에서 `hardware-sim` stdin/stdout JSONL 계약까지 구현.

**산출물:** `runtime_dump_contract.rs`  
**완료 기준:** blink 1초 상당 step 후 dump 스냅샷 안정 (결정론: 동일 hex + 동일 시드/이벤트).

---

### Phase 65 — Live loop (vibe)

**상태:** ⬜ PENDING  
**목표:** 펌웨어 저장 → 재컴파일 → 시뮬 재시작. Model Viewer `fs:changed`와 같은 UX.

**산출물:** Electron spawn 또는 cli `--watch`  
**완료 기준:** 터미널에서 delay 바꾸면 dump/로그 주기가 바뀜.

---

### Phase 66 — World Engine overlay (선택)

**상태:** ⬜ PENDING  
**목표:** 시설 씬 엔티티 `properties` / `sim_var`에 LED·릴레이만 투영. **전기 커널을 WE에 넣지 않음.**

---

## 8. 비목표

- 초안 전체를 `hardware_model.rs` 한 파일로 커밋하고 “구현 완료”로 치기
- Electron renderer에서 회로를 돌리기
- World Engine `step()` 안에 AVR 돌리기
- SPICE, 고주파 PCB, 멀티보드 산업 툴
- 전용 “AI Agent” 프로세스 (터미널이 에이전트)

---

## 9. TODO / 제품 맥락

- **j-1 / j-2:** 시뮬은 공부·검증용, 설계(HaC+펌웨어)가 본체. 시각화는 나중.
- 데이터시트 크롤링(TODO 상단)은 이 트랙의 **컴포넌트 라이브러리**로 나중에 붙일 수 있음. v1은 내장 allowlist.
- 닭장: WE = 공간·물리, Hardware sim = 컨트롤러. 둘 다 “자급자족 랩”.

---

## 10. 다음 액션

1. Phase 64: blink 1초 runtime dump snapshot + CLI dump 명령/파일 계약.
2. `hardware-sim` + avr8js sidecar packaging (macOS/Windows/Linux).
3. Phase 65: 펌웨어 저장 → arduino-cli 재컴파일 → 시뮬 재시작.

---

## 11. 변경 이력

| 날짜 | 내용 |
|------|------|
| 2026-09-03 | Phase 63 DONE: avr8js Uno Blink → D13 GPIO → Rust circuit → Electron LED runtime push. |
| 2026-09-03 | Phase 61: `POWER_GROUND_SHORT` (전선·닫힌 버튼; 저항은 단락 아님). |
| 2026-09-03 | H0.2 DONE: Electron persistent child + pointer button + Rust runtime LED pane. |
| 2026-09-03 | H0.1 DONE: Rust load/validate/circuit/runtime + button→LED fixture + JSONL process. |
| 2026-09-03 | Core Model 정렬: Graph/Resource/Entity 조합, [10-core-model.md](../architecture/10-core-model.md) |
| 2026-09-03 | 트랙 신설. WE 비합류, TS 커널 거부, Rust 코어 + avr8js delegate. |
