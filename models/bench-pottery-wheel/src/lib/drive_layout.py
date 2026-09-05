"""Shared drive-train layout — keeps motor and spindle pulleys on one belt plane."""

from __future__ import annotations

from lib.dims import (
    BEARING_POCKET_DEPTH,
    DRIVE_PULLEY_OD,
    MOTOR_BODY_D,
    MOTOR_PULLEY_H,
    MOTOR_PULLEY_OD,
    PLINTH_D,
    PLINTH_H,
    PLINTH_WALL,
)


def motor_mount_y() -> float:
    inner_r = PLINTH_D / 2 - PLINTH_WALL
    return inner_r - MOTOR_BODY_D / 2 - 5.0


def belt_plane_z_world() -> float:
    """World Z of the shared belt plane (inside the plinth cavity)."""
    return -PLINTH_H + 38.0


def shaft_base_z_world() -> float:
    return -PLINTH_H


def drive_pulley_z_from_shaft_base() -> float:
    return belt_plane_z_world() - shaft_base_z_world()


def motor_pulley_z_from_mount_foot() -> float:
    return belt_plane_z_world() - shaft_base_z_world()


def motor_pulley_center_y() -> float:
    """Motor pulley center Y when mount foot is at the plinth floor."""
    return motor_mount_y() - MOTOR_BODY_D / 2 - MOTOR_PULLEY_H / 2


def bearing_journal_z_from_shaft_base() -> float:
    return PLINTH_H - BEARING_POCKET_DEPTH


def pulley_radii() -> tuple[float, float]:
    return MOTOR_PULLEY_OD / 2, DRIVE_PULLEY_OD / 2
