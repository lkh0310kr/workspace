# Hardware button → LED fixture

First `hardware-sim-core` vertical slice:

```text
uno.5V → 220Ω resistor → LED → momentary button → uno.GND
```

The LED is off while `button1` is open and on while it is pressed. This
fixture deliberately has no firmware or MCU emulator; it proves the
Hardware-as-Code loader, validation graph, input state, circuit propagation,
and runtime observation before avr8js is introduced.
