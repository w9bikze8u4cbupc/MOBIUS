from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import List, Dict, Any


MATRIX_FILENAME = "docs/spec/genesis_mobius_compat_matrix_v1.0.0.json"


@dataclass
class ContractVersions:
    mobius_app_version: str
    mobius_export_bundle: str
    g0_export: str
    g1_ingest: str
    g2_quality: str
    g3_visualization: str
    g4_clarity_insight: str
    g5_analytics: str
    g6_mobius_feedback: str


@dataclass
class CompatResult:
    compatible: bool
    reason: str
    matched_row: Dict[str, Any] | None


def _load_matrix(root: Path | None = None) -> Dict[str, Any]:
    if root is None:
        root = Path(__file__).resolve().parents[2]
    path = root / MATRIX_FILENAME
    data = json.loads(path.read_text(encoding="utf-8"))
    return data


def _match_pattern(version: str, pattern: str) -> bool:
    """
    Match '1.0.3' against '1.0.x' or exact '1.0.3'.
    """
    if pattern.endswith(".x"):
        prefix = pattern[:-2]
        return version.startswith(prefix + ".")
    return version == pattern


def check_genesis_mobius_compat(
    versions: ContractVersions,
    *,
    root: Path | None = None,
) -> CompatResult:
    matrix = _load_matrix(root)
    supported: List[Dict[str, Any]] = matrix.get("supported", [])

    for row in supported:
        if not (
            _match_pattern(versions.mobius_app_version, row["mobiusAppVersion"])
            and _match_pattern(versions.mobius_export_bundle, row["mobiusExportBundle"])
            and _match_pattern(versions.g0_export, row["g0ExportContract"])
            and _match_pattern(versions.g1_ingest, row["g1IngestContract"])
            and _match_pattern(versions.g2_quality, row["g2QualityContract"])
            and _match_pattern(versions.g3_visualization, row["g3VisualizationContract"])
            and _match_pattern(versions.g4_clarity_insight, row["g4ClarityInsightContract"])
            and _match_pattern(versions.g5_analytics, row["g5AnalyticsContract"])
            and _match_pattern(versions.g6_mobius_feedback, row["g6MobiusFeedbackContract"])
        ):
            continue
        return CompatResult(
            compatible=True,
            reason=f"Matched matrix row with status={row.get('status', 'unknown')}",
            matched_row=row,
        )

    return CompatResult(
        compatible=False,
        reason="No compatible entry found in genesis_mobius_compat_matrix.",
        matched_row=None,
    )
