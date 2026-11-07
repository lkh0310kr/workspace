"""First-order energy estimates from dims — no CFD, educational only."""

from __future__ import annotations

import math

from lib.dims import FLOW_LPS, HEAD_HEIGHT, WHEEL_OD

G = 9.81  # m/s²
RHO = 1000.0  # kg/m³
OVERSHOT_EFF = 0.65  # typical 60–75 %


def hydraulic_power_watts() -> float:
    """Ideal power ρ g Q h; Q in m³/s."""
    q_m3s = FLOW_LPS / 1000.0
    h_m = HEAD_HEIGHT / 1000.0
    return RHO * G * q_m3s * h_m


def shaft_power_watts() -> float:
    return hydraulic_power_watts() * OVERSHOT_EFF


def torque_at_rim_n_m(mass_kg: float) -> float:
    """τ ≈ m g r for one filled bucket at horizontal (worst-case arm)."""
    r_m = (WHEEL_OD / 2) / 1000.0
    return mass_kg * G * r_m


def bucket_water_mass_kg() -> float:
    """Rough fill from one bucket volume order-of-magnitude."""
    from lib.dims import BUCKET_RADIAL_DEPTH, BUCKET_Z_HEIGHT, BUCKET_COUNT

    arc_m = (math.pi * WHEEL_OD / 1000.0) / BUCKET_COUNT
    vol_m3 = arc_m * (BUCKET_RADIAL_DEPTH / 1000.0) * (BUCKET_Z_HEIGHT / 1000.0) * 0.55
    return RHO * vol_m3


def summary() -> dict[str, float]:
    m = bucket_water_mass_kg()
    return {
        "head_m": HEAD_HEIGHT / 1000.0,
        "flow_lps": FLOW_LPS,
        "hydraulic_kw": hydraulic_power_watts() / 1000.0,
        "shaft_kw_est": shaft_power_watts() / 1000.0,
        "bucket_mass_kg": m,
        "torque_one_bucket_n_m": torque_at_rim_n_m(m),
    }
