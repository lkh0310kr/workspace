"""Shared drive-train layout — mate datums for assembly."""

from __future__ import annotations

from lib.dims import PLINTH_H


def shaft_base_z_world() -> float:
    return -PLINTH_H
