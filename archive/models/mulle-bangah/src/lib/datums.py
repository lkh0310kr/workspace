"""Assembly mating datums — axle along +X, wheel in YZ, water from +Z."""

from __future__ import annotations

from cadgen import build123d as bd

from lib.dims import WHEEL_OD, WHEEL_THICK


def axle_axis() -> bd.Axis:
    return bd.Axis.X


def wheel_hub_location() -> bd.Location:
    """Wheel center; bore mates coaxial with axle."""
    return bd.Location((0, 0, 0))


def wheel_face_pos_x() -> bd.Location:
    """+X face of wheel disc (cam side toward mill house)."""
    return bd.Location((WHEEL_THICK / 2, 0, 0))


def wheel_face_neg_x() -> bd.Location:
    """−X face (opposite cam side)."""
    return bd.Location((-WHEEL_THICK / 2, 0, 0))


def wheel_top_z() -> float:
    """Highest point of rim — overshot water entry."""
    return WHEEL_OD / 2


def wheel_axis_height_world() -> float:
    """Wheel center Z when bottom of rim sits at ground (Z=0)."""
    return WHEEL_OD / 2
