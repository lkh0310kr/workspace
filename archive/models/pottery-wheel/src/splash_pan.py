"""B2 — splash pan: annular tray + drain cup (multi-solid compound)."""

from __future__ import annotations

from cadgen import build123d as bd
from cadgen import step

from lib.dims import (
    DRAIN_D,
    DRAIN_H,
    DRAIN_INSET,
    PAN_DEPTH,
    PAN_FILLET,
    PAN_INNER_GAP,
    PAN_OD,
    WHEEL_D,
)


def _tray_ring() -> bd.Part:
    outer_r = PAN_OD / 2
    inner_r = WHEEL_D / 2 + PAN_INNER_GAP
    outer = bd.Pos(0, 0, -PAN_DEPTH / 2) * bd.Cylinder(outer_r, PAN_DEPTH)
    inner_void = bd.Pos(0, 0, PAN_DEPTH / 2) * bd.Cylinder(inner_r, PAN_DEPTH + 4)
    return outer - inner_void


def _drain_cup() -> bd.Part:
    outer_r = PAN_OD / 2
    y = -(outer_r - DRAIN_INSET)
    z = -PAN_DEPTH + DRAIN_H / 2
    return bd.Pos(0, y, z) * bd.Cylinder(DRAIN_D / 2, DRAIN_H)


def _tray_top_edges(tray: bd.Part) -> list[bd.Edge]:
    outer_r = PAN_OD / 2
    return [
        edge
        for edge in tray.edges().filter_by_position(bd.Axis.Z, -0.2, 0.2)
        if edge.radius > outer_r - 1.0
    ]


@step(out="../STEP/splash_pan.step")
def splash_pan():
    tray = _tray_ring()
    top_edges = _tray_top_edges(tray)
    if top_edges:
        tray = bd.fillet(top_edges, PAN_FILLET)
    drain = _drain_cup()
    return bd.Compound(children=[tray, drain], label="splash_pan")


if __name__ == "__main__":
    splash_pan()
