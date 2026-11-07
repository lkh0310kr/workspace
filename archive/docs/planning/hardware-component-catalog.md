# Hardware component datasheet and model matrix

이 문서는 simulator catalog에 들어갈 사실의 출처와 추출 범위를 정한다. 검색일은
2026-09-03이다. 링크가 있다는 이유만으로 값이 simulation truth가 되지 않는다.
Phase 70의 source sync가 원문 SHA-256을 기록하고 사람이 page/table을 확인한 뒤에만
`verified`로 승격한다.

## Provenance contract

각 board/part spec은 다음 필드를 가진다.

```json
{
  "source": {
    "manufacturer": "Microchip",
    "document_id": "DS40002061B",
    "revision": "B",
    "url": "https://ww1.microchip.com/...",
    "retrieved_at": "2026-09-03",
    "sha256": "filled-by-source-sync",
    "page_or_section": ["32.2 DC Characteristics"]
  },
  "model": {
    "fidelity": "datasheet_subset",
    "known_deviations": []
  }
}
```

PDF는 redistribution 권한이 확인되지 않으면 저장소에 넣지 않는다. `.cache`에 내려받아
checksum만 lock하고, catalog에는 검토된 수치와 출처만 커밋한다.

## Quantity contract

- canonical JSON: `{ "value": 5.0, "unit": "V" }`
- range: `{ "min": 4.5, "typ": 5.0, "max": 5.5, "unit": "V" }`
- 기본 dimension: voltage, current, resistance, capacitance, inductance, power,
  frequency, time, temperature, humidity, illuminance, distance
- catalog loader가 prefix를 SI로 정규화하고 dimension mismatch를 거부한다.
- generic part의 사용자값과 absolute rating을 분리한다. 예를 들어 resistor의 `220 Ohm`은
  parameter이고 `0.25 W`는 rating이다.

## Board and MCU

