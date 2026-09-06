#!/usr/bin/env python3
"""Layout contract checks for mulle-bangah assembly STEP."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

SRC = Path(__file__).resolve().parent.parent
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from lib import layout
from lib.dims import CAM_PAD_H, WHEEL_OD
STEP = SRC.parent / "STEP" / "assembly.step"
TOL = 1e-6


def _run_json(args: list[str]) -> dict:
    root = SRC.parent.parent.parent
    cmd = [sys.executable, "-m", "cadgen.cli", *args, "--format", "json"]
    proc = subprocess.run(cmd, cwd=root, capture_output=True, text=True, check=True)
    return json.loads(proc.stdout)


def _center(bounds: list[float]) -> tuple[float, float, float]:
    return (
        (bounds[0] + bounds[3]) / 2,
        (bounds[1] + bounds[4]) / 2,
        (bounds[2] + bounds[5]) / 2,
    )


def main() -> int:
    if not STEP.is_file():
        print(f"MISSING {STEP}", file=sys.stderr)
        return 1

    facts = _run_json(["step", "inspect", "refs", str(STEP), "--facts"])
    interfere = _run_json(
        ["step", "inspect", "interfere", str(STEP), "--tolerance", str(layout.CLASH_VOL_MAX)],
    )

    checks: list[tuple[str, bool, str]] = []

    if not facts.get("ok", True):
        checks.append(("refs", False, "refs command failed"))
    if not interfere.get("ok", True):
        clashes = interfere.get("clashes", [])
        checks.append(("interfere", False, f"{len(clashes)} clashes"))

    # Bounding-box sanity on full assembly
    bb = facts.get("bounds") or facts.get("boundingBox")
    if bb:
        _center(bb)

    # Expected strike points vs cam pad (layout algebra)
    for side in ("pos_x", "neg_x"):
        pad = layout.cam_pad_world_at_press(side)
        strike = layout.mill_strike_tip_world(side)
        dy = abs(pad[1] - strike[1])
        dz = abs(pad[2] - strike[2] - CAM_PAD_H / 2)
        ok_y = dy <= layout.STRIKE_Y_TOL
        ok_z = dz <= layout.BEAM_Z_TOL
        ok = ok_y and ok_z
        checks.append(
            (
                f"strike_{side}",
                ok,
                f"Δy={dy:.1f} Δz(pad→beam)={dz:.1f}",
            ),
        )

        pestle = layout.mill_pestle_tip_world(side)
        mortar_loc = layout.mortar_top_world(side)
        mx, my, mz = mortar_loc.position.X, mortar_loc.position.Y, mortar_loc.position.Z
        dxy = ((pestle[0] - mx) ** 2 + (pestle[1] - my) ** 2) ** 0.5
        ok_xy = dxy <= layout.PESTLE_XY_TOL
        checks.append(
            (
                f"pestle_over_mortar_{side}",
                ok_xy,
                f"Δxy={dxy:.1f} mm",
            ),
        )

    hub_z = layout.wheel_hub_z()
    checks.append(
        (
            "wheel_hub_height",
            hub_z == WHEEL_OD / 2,
            f"z={hub_z:.1f}",
        ),
    )

    failed = [c for c in checks if not c[1]]
    for name, ok, detail in checks:
        status = "PASS" if ok else "FAIL"
        print(f"  [{status}] {name}: {detail}")

    if failed:
        print(f"\nLayout contract FAILED ({len(failed)} checks)", file=sys.stderr)
        return 1

    print(f"\nLayout contract OK ({len(checks)} checks)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
