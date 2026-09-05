"""Root assembly — plinth, splash pan, drive train, belt, shaft, and wheel head."""

from __future__ import annotations

from cadgen import build123d as bd
from cadgen import step
from cadgen.assembly import AssemblyHelper

from drive_belt import drive_belt
from lib.dims import PAN_DEPTH
from lib.drive_layout import motor_mount_y, shaft_base_z_world
from motor_mount import motor_mount
from plinth import plinth
from shaft import shaft
from splash_pan import splash_pan
from wheel_head import wheel_head


@step(out="../STEP/assembly.step")
def assembly():
    asm = AssemblyHelper("pottery_wheel")

    base = asm.add(plinth(), "plinth")
    pan = asm.add(splash_pan(), "splash_pan")
    mount = asm.add(motor_mount(), "motor_mount")
    belt = asm.add(drive_belt(), "drive_belt")
    spindle = asm.add(shaft(), "shaft")

    pan_seat = asm.rigid_frame(base, "top_rim", bd.Location((0, 0, 0)))
    pan_base = asm.rigid_frame(pan, "pan_bottom", bd.Location((0, 0, -PAN_DEPTH)))
    asm.coaxial(pan_seat, pan_base)
    asm.face_to_face(pan_seat, pan_base)

    motor_bay = asm.rigid_frame(
        base,
        "motor_bay_floor",
        bd.Location((0, motor_mount_y(), shaft_base_z_world())),
    )
    mount_foot = asm.rigid_frame(mount, "foot", bd.Location((0, 0, 0)))
    asm.coaxial(motor_bay, mount_foot)
    asm.face_to_face(motor_bay, mount_foot)

    shaft_floor = asm.rigid_frame(base, "shaft_floor", bd.Location((0, 0, shaft_base_z_world())))
    shaft_base = asm.rigid_frame(spindle, "base", bd.Location((0, 0, 0)))
    asm.coaxial(shaft_floor, shaft_base)
    asm.face_to_face(shaft_floor, shaft_base)

    belt_root = asm.rigid_frame(belt, "root", bd.Location((0, 0, 0)))
    asm.coaxial(shaft_floor, belt_root)
    asm.face_to_face(shaft_floor, belt_root)

    placed = asm.build()
    head = bd.Pos(0, 0, 0) * wheel_head()
    return bd.Compound(label="pottery_wheel", children=[*placed.children, head])


if __name__ == "__main__":
    assembly()
