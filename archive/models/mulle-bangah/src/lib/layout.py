"""World-frame layout — single source of truth for mulle-bangah assembly."""

from __future__ import annotations

from cadgen import build123d as bd

from lib.dims import (
    AXLE_LENGTH,
    BEAM_SECTION,
    CAM_ARM_R,
    CAM_HUB_LEN,
    MILL_FULCRUM_H,
    MILL_X_OFFSET,
    PESTLE_ARM_LEN,
    PESTLE_H,
    STRIKE_ARM_LEN,
    WHEEL_OD,
    WHEEL_THICK,
)


def wheel_hub_z() -> float:
    """Wheel axle height; rim bottom at Z=0."""
    return WHEEL_OD / 2


def wheel_hub_world() -> bd.Location:
    return bd.Location((0, 0, wheel_hub_z()))


def axle_center_world() -> bd.Location:
    return wheel_hub_world()


def wheel_pos_x_face_world() -> bd.Location:
    """Wheel +X hub face (cam side)."""
    return bd.Location((WHEEL_THICK / 2, 0, wheel_hub_z()))


def wheel_neg_x_face_world() -> bd.Location:
    return bd.Location((-WHEEL_THICK / 2, 0, wheel_hub_z()))


def cam_hub_center_world(side: str = "pos_x") -> bd.Location:
    """Cam hub bore center on axle, flush to wheel face."""
    sign = 1.0 if side == "pos_x" else -1.0
    x = sign * (WHEEL_THICK / 2 + CAM_HUB_LEN / 2)
    return bd.Location((x, 0, wheel_hub_z()))


def cam_pad_world_at_press(side: str = "pos_x") -> tuple[float, float, float]:
    """Cam roller position when pressing mill strike point (+Y or -Y)."""
    sign = 1.0 if side == "pos_x" else -1.0
    x = sign * (WHEEL_THICK / 2 + CAM_HUB_LEN / 2)
    y = sign * CAM_ARM_R
    return (x, y, wheel_hub_z())


def mill_fulcrum_world(side: str = "pos_x") -> bd.Location:
    """Fulcrum foot on floor; strike end reaches cam pad Y at press."""
    sign = 1.0 if side == "pos_x" else -1.0
    x = sign * (WHEEL_THICK / 2 + CAM_HUB_LEN + MILL_X_OFFSET)
    y = sign * (CAM_ARM_R + STRIKE_ARM_LEN)
    return bd.Location((x, y, 0))


def _fulcrum_xyz(side: str) -> tuple[float, float, float]:
    pos = mill_fulcrum_world(side).position
    return (pos.X, pos.Y, pos.Z)


def mill_strike_tip_world(side: str = "pos_x") -> tuple[float, float, float]:
    x, y, _z = _fulcrum_xyz(side)
    sign = 1.0 if side == "pos_x" else -1.0
    y_strike = y - sign * STRIKE_ARM_LEN
    return (x, y_strike, mill_beam_top_z())


def mill_pestle_tip_world(side: str = "pos_x") -> tuple[float, float, float]:
    x, y, _z = _fulcrum_xyz(side)
    sign = 1.0 if side == "pos_x" else -1.0
    return (x, y + sign * PESTLE_ARM_LEN, mill_beam_z_world() - PESTLE_H)


def mill_beam_z_world() -> float:
    """Beam centerline height (matches mill_arm part)."""
    return MILL_FULCRUM_H + BEAM_SECTION / 2


def mill_beam_top_z() -> float:
    return MILL_FULCRUM_H + BEAM_SECTION


def mortar_top_world(side: str = "pos_x") -> bd.Location:
    x, y, _z = mill_pestle_tip_world(side)
    return bd.Location((x, y, 0))


def axle_half_length() -> float:
    return AXLE_LENGTH / 2


# --- tolerances for assembly_validate.py (mm) ---
STRIKE_Y_TOL = 25.0
BEAM_Z_TOL = 80.0
PESTLE_XY_TOL = 30.0
CLASH_VOL_MAX = 500.0