| Target | Primary source | Catalog extraction | Simulator use | Status |
|---|---|---|---|---|
| Arduino Uno R3 | [Arduino UNO R3](https://docs.arduino.cc/hardware/uno-rev3) | 5 V, 16 MHz, 14 digital, PWM pins 6개, analog inputs 6개, memory, LED D13 | board identity/FQBN/pin capability | reviewed |
| ATmega328P | [Microchip DS40002061B](https://ww1.microchip.com/downloads/en/DeviceDoc/ATmega48A-PA-88A-PA-168A-PA-328-P-DS-DS40002061B.pdf) | Port B/C/D, DDR/PORT/PIN, thresholds, pull-ups, ADC, timers/PWM, USART, SPI, TWI, interrupt timing | avr8js bridge와 electrical limits | reviewed |
| Arduino API | [Arduino language reference](https://docs.arduino.cc/language-reference/) | digital/analog I/O, time, interrupts, Serial/Wire/SPI behavior examples | golden lesson acceptance | reviewed |
| Arduino compile | [Arduino CLI compile](https://docs.arduino.cc/arduino-cli/commands-reference/arduino-cli_compile) | FQBN, output-dir, JSON diagnostics | Phase 65 build contract | implemented |

Uno catalog에서 우선 고정할 수치:

- digital I/O recommended current: 20 mA
- configurable internal pull-up: 20–50 kOhm
- ADC: 10 bit, 기본 0–5 V reference
- PWM: D3, D5, D6, D9, D10, D11
- buses: UART D0/D1, external interrupts D2/D3, SPI D10–D13, TWI A4/A5

40 mA/pin은 동작 권장치가 아니라 absolute maximum이므로 정상 source capability로
사용하지 않고 damage warning threshold로만 둔다.

## Exact or representative component sources

| Part model | Source | Facts to extract | Planned behavior | Confidence |
|---|---|---|---|---|
| Red LED, representative Kingbright | [APT1608SRCPRV](https://www.kingbrightusa.com/images/catalog/SPEC/APT1608SRCPRV.pdf) | typ/max forward voltage, 20 mA test current, wavelength, reverse limit | diode current + brightness/color | manufacturer |
| Rectifier diode 1N4007 | [Vishay 1N4001–1N4007](https://www.vishay.com/docs/88503/1n4001.pdf) | 1 A average current, 1000 V reverse rating, forward curve | diode model + flyback validation | manufacturer |
| NPN 2N2222A | [onsemi 2N2222A](https://www.onsemi.com/download/data-sheet/pdf/2n2222a-d.pdf) | VCEO/VCBO/VEBO, collector current, gain regions, saturation/switching | BJT switch first, analog curve later | manufacturer |
| TMP36 | [Analog Devices TMP36](https://www.analog.com/en/products/tmp36.html) | 2.7–5.5 V, 10 mV/degC, 750 mV at 25 degC, range/accuracy | temperature stimulus → analog voltage | manufacturer |
| WS2812B-V5 | [Worldsemi WS2812B-V5](http://world-semi.com/web/userfiles/productfile/WS2812B_V5WDatasheet_V6.1_EN.pdf) | pinout, 24-bit order, NZR pulse timing, reset >280 us | edge decoder + RGB chain state | manufacturer |
| HD44780U | [Hitachi HD44780U archive](https://static.cytron.io/download/usr_attachment/HD44780U_datasheet.pdf) | pinout, 4/8-bit bus, instruction timing, DDRAM/CGRAM, busy flag | LCD1602 controller subset | archived manufacturer document |
| 74HC595 | [Nexperia 74HC/HCT595 Rev.12](https://assets.nexperia.com/documents/data-sheet/74HC_HCT595.pdf) | DS/SHCP/STCP/MR/OE truth table, 3-state outputs, voltage range | SPI/edge-driven shift/storage registers | manufacturer |
| L293D | [TI L293D Rev.D](https://www.ti.com/lit/ds/symlink/l293d.pdf) | 4.5–36 V motor supply, 600 mA continuous, enable/input truth, clamps | H-bridge + overload warning | manufacturer |
| LM358 | [TI LM358-N Rev.J](https://www.ti.com/lit/ds/symlink/lm358-n.pdf) | supply/common-mode/output swing, gain bandwidth, pinout | bounded educational op-amp macro-model | manufacturer |
| DHT22/AM2302 | [Aosong document mirror](https://cdn-shop.adafruit.com/datasheets/Digital%20humidity%20and%20temperature%20sensor%20AM2302.pdf) | 3.3–5.5 V, sample interval, start/response timing, 40-bit payload/checksum | single-wire scheduled response | manufacturer document mirror |
| HC-SR04 | [HC-SR04 user guide](https://www.handsontec.com/pdf_files/hc-sr04-User-Guide.pdf) | 10 us trigger, 8 cycles at 40 kHz, echo width, range, >=60 ms cycle | distance stimulus → echo pulse | commodity module; no authoritative manufacturer |
| SG90 servo | [SG90 representative specification](https://www.kjell.com/globalassets/mediaassets/701916_87897_datasheet_en.pdf) | 4.8–6 V, 50 Hz, 1–2 ms pulse mapping, angle/speed/torque/current | pulse width → target/current angle | distributor specification |
| GL5528 LDR | [GL5528 representative sheet](http://static.mercateo.com/5c/a3082259b18446a7a90254737567ea01/pdf/58-0134_v1.pdf) | R at 10 lux, dark R, gamma curve, max voltage/power | lux stimulus → resistance | commodity model |

“commodity” 표시는 동명 제품의 제조사별 편차가 크다는 뜻이다. UI에서 정밀도를
과장하지 않고 model profile을 표시한다.

## Generic educational families

아래 부품은 특정 SKU를 사칭하지 않는다. Phase 70에서 representative model을 선택하고,
선택 전에는 `generic_educational` fidelity로 표시한다.

| Family | Required spec | Minimum model | Source action |
|---|---|---|---|
| resistor | resistance, tolerance, power rating | Ohm law + power warning | axial 1/4 W representative datasheet 선정 |
| capacitor | capacitance, voltage, ESR/polarity | backward-Euler transient | ceramic/electrolytic profile 분리 |
| potentiometer | total resistance, taper, wiper position/power | two variable resistors | 10 kOhm linear profile 선정 |
| push/toggle/DIP switch | contact topology, bounce option, rating | ideal contact + optional bounce stimulus | representative switch series 선정 |
| RGB LED | pin topology, channel Vf/current/color | three LED channels | common-anode/cathode profiles 선정 |
| piezo buzzer | resonant frequency, voltage, capacitance/SPL | edge frequency → active/tone state | passive piezo profile 선정 |
| DC motor | nominal voltage, stall/no-load current/speed, inertia | voltage/PWM → speed/current | one TT gearmotor profile 선정 |
| relay | coil voltage/resistance, pickup/dropout, contact ratings | coil threshold + isolated contacts | 5 V SPDT profile 선정 |
| PIR sensor | supply, output level, retrigger/hold time | motion stimulus → timed digital output | HC-SR501 profile/source 선정 |
| keypad | row/column matrix and contact behavior | switch matrix | 4x4 membrane profile 선정 |
| 7-segment | common pin type, segment Vf/current | segment states/brightness | common-anode/cathode profiles 선정 |
| 74HC165 | truth table, clocks, inhibit/load, voltage | parallel-in shift register | Nexperia/TI primary sheet lock |
| breadboard | connected hole groups and rail breaks | topology expansion only | geometry-specific connectivity fixture |
| battery/DC source | nominal voltage, internal resistance/current limit | Thevenin source | generic ideal + bounded profiles |

## Instruments

Instruments use simulator trace contracts rather than component datasheets.

| Instrument | Inputs | Output contract | Acceptance |
|---|---|---|---|
| Serial Monitor | USART TX/RX, configured baud | timestamped bytes/text, input queue | echo and `Serial.println` |
| Multimeter | two probes + mode | V/A/Ohm with range/invalid state | divider and current-loop fixtures |
| Oscilloscope | channels, ground, timebase, trigger | sampled voltage vectors | PWM and RC charge waveform |
| Logic analyzer | digital probes | timestamped edges + protocol decode | UART/I2C/SPI fixtures |
| Function generator | waveform/amplitude/offset/frequency | voltage source events | sine/square/triangle load |

## Source synchronization and review

Phase 70 source tooling will:

1. download only allowlisted HTTPS/HTTP manufacturer or archival URLs;
2. cap size/type and store files under ignored `.cache/hardware-datasheets/`;
3. calculate SHA-256 and compare `catalog-sources.lock.json`;
4. require an explicit lock update when a vendor silently changes a document;
5. run schema checks for units, ranges, source section, model fidelity and deviations;
6. never regenerate reviewed spec values automatically from PDF text.

This separation lets an AI fetch and propose a spec update while contract tests prevent an unreviewed
datasheet interpretation from changing simulation behavior.

## Open-source implementation references

Pinned during 2026-09-03 research:

- [wokwi-elements](https://github.com/wokwi/wokwi-elements) `fd56439` — MIT,
  visual components only
- [Velxio](https://github.com/davidmonterocrespo24/velxio) `665f0ba` — AGPL,
  architecture/cross-check only
- [ngspice](https://github.com/ngspice/ngspice) `032b1c3` — modified BSD base,
  analog oracle/delegate candidate; per-file license audit required
- [thevenin](https://github.com/cramt/thevenin) `f8e0b76` — BSD-3-Clause Rust solver,
  qualification candidate

Existing [avr8js](https://github.com/wokwi/avr8js) remains the ATmega328P delegate. Wokwi
Elements explicitly does not provide functional simulation, so visual coverage must never be reported
as component simulation coverage.
