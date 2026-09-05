"""M3 mounting bracket — 60×40 mm plate, 4 mm thick, corner clearance holes."""

from __future__ import annotations

from cadgen import build123d as bd
from cadgen import step

WIDTH = 60.0
DEPTH = 40.0
THICKNESS = 4.0
HOLE_D = 3.4  # M3 normal clearance
EDGE_OFFSET = 8.0


def corner_hole_centers(width: float, depth: float, inset: float) -> list[tuple[float, float]]:
    hx = width / 2 - inset
    hy = depth / 2 - inset
    return [(-hx, -hy), (hx, -hy), (-hx, hy), (hx, hy)]


@step(out="bracket.step")
def bracket():
    body = bd.Box(WIDTH, DEPTH, THICKNESS)
    for x, y in corner_hole_centers(WIDTH, DEPTH, EDGE_OFFSET):
        body -= bd.Pos(x, y, 0) * bd.Cylinder(HOLE_D / 2, THICKNESS * 2)
    return body


if __name__ == "__main__":
    bracket()
