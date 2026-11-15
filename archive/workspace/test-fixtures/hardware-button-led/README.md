# Hardware button → LED fixture

`hardware-sim-core`의 첫 end-to-end 기능입니다.

```text
uno.5V → 220Ω resistor → LED → momentary button → uno.GND
```

`button1`이 열려 있는 동안 LED는 꺼지고, 누르면 켜집니다. 이 fixture에는 의도적으로 firmware나 MCU emulator가 없습니다. avr8js를 도입하기 전에 Hardware-as-Code loader, validation graph, 입력 상태, 회로 전파, runtime 관찰을 검증합니다.
