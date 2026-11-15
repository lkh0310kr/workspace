# Invalid fixture — power shorted to ground

`uno.5V` is wired directly to `uno.GND`. `hardware-sim-core` must reject this
with `POWER_GROUND_SHORT` so an agent can fix the netlist from the error code
alone.
