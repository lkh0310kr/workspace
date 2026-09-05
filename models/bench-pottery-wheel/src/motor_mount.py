"""B4 — motor mount: bracket, NEMA-17 body, shaft stub, and pulley."""

from __future__ import annotations

from cadgen import build123d as bd
from cadgen import step

from lib.dims import (
    MOTOR_BODY_D,
    MOTOR_BODY_H,
    MOTOR_BODY_W,
    MOTOR_PULLEY_H,
    MOTOR_PULLEY_OD,
    MOTOR_SHAFT_D,
    MOUNT_PAD,
    MOUNT_PLATE_T,
)
from lib.drive_layout import motor_mount_y, motor_pulley_center_y, motor_pulley_z_from_mount_foot


def _bracket(y: float) -> bd.Part:
    z = MOUNT_PLATE_T / 2
    return bd.Pos(0, y, z) * bd.Box(MOTOR_BODY_W + MOUNT_PAD, MOTOR_BODY_D + MOUNT_PAD, MOUNT_PLATE_T)


def _motor_body(y: float) -> bd.Part:
    z = MOUNT_PLATE_T + MOTOR_BODY_H / 2
    return bd.Pos(0, y, z) * bd.Box(MOTOR_BODY_W, MOTOR_BODY_D, MOTOR_BODY_H)


def _motor_shaft_and_pulley() -> bd.Part:
    y = motor_pulley_center_y()
    z = motor_pulley_z_from_mount_foot()
    shaft_len = MOTOR_PULLEY_H + 8.0
    shaft = bd.Pos(0, y + shaft_len / 2, z) * bd.Rot(90, 0, 0) * bd.Cylinder(MOTOR_SHAFT_D / 2, shaft_len)
    pulley = bd.Pos(0, y, z) * bd.Rot(90, 0, 0) * bd.Cylinder(MOTOR_PULLEY_OD / 2, MOTOR_PULLEY_H)
    return shaft + pulley


@step(out="../STEP/motor_mount.step")
def motor_mount():
    y = motor_mount_y()
    return bd.Compound(
        children=[_bracket(y), _motor_body(y), _motor_shaft_and_pulley()],
        label="motor_mount",
    )


if __name__ == "__main__":
    motor_mount()
