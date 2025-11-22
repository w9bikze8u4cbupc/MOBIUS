from __future__ import annotations

import json
import os
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from typing import Any, Dict, Optional


LOG_RELATIVE_PATH = "logs/genesis_evaluations.jsonl"


@dataclass
class GenesisEvalLogEntry:
    projectId: str
    tutorialId: str
    mobiusExportVersion: str
    g2QualityVersion: str
    g3VisualizationVersion: str
    g4ClarityVersion: str
    g5AnalyticsVersion: str
    g6FeedbackVersion: str
    grade: str
    clarityScore: float
    distanceFromCentroid: float
    hasRecommendations: bool
    compatible: bool
    createdAtUtc: str


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def log_genesis_evaluation(
    *,
    project_id: str,
    g4_bundle: Dict[str, Any],
    g5_bundle: Dict[str, Any],
    g6_bundle: Dict[str, Any],
    compatible: bool,
    repo_root: Optional[str] = None,
) -> None:
    """
    Append a single JSONL log entry for a completed GENESIS evaluation.
    This is intended to be called once per tutorial after G6 has been written.
    """
    if repo_root is None:
        repo_root = os.getcwd()

    identity = g6_bundle.get("input", {})
    summary = g6_bundle.get("summary", {})
    g4_identity = g4_bundle.get("identity", {})
    contract_g2 = g4_identity.get("g2QualityContractVersion", "")
    contract_g3 = g4_identity.get("g3VisualizationContractVersion", "")
    contract_g4 = g4_bundle.get("contract", {}).get("version", "")
    contract_g5 = g5_bundle.get("contract", {}).get("version", "")
    contract_g6 = g6_bundle.get("contract", {}).get("version", "")

    entry = GenesisEvalLogEntry(
        projectId=str(project_id),
        tutorialId=str(identity.get("tutorialId", g4_identity.get("tutorialId", ""))),
        mobiusExportVersion=str(identity.get("mobiusExportVersion", "")),
        g2QualityVersion=str(contract_g2),
        g3VisualizationVersion=str(contract_g3),
        g4ClarityVersion=str(contract_g4),
        g5AnalyticsVersion=str(contract_g5),
        g6FeedbackVersion=str(contract_g6),
        grade=str(summary.get("grade", "")),
        clarityScore=float(summary.get("clarityScore", 0.0)),
        distanceFromCentroid=float(summary.get("distanceFromCentroid", 0.0)),
        hasRecommendations=bool(g6_bundle.get("recommendations")),
        compatible=bool(compatible),
        createdAtUtc=_utc_now_iso(),
    )

    log_path = os.path.join(repo_root, LOG_RELATIVE_PATH)
    os.makedirs(os.path.dirname(log_path), exist_ok=True)
    with open(log_path, "a", encoding="utf-8") as f:
        f.write(json.dumps(asdict(entry), separators=(",", ":")) + "\n")


__all__ = [
    "GenesisEvalLogEntry",
    "log_genesis_evaluation",
    "LOG_RELATIVE_PATH",
]
