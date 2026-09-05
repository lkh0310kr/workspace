"""B1 — pottery wheel head: rim, underside boss, bat-pin holes, fillets."""

from __future__ import annotations

import math

from cadgen import build123d as bd
from cadgen import step

from lib.dims import (
    BAT_PIN_D,
    BAT_PIN_DEPTH,
    BAT_PIN_RADIUS,
    BOSS_FILLET,
    BOSS_H,
    BOSS_WALL,
    CENTER_BORE_D,
    HEAD_THICKNESS,
    RIM_FILLET,
    RIM_HEIGHT,
    RIM_INNER_FILLET,
    RIM_WIDTH,
    WHEEL_D,
)


def _disc() -> bd.Part:
    return bd.Pos(0, 0, HEAD_THICKNESS / 2) * bd.Cylinder(WHEEL_D / 2, HEAD_THICKNESS)


def _rim_ring() -> bd.Part:
    rim_od = WHEEL_D / 2
    rim_id = rim_od - RIM_WIDTH
    z = HEAD_THICKNESS + RIM_HEIGHT / 2
    outer = bd.Pos(0, 0, z) * bd.Cylinder(rim_od, RIM_HEIGHT)
    inner_void = bd.Pos(0, 0, z) * bd.Cylinder(rim_id, RIM_HEIGHT + 2)
    return outer - inner_void


def _underside_boss() -> bd.Part:
    boss_r = CENTER_BORE_D / 2 + BOSS_WALL
    return bd.Pos(0, 0, -BOSS_H / 2) * bd.Cylinder(boss_r, BOSS_H)


def _center_bore() -> bd.Part:
    depth = HEAD_THICKNESS + BOSS_H + 4
    return bd.Pos(0, 0, HEAD_THICKNESS / 2) * bd.Cylinder(CENTER_BORE_D / 2, depth)


def _bat_pin_holes() -> list[bd.Part]:
    holes: list[bd.Part] = []
    for deg in (0, 180):
        ang = math.radians(deg)
        x = BAT_PIN_RADIUS * math.cos(ang)
        y = BAT_PIN_RADIUS * math.sin(ang)
        z = HEAD_THICKNESS - BAT_PIN_DEPTH / 2
        holes.append(bd.Pos(x, y, z) * bd.Cylinder(BAT_PIN_D / 2, BAT_PIN_DEPTH + 4))
    return holes


def _rim_outer_edges(body: bd.Part) -> list[bd.Edge]:
    top_z = HEAD_THICKNESS + RIM_HEIGHT
    return [
        edge
        for edge in body.edges().filter_by_position(bd.Axis.Z, top_z - 0.2, top_z + 0.2)
        if edge.radius > WHEEL_D / 2 - 0.5
    ]


def _rim_inner_edges(body: bd.Part) -> list[bd.Edge]:
    rim_id = WHEEL_D / 2 - RIM_WIDTH
    return [
        edge
        for edge in body.edges().filter_by_position(bd.Axis.Z, HEAD_THICKNESS - 0.2, HEAD_THICKNESS + 0.2)
        if abs(edge.radius - rim_id) < 0.5
    ]


def _boss_shoulder_edges(body: bd.Part) -> list[bd.Edge]:
    boss_r = CENTER_BORE_D / 2 + BOSS_WALL
    return [
        edge
        for edge in body.edges().filter_by_position(bd.Axis.Z, -0.2, 0.2)
        if abs(edge.radius - boss_r) < 0.5
    ]


def _apply_fillets(body: bd.Part) -> bd.Part:
    outer = _rim_outer_edges(body)
    if outer:
        body = bd.fillet(outer, RIM_FILLET)
    inner = _rim_inner_edges(body)
    if inner:
        body = bd.fillet(inner, RIM_INNER_FILLET)
    boss = _boss_shoulder_edges(body)
    if boss:
        body = bd.fillet(boss, BOSS_FILLET)
    return body


@step(out="../STEP/wheel_head.step")
def wheel_head():
    body = _disc() + _rim_ring() + _underside_boss()
    body -= _center_bore()
    body -= _bat_pin_holes()
    return _apply_fillets(body)


if __name__ == "__main__":
    wheel_head()
