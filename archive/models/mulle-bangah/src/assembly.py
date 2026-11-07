"""쌍방아 assembly — layout-driven placement, no magic numbers."""

from __future__ import annotations

from cadgen import build123d as bd
from cadgen import step

from axle import axle
from lib import layout
from mill_arm import mill_arm
from mortar import mortar
from press_cam import press_cam
from water_wheel import water_wheel


def _place(part, loc: bd.Location):
    return loc * part


def _mill_side(side: str):
    arm = mill_arm()
    if side == "neg_x":
        arm = bd.Rot(Z=180) * arm
    arm_loc = layout.mill_fulcrum_world(side)
    bowl_loc = layout.mortar_top_world(side)
    return _place(arm, arm_loc), _place(mortar(), bowl_loc)


@step(out="../STEP/assembly.step")
def assembly():
    hub = layout.wheel_hub_world()

    wheel = _place(water_wheel(), hub)
    shaft = _place(axle(), layout.axle_center_world())
    cam_pos = _place(press_cam(), layout.wheel_pos_x_face_world())
    cam_neg = _place(bd.Rot(Y=180) * press_cam(), layout.wheel_neg_x_face_world())

    arm_a, bowl_a = _mill_side("pos_x")
    arm_b, bowl_b = _mill_side("neg_x")

    return bd.Compound(
        label="mulle_bangah",
        children=[wheel, shaft, cam_pos, cam_neg, arm_a, bowl_a, arm_b, bowl_b],
    )


if __name__ == "__main__":
    assembly()
