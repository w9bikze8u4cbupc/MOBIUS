from __future__ import annotations

from typing import Any, List


def _is_number(x: Any) -> bool:
    return isinstance(x, (int, float))


def _approx_equal(a: float, b: float, eps: float) -> bool:
    return abs(a - b) <= eps


def json_diff(
    current: Any,
    golden: Any,
    *,
    path: str = "",
    numeric_eps: float = 1e-6,
) -> List[str]:
    """
    Compare two JSON-like structures. Returns a list of human-readable
    differences. Numeric fields are compared with tolerance numeric_eps.
    """
    diffs: List[str] = []

    if type(current) is not type(golden):
        diffs.append(f"{path}: type mismatch {type(current).__name__} != {type(golden).__name__}")
        return diffs

    if isinstance(current, dict):
        current_keys = set(current.keys())
        golden_keys = set(golden.keys())
        for missing in sorted(golden_keys - current_keys):
            diffs.append(f"{path}: missing key in current: {missing}")
        for extra in sorted(current_keys - golden_keys):
            diffs.append(f"{path}: extra key in current: {extra}")
        for key in sorted(current_keys & golden_keys):
            sub_path = f"{path}.{key}" if path else key
            diffs.extend(json_diff(current[key], golden[key], path=sub_path, numeric_eps=numeric_eps))
    elif isinstance(current, list):
        if len(current) != len(golden):
            diffs.append(f"{path}: list length mismatch {len(current)} != {len(golden)}")
            # Still compare up to the min length to see structural issues.
        for idx, (c_item, g_item) in enumerate(zip(current, golden)):
            sub_path = f"{path}[{idx}]"
            diffs.extend(json_diff(c_item, g_item, path=sub_path, numeric_eps=numeric_eps))
    elif _is_number(current) and _is_number(golden):
        if not _approx_equal(float(current), float(golden), numeric_eps):
            diffs.append(f"{path}: numeric mismatch {current} != {golden} (eps={numeric_eps})")
    else:
        if current != golden:
            diffs.append(f"{path}: value mismatch {current!r} != {golden!r}")

    return diffs
