"""B3 — pottery wheel assembly: plinth + shaft + wheel head."""

from __future__ import annotations

from cadgen import build123d as bd
from cadgen import step
from cadgen.assembly import AssemblyHelper

from lib.dims import BEARING_POCKET_DEPTH
from plinth import plinth
from shaft import shaft
from splash_pan import splash_pan
from wheel_head import wheel_head


@step(out="../STEP/assembly.step")
def assembly():
    asm = AssemblyHelper("pottery_wheel")

    base = asm.add(plinth(), "plinth")
    pan = asm.add(splash_pan(), "splash_pan")
    spindle = asm.add(shaft(), "shaft")
    head = asm.add(wheel_head(), "wheel_head")

    pan_seat = asm.rigid_frame(base, "top_rim", bd.Location((0, 0, 0)))
    pan_base = asm.rigid_frame(pan, "mount", bd.Location((0, 0, 0)))
    asm.coaxial(pan_seat, pan_base)
    asm.face_to_face(pan_seat, pan_base)

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
