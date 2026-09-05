"""Root assembly — plinth, splash pan, drive train, belt, shaft, and wheel head."""

from __future__ import annotations

from cadgen import build123d as bd
from cadgen import step
from cadgen.assembly import AssemblyHelper

from drive_belt import drive_belt
from lib.drive_layout import (
    bearing_journal_z_from_shaft_base,
    motor_mount_y,
    shaft_base_z_world,
)
from lib.dims import BEARING_POCKET_DEPTH
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
    head = asm.add(wheel_head(), "wheel_head")

    pan_seat = asm.rigid_frame(base, "top_rim", bd.Location((0, 0, 0)))
    pan_base = asm.rigid_frame(pan, "mount", bd.Location((0, 0, 0)))
    asm.coaxial(pan_seat, pan_base)
    asm.face_to_face(pan_seat, pan_base)

    motor_bay = asm.rigid_frame(
        base,
        "motor_bay_floor",
        bd.Location((0, motor_mount_y(), shaft_base_z_world())),
    )
    mount_foot = asm.rigid_frame(mount, "foot", bd.Location((0, motor_mount_y(), 0)))
    asm.coaxial(motor_bay, mount_foot)
    asm.face_to_face(motor_bay, mount_foot)

    shaft_floor = asm.rigid_frame(base, "shaft_floor", bd.Location((0, 0, shaft_base_z_world())))
    shaft_base = asm.rigid_frame(spindle, "base", bd.Location((0, 0, 0)))
    asm.coaxial(shaft_floor, shaft_base)
    asm.face_to_face(shaft_floor, shaft_base)

    belt_floor = asm.rigid_frame(base, "shaft_floor", bd.Location((0, 0, shaft_base_z_world())))
    belt_root = asm.rigid_frame(belt, "root", bd.Location((0, 0, 0)))
    asm.coaxial(belt_floor, belt_root)
    asm.face_to_face(belt_floor, belt_root)

    bearing_seat = asm.rigid_frame(base, "bearing_seat", bd.Location((0, 0, -BEARING_POCKET_DEPTH)))
    bearing_journal = asm.rigid_frame(
        spindle,
        "bearing_journal",
        bd.Location((0, 0, bearing_journal_z_from_shaft_base())),
    )
    asm.coaxial(bearing_seat, bearing_journal)

    shaft_axis = asm.revolute_frame(spindle, "axis", bd.Axis((0, 0, 0), (0, 0, 1)))
    head_mount = asm.rigid_frame(head, "spindle_bore", bd.Location((0, 0, 0)))
    asm.revolute(shaft_axis, head_mount, angle=0)

    return asm.build()


if __name__ == "__main__":
    assembly()
