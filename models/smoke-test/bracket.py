"""Smoke-test part for text-to-cad / cadgen."""

from __future__ import annotations

from cadgen import build123d as bd
from cadgen import step

WIDTH = 40.0
DEPTH = 30.0
HEIGHT = 10.0


@step(out="bracket.step")
def bracket():
    return bd.Box(WIDTH, DEPTH, HEIGHT)


if __name__ == "__main__":
    bracket()
