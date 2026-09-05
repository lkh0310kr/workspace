"""B3 — plinth + splash pan + shaft + wheel head."""

from __future__ import annotations

from cadgen import build123d as bd
from cadgen import step
from cadgen.assembly import AssemblyHelper

from lib.dims import PAN_DEPTH
from lib.drive_layout import shaft_base_z_world
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

    pan_seat = asm.rigid_frame(base, "top_rim", bd.Location((0, 0, 0)))
    pan_base = asm.rigid_frame(pan, "pan_bottom", bd.Location((0, 0, -PAN_DEPTH)))
    asm.coaxial(pan_seat, pan_base)
    asm.face_to_face(pan_seat, pan_base)

    shaft_floor = asm.rigid_frame(base, "shaft_floor", bd.Location((0, 0, shaft_base_z_world())))
    shaft_base = asm.rigid_frame(spindle, "base", bd.Location((0, 0, 0)))
    asm.coaxial(shaft_floor, shaft_base)
    asm.face_to_face(shaft_floor, shaft_base)

    placed = asm.build()
    head = bd.Pos(0, 0, 0) * wheel_head()
    return bd.Compound(label="pottery_wheel", children=[*placed.children, head])


if __name__ == "__main__":
    assembly()
