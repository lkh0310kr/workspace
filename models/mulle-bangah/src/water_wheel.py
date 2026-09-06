"""B0–B1 — overshot water wheel (물레바퀴): rim, 십자목 spokes, buckets.

Coordinate contract: axle along +X, wheel plane YZ, water enters from +Z.
Origin = wheel center (hub).
"""

from __future__ import annotations

import math

from cadgen import build123d as bd
from cadgen import step

from lib.dims import (
    AXLE_BORE_D,
    BUCKET_COUNT,
    BUCKET_RADIAL_DEPTH,
    BUCKET_Z_HEIGHT,
    RIM_FILLET,
    SPOKE_WIDTH,
    WHEEL_ID,
    WHEEL_OD,
    WHEEL_THICK,
)


def _along_axle_cylinder(radius: float, length: float) -> bd.Part:
    return bd.Rot(Y=90) * bd.Cylinder(radius, length)


def _rim_ring() -> bd.Part:
    outer = _along_axle_cylinder(WHEEL_OD / 2, WHEEL_THICK)
    inner = _along_axle_cylinder(WHEEL_ID / 2, WHEEL_THICK + 4)
    return outer - inner


def _hub_disc() -> bd.Part:
    return _along_axle_cylinder(WHEEL_ID / 2, WHEEL_THICK)


def _axle_bore() -> bd.Part:
    return _along_axle_cylinder(AXLE_BORE_D / 2, WHEEL_THICK + 6)


def _spokes() -> bd.Part:
    span = (WHEEL_OD - WHEEL_ID) / 2
    y0 = WHEEL_ID / 2 + span / 2
    z0 = WHEEL_ID / 2 + span / 2
    along_y = bd.Box(
        WHEEL_THICK,
        span,
        SPOKE_WIDTH,
        align=(bd.Align.CENTER, bd.Align.CENTER, bd.Align.CENTER),
    )
    along_z = bd.Box(
        WHEEL_THICK,
        SPOKE_WIDTH,
        span,
        align=(bd.Align.CENTER, bd.Align.CENTER, bd.Align.CENTER),
    )
    return (
        bd.Pos(0, y0, 0) * along_y
        + bd.Pos(0, -y0, 0) * along_y
        + bd.Pos(0, 0, z0) * along_z
        + bd.Pos(0, 0, -z0) * along_z
    )


def _bucket_at(angle_deg: float) -> bd.Part:
    """Open-top bucket cell on outer rim; opening faces +Z for overshot entry."""
    ang = math.radians(angle_deg)
    r_mid = WHEEL_OD / 2 - BUCKET_RADIAL_DEPTH / 2
    tang_w = (math.pi * WHEEL_OD) / BUCKET_COUNT * 0.72
    wall = max(18.0, tang_w * 0.12)

    floor = bd.Box(
        tang_w - wall,
        BUCKET_RADIAL_DEPTH - wall,
        wall,
        align=(bd.Align.CENTER, bd.Align.CENTER, bd.Align.MIN),
    )
    back = bd.Box(
        tang_w,
        wall,
        BUCKET_Z_HEIGHT,
        align=(bd.Align.CENTER, bd.Align.MIN, bd.Align.MIN),
    )
    left = bd.Box(
        wall,
        BUCKET_RADIAL_DEPTH,
        BUCKET_Z_HEIGHT,
        align=(bd.Align.MAX, bd.Align.CENTER, bd.Align.MIN),
    )
    right = bd.Box(
        wall,
        BUCKET_RADIAL_DEPTH,
        BUCKET_Z_HEIGHT,
        align=(bd.Align.MIN, bd.Align.CENTER, bd.Align.MIN),
    )

    cell = floor + back + left + right
    # Local +Y = radial outward; sit on +X face of rim, protrude +Z.
    return (
        bd.Rot(Z=angle_deg)
        * bd.Pos(0, r_mid, WHEEL_THICK / 2)
        * cell
    )


def _buckets() -> bd.Part:
    step_deg = 360.0 / BUCKET_COUNT
    body = _bucket_at(0.0)
    for i in range(1, BUCKET_COUNT):
        body += _bucket_at(i * step_deg)
    return body


def _outer_rim_edges(body: bd.Part) -> list[bd.Edge]:
    r = WHEEL_OD / 2
    return [
        edge
        for edge in body.edges()
        if edge.geom_type == "CIRCLE" and abs(edge.radius - r) < 1.0
    ]


def _apply_fillets(body: bd.Part) -> bd.Part:
    outer = _outer_rim_edges(body)
    if outer:
        try:
            body = bd.fillet(outer[:8], RIM_FILLET)
        except Exception:
            pass
    return body


def _wheel_blank() -> bd.Part:
    """B0 — solid wooden disc before rim hollow and buckets."""
    return _along_axle_cylinder(WHEEL_OD / 2, WHEEL_THICK)


def _wheel_detailed() -> bd.Part:
    """B1 — rim, hub, spokes, buckets."""
    body = _rim_ring() + _hub_disc() + _spokes() + _buckets()
    body -= _axle_bore()
    return _apply_fillets(body)


@step(out="../STEP/water_wheel.step")
def water_wheel():
    return _wheel_detailed()


if __name__ == "__main__":
    water_wheel()
