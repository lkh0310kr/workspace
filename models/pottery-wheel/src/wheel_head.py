"""B0 — pottery wheel head: plain throwing disc."""

from __future__ import annotations

from cadgen import build123d as bd
from cadgen import step

from lib.dims import HEAD_THICKNESS, WHEEL_D


@step(out="../STEP/wheel_head.step")
def wheel_head():
    return bd.Pos(0, 0, HEAD_THICKNESS / 2) * bd.Cylinder(WHEEL_D / 2, HEAD_THICKNESS)


if __name__ == "__main__":
    wheel_head()
