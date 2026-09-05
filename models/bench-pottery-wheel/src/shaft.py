"""B3+B4 — vertical spindle with drive pulley at the belt plane."""

from __future__ import annotations

from cadgen import build123d as bd
from cadgen import step

from lib.dims import DRIVE_PULLEY_H, DRIVE_PULLEY_OD, SHAFT_D, SHAFT_L
from lib.drive_layout import bearing_journal_z_from_shaft_base, drive_pulley_z_from_shaft_base


@step(out="../STEP/shaft.step")
def shaft():
    spindle = bd.Pos(0, 0, SHAFT_L / 2) * bd.Cylinder(SHAFT_D / 2, SHAFT_L)
    pulley_z = drive_pulley_z_from_shaft_base()
    pulley = bd.Pos(0, 0, pulley_z) * bd.Cylinder(DRIVE_PULLEY_OD / 2, DRIVE_PULLEY_H)
    lip = bd.Pos(0, 0, pulley_z + DRIVE_PULLEY_H / 2 - 0.75) * bd.Cylinder(
        (DRIVE_PULLEY_OD + 4) / 2, 1.5
    )
    # Bearing journal at the upper plinth pocket.
    journal_z = bearing_journal_z_from_shaft_base()
    journal = bd.Pos(0, 0, journal_z) * bd.Cylinder((SHAFT_D + 2) / 2, 12.0)
    return spindle + pulley + lip + journal


if __name__ == "__main__":
    shaft()
