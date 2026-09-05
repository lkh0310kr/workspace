"""B3+B4 — vertical spindle with integrated drive pulley."""

from __future__ import annotations

from cadgen import build123d as bd
from cadgen import step

from lib.dims import DRIVE_PULLEY_H, DRIVE_PULLEY_OD, DRIVE_PULLEY_Z, SHAFT_D, SHAFT_L


@step(out="../STEP/shaft.step")
def shaft():
    spindle = bd.Pos(0, 0, SHAFT_L / 2) * bd.Cylinder(SHAFT_D / 2, SHAFT_L)
    pulley_z = DRIVE_PULLEY_Z + DRIVE_PULLEY_H / 2
    pulley = bd.Pos(0, 0, pulley_z) * bd.Cylinder(DRIVE_PULLEY_OD / 2, DRIVE_PULLEY_H)
    # Belt-retention lip.
    lip = bd.Pos(0, 0, pulley_z + DRIVE_PULLEY_H / 2 - 0.75) * bd.Cylinder(
        (DRIVE_PULLEY_OD + 4) / 2, 1.5
    )
    return spindle + pulley + lip


if __name__ == "__main__":
    shaft()
