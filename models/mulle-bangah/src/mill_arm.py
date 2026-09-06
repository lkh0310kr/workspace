"""B4 — mill arm (방아채) + pestle: fulcrum foot at origin, strike at −Y, pestle at +Y."""

from __future__ import annotations

from cadgen import build123d as bd
from cadgen import step

from lib.dims import (
    BEAM_SECTION,
    MILL_FULCRUM_H,
    PESTLE_ARM_LEN,
    PESTLE_D,
    PESTLE_H,
    STRIKE_ARM_LEN,
)


@step(out="../STEP/mill_arm.step")
def mill_arm():
    post = bd.Cylinder(BEAM_SECTION * 0.55, MILL_FULCRUM_H)
    beam_z = MILL_FULCRUM_H + BEAM_SECTION / 2
    span = STRIKE_ARM_LEN + PESTLE_ARM_LEN
    beam = bd.Pos(0, (PESTLE_ARM_LEN - STRIKE_ARM_LEN) / 2, beam_z) * bd.Box(
        BEAM_SECTION,
        span,
        BEAM_SECTION,
        align=(bd.Align.CENTER, bd.Align.CENTER, bd.Align.CENTER),
    )
    pestle = bd.Pos(0, PESTLE_ARM_LEN, beam_z - PESTLE_H / 2) * bd.Cylinder(
        PESTLE_D / 2,
        PESTLE_H,
    )
    return post + beam + pestle


if __name__ == "__main__":
    mill_arm()
