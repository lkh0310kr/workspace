"""B3 — press cam (눌림목): hub flush to wheel face; arm +Y only; pad presses −Z."""

from __future__ import annotations

from cadgen import build123d as bd
from cadgen import step

from lib.dims import (
    AXLE_D,
    CAM_ARM_R,
    CAM_HUB_LEN,
    CAM_PAD_D,
    CAM_PAD_H,
    CAM_WIDTH,
)


@step(out="../STEP/press_cam.step")
def press_cam():
    # Origin = wheel-side face of hub (mates to wheel +X face).
    hub_outer = bd.Pos(CAM_HUB_LEN / 2, 0, 0) * bd.Rot(Y=90) * bd.Cylinder(
        AXLE_D / 2 + 18, CAM_HUB_LEN
    )
    hub_bore = bd.Pos(CAM_HUB_LEN / 2, 0, 0) * bd.Rot(Y=90) * bd.Cylinder(
        AXLE_D / 2 + 2.5, CAM_HUB_LEN + 4
    )
    hub = hub_outer - hub_bore

    arm_y0 = AXLE_D / 2 + 12.0
    arm_len = CAM_ARM_R - arm_y0
    arm = bd.Pos(CAM_HUB_LEN / 2, arm_y0, 0) * bd.Box(
        CAM_HUB_LEN * 0.5,
        arm_len,
        CAM_WIDTH,
        align=(bd.Align.CENTER, bd.Align.MIN, bd.Align.CENTER),
    )
    pad = bd.Pos(CAM_HUB_LEN / 2, CAM_ARM_R, -CAM_PAD_H / 2) * bd.Cylinder(
        CAM_PAD_D / 2,
        CAM_PAD_H,
    )
    return hub + arm + pad


if __name__ == "__main__":
    press_cam()
