"""Nominal dimensions (mm) — hobby tabletop pottery wheel."""

# --- B7 live-iteration knobs (edit → npm run agents:pottery-wheel:bench) ---
WHEEL_D = 300.0
PLINTH_D = 320.0  # keep ~20 mm larger than WHEEL_D

# Throwing surface
HEAD_THICKNESS = 20.0

# Rim (B1)
RIM_HEIGHT = 5.0
RIM_WIDTH = 15.0
RIM_FILLET = 2.0
RIM_INNER_FILLET = 1.0

# Bat pins (B1)
BAT_PIN_D = 8.0
BAT_PIN_DEPTH = 12.0
BAT_PIN_RADIUS = 100.0

# Center hub (B1)
CENTER_BORE_D = 25.0
BOSS_H = 12.0
BOSS_WALL = 10.0
BOSS_FILLET = 1.5

# Splash pan (B2)
PAN_OD = PLINTH_D - 8.0
PAN_DEPTH = 22.0
PAN_INNER_GAP = 8.0
PAN_FILLET = 1.5
DRAIN_D = 20.0
DRAIN_H = 14.0
DRAIN_INSET = 28.0

# Plinth + shaft (B3)
PLINTH_H = 80.0
PLINTH_WALL = 12.0
SHAFT_D = 24.0
SHAFT_L = PLINTH_H + 60.0
BEARING_POCKET_D = 40.0
BEARING_POCKET_DEPTH = 15.0
