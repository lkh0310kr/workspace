"""B4 — timing belt connecting motor and spindle pulleys (YZ plane at X=0)."""

from __future__ import annotations

from cadgen import build123d as bd
from cadgen import step

from lib.dims import BELT_THICKNESS, BELT_WIDTH
from lib.drive_layout import (
    drive_pulley_z_from_shaft_base,
    motor_pulley_center_y,
    pulley_radii,
)


def _belt_body() -> bd.Part:
    y_motor = motor_pulley_center_y()
    z = drive_pulley_z_from_shaft_base()
    r_motor, r_drive = pulley_radii()
    t = BELT_THICKNESS
    w = BELT_WIDTH

    straight_len = max(y_motor - r_drive - r_motor, 2.0)
    mid_y = (y_motor - r_motor + r_drive) / 2

    upper = bd.Pos(0, mid_y, z + r_drive + t / 2) * bd.Box(w, straight_len, t)
    lower = bd.Pos(0, mid_y, z - r_drive - t / 2) * bd.Box(w, straight_len, t)

    # Wrap segments around each pulley in the belt plane.
    drive_wrap = bd.Pos(0, 0, z) * bd.Rot(90, 0, 0) * bd.Cylinder(r_drive + t / 2, w)
    motor_wrap = bd.Pos(0, y_motor, z) * bd.Rot(90, 0, 0) * bd.Cylinder(r_motor + t / 2, w)

    return upper + lower + drive_wrap + motor_wrap


@step(out="../STEP/drive_belt.step")
def drive_belt():
    # Built in shaft-base coordinates; assembly places foot at the plinth floor.
    return _belt_body()


if __name__ == "__main__":
    drive_belt()
