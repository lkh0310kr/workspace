"""Nominal dimensions (mm) — 윗걸이(over-shot) 물레방아, 삼척·민속 자료 기준 스케일.

참고 실측(진동 해석 문헌): 바퀴 외경 2.2 m, 내경 2.0 m, 두께 0.4 m, 축 Ø60 mm.
CAD는 뷰어·조립 검증용으로 1:1 mm 단위; 필요 시 B7에서 축소.
"""

# --- 수리 / 에너지 입력 (B7 knobs) ---
HEAD_HEIGHT = 3000.0  # 보(堰) 위 수면 → 수차 상단 낙차 h (mm)
FLOW_LPS = 50.0  # 유량 Q (L/s) — 설계 가정

# --- 물레바퀴 (수차) ---
WHEEL_OD = 2200.0
WHEEL_ID = 2000.0
WHEEL_THICK = 400.0
BUCKET_COUNT = 16
SPOKE_COUNT = 4  # 십자목
BOARD_THICK = 30.0  # plank stock (문헌: 30 mm)
SPOKE_WIDTH = 90.0
BUCKET_RADIAL_DEPTH = 120.0
BUCKET_Z_HEIGHT = 200.0
AXLE_BORE_D = 64.0  # AXLE_D + clearance
RIM_FILLET = 8.0
SPOKE_FILLET = 4.0

# --- 굴통 (축) ---
AXLE_D = 60.0
AXLE_LENGTH = 3500.0  # 방아 양쪽 돌출 포함

# --- 눌림목 (캠) ---
CAM_ARM_R = 180.0  # 축 중심 → 방아채 접점
CAM_WIDTH = 120.0
CAM_HUB_LEN = 140.0
CAM_PAD_D = 90.0
CAM_PAD_H = 60.0

# --- 방아 (시소) ---
STRIKE_ARM_LEN = 480.0
PESTLE_ARM_LEN = 2400.0
MILL_X_OFFSET = 120.0
MILL_FULCRUM_H = 900.0  # 받침대 높이 (바닥→빔)
BEAM_SECTION = 100.0
PESTLE_D = 200.0
PESTLE_H = 600.0
MORTAR_OD = 450.0
MORTAR_DEPTH = 250.0

# --- 수로 ---
FLUME_WIDTH = 400.0
FLUME_DEPTH = 200.0

# --- 방앗간 틀 (간이) ---
HOUSE_SPAN = 4000.0
HOUSE_DEPTH = 3500.0
HOUSE_POST_D = 200.0
