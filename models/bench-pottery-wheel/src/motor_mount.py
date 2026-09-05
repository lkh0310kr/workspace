"""B4 — motor mount: bracket, NEMA-17 body, and motor pulley (multi-solid compound)."""

from __future__ import annotations

from cadgen import build123d as bd
from cadgen import step

from lib.dims import (
    MOTOR_BODY_D,
    MOTOR_BODY_H,
    MOTOR_BODY_W,
    MOTOR_PULLEY_H,
    MOTOR_PULLEY_OD,
    MOUNT_PAD,
    MOUNT_PLATE_T,
    PLINTH_D,
    PLINTH_WALL,
)


def _mount_y() -> float:
    inner_r = PLINTH_D / 2 - PLINTH_WALL
    return inner_r - MOTOR_BODY_D / 2 - 5.0


def _bracket(y: float) -> bd.Part:
    # Origin: bottom-center of bracket at Z=0.
    z = MOUNT_PLATE_T / 2
    return bd.Pos(0, y, z) * bd.Box(MOTOR_BODY_W + MOUNT_PAD, MOTOR_BODY_D + MOUNT_PAD, MOUNT_PLATE_T)


def _motor_body(y: float) -> bd.Part:
    z = MOUNT_PLATE_T + MOTOR_BODY_H / 2
    return bd.Pos(0, y, z) * bd.Box(MOTOR_BODY_W, MOTOR_BODY_D, MOTOR_BODY_H)


def _motor_pulley(y: float) -> bd.Part:
    z = MOUNT_PLATE_T + MOTOR_BODY_H / 2
    face_y = y - MOTOR_BODY_D / 2 - MOTOR_PULLEY_H / 2
    return bd.Pos(0, face_y, z) * bd.Rot(90, 0, 0) * bd.Cylinder(MOTOR_PULLEY_OD / 2, MOTOR_PULLEY_H)


@step(out="../STEP/motor_mount.step")
def motor_mount():
    y = _mount_y()
    return bd.Compound(
        children=[_bracket(y), _motor_body(y), _motor_pulley(y)],
        label="motor_mount",
    )


if __name__ == "__main__":
    motor_mount()
