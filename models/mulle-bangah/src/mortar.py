"""B5 — stone mortar (방아확): top opening at Z=0, foot below."""

from __future__ import annotations

from cadgen import build123d as bd
from cadgen import step

from lib.dims import MORTAR_DEPTH, MORTAR_OD, PESTLE_D


@step(out="../STEP/mortar.step")
def mortar():
    # Origin = top center of mortar opening (mates under pestle tip).
    outer = bd.Pos(0, 0, -MORTAR_DEPTH / 2) * bd.Cylinder(MORTAR_OD / 2, MORTAR_DEPTH)
    inner = bd.Pos(0, 0, -MORTAR_DEPTH + 10) * bd.Cylinder(
        (PESTLE_D / 2) + 14,
        MORTAR_DEPTH,
    )
    return outer - inner


if __name__ == "__main__":
    mortar()
