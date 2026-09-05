"""Root assembly — plinth, splash pan, drive train, shaft, and wheel head."""

from __future__ import annotations

from cadgen import build123d as bd
from cadgen import step
from cadgen.assembly import AssemblyHelper

from lib.dims import BEARING_POCKET_DEPTH, PLINTH_H, PLINTH_WALL
from motor_mount import motor_mount
from plinth import plinth
from shaft import shaft
from splash_pan import splash_pan
from wheel_head import wheel_head


def _motor_bay_y() -> float:
    from lib.dims import MOTOR_BODY_D, PLINTH_D

    inner_r = PLINTH_D / 2 - PLINTH_WALL
    return inner_r - MOTOR_BODY_D / 2 - 5.0


@step(out="../STEP/assembly.step")
def assembly():
    asm = AssemblyHelper("pottery_wheel")

    base = asm.add(plinth(), "plinth")
    pan = asm.add(splash_pan(), "splash_pan")
    mount = asm.add(motor_mount(), "motor_mount")
    spindle = asm.add(shaft(), "shaft")
    head = asm.add(wheel_head(), "wheel_head")

    pan_seat = asm.rigid_frame(base, "top_rim", bd.Location((0, 0, 0)))
    pan_base = asm.rigid_frame(pan, "mount", bd.Location((0, 0, 0)))
    asm.coaxial(pan_seat, pan_base)
    asm.face_to_face(pan_seat, pan_base)

    motor_bay = asm.rigid_frame(
        base,
        "motor_bay_floor",
        bd.Location((0, _motor_bay_y(), -PLINTH_H)),
    )
    mount_foot = asm.rigid_frame(mount, "foot", bd.Location((0, _motor_bay_y(), 0)))
    asm.coaxial(motor_bay, mount_foot)
    asm.face_to_face(motor_bay, mount_foot)

    bearing_seat = asm.rigid_frame(base, "bearing_seat", bd.Location((0, 0, -BEARING_POCKET_DEPTH)))
    shaft_base = asm.rigid_frame(spindle, "base", bd.Location((0, 0, 0)))
    asm.coaxial(bearing_seat, shaft_base)
    asm.face_to_face(bearing_seat, shaft_base)

    shaft_axis = asm.revolute_frame(spindle, "axis", bd.Axis((0, 0, 0), (0, 0, 1)))
    head_mount = asm.rigid_frame(head, "spindle_bore", bd.Location((0, 0, 0)))
    asm.revolute(shaft_axis, head_mount, angle=0)

    return asm.build()


if __name__ == "__main__":
    assembly()
