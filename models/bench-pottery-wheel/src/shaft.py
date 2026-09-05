"""B3 — vertical spindle shaft seated in the plinth bearing pocket."""

from __future__ import annotations

from cadgen import build123d as bd
from cadgen import step

from lib.dims import SHAFT_D, SHAFT_L


@step(out="../STEP/shaft.step")
def shaft():
    # Origin at bottom center; extends upward along +Z.
    return bd.Pos(0, 0, SHAFT_L / 2) * bd.Cylinder(SHAFT_D / 2, SHAFT_L)


if __name__ == "__main__":
    shaft()
