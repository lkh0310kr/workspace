"""B3 — plinth base with hollow shell and bearing pocket."""

from __future__ import annotations

from cadgen import build123d as bd
from cadgen import step

from lib.dims import (
    BEARING_POCKET_D,
    BEARING_POCKET_DEPTH,
    PLINTH_D,
    PLINTH_H,
    PLINTH_WALL,
    SHAFT_D,
)


@step(out="../STEP/plinth.step")
def plinth():
    outer = bd.Pos(0, 0, -PLINTH_H / 2) * bd.Cylinder(PLINTH_D / 2, PLINTH_H)
    inner_r = PLINTH_D / 2 - PLINTH_WALL
    inner = bd.Pos(0, 0, -PLINTH_H / 2) * bd.Cylinder(inner_r, PLINTH_H + 4)
    body = outer - inner

    pocket = bd.Pos(0, 0, -BEARING_POCKET_DEPTH / 2) * bd.Cylinder(
        BEARING_POCKET_D / 2, BEARING_POCKET_DEPTH + 4
    )
    body -= pocket

    shaft_bore = bd.Pos(0, 0, -PLINTH_H / 2) * bd.Cylinder(SHAFT_D / 2 + 1.0, PLINTH_H + 4)
    body -= shaft_bore
    return body


if __name__ == "__main__":
    plinth()
