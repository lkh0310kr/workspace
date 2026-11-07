"""B2 — axle (굴통): centered on wheel hub, +X along axle."""

from __future__ import annotations

from cadgen import build123d as bd
from cadgen import step

from lib.dims import AXLE_D, AXLE_LENGTH


@step(out="../STEP/axle.step")
def axle():
    # Origin = hub center; axle extends ±AXLE_LENGTH/2 along X.
    return bd.Rot(Y=90) * bd.Cylinder(AXLE_D / 2, AXLE_LENGTH)


if __name__ == "__main__":
    axle()
