# 잘못된 fixture — 전원과 접지 단락

`uno.5V`가 `uno.GND`에 직접 연결되어 있습니다. `hardware-sim-core`는 `POWER_GROUND_SHORT`로 이를 거부해야 합니다. agent는 오류 코드만으로 netlist를 수정할 수 있어야 합니다.
