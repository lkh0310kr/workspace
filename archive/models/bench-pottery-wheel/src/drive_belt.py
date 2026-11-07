"""B4 — timing belt in the YZ plane between aligned motor and spindle pulleys."""

from __future__ import annotations

import math

from cadgen import build123d as bd
from cadgen import step

from lib.dims import BELT_THICKNESS, BELT_WIDTH
from lib.drive_layout import (
    drive_pulley_z_from_shaft_base,
    motor_pulley_y_from_shaft_floor,
    pulley_radii,
)


def _strap_between(p0: tuple[float, float], p1: tuple[float, float], thickness: float, width: float) -> bd.Part:
    y0, z0 = p0
    y1, z1 = p1
    length = math.hypot(y1 - y0, z1 - z0)
    if length < 1e-3:
        return bd.Pos(0, y0, z0) * bd.Box(width, 1.0, thickness)
    yaw = math.degrees(math.atan2(z1 - z0, y1 - y0))
    mid_y = (y0 + y1) / 2
    mid_z = (z0 + z1) / 2
    return bd.Pos(0, mid_y, mid_z) * bd.Rot(0, yaw, 0) * bd.Box(width, length, thickness)


def _belt_body() -> bd.Part:
    y_motor = motor_pulley_y_from_shaft_floor()
    z = drive_pulley_z_from_shaft_base()
    r_motor, r_drive = pulley_radii()
    t = BELT_THICKNESS
    w = BELT_WIDTH

    # Tangent points in the shared YZ plane (x = 0).
    upper_drive = (r_drive, z)
    upper_motor = (y_motor, z + r_motor)
    lower_drive = (-r_drive, z)
    lower_motor = (y_motor, z - r_motor)

    upper = _strap_between(upper_drive, upper_motor, t, w)
    lower = _strap_between(lower_drive, lower_motor, t, w)

    drive_wrap = bd.Pos(0, 0, z) * bd.Cylinder(r_drive + t / 2, w)
    motor_wrap = bd.Pos(0, y_motor, z) * bd.Rot(0, 0, 90) * bd.Cylinder(r_motor + t / 2, w)
    return upper + lower + drive_wrap + motor_wrap


@step(out="../STEP/drive_belt.step")
def drive_belt():
    return _belt_body()


if __name__ == "__main__":
    drive_belt()
