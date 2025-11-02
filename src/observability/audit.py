"""Structured audit logging utilities."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Callable, Dict, Iterable, List, Mapping, MutableMapping, Optional

RiskEvaluator = Callable[["AuditEvent"], float]


@dataclass(frozen=True)
class AuditEvent:
    """Represents a single audit event."""

    actor: str
    action: str
    target: str
    timestamp: datetime
    metadata: Mapping[str, Any]
    risk_score: float

    def to_dict(self) -> Dict[str, Any]:
        """Convert the event to a serialisable dictionary."""
        return {
            "actor": self.actor,
            "action": self.action,
            "target": self.target,
            "timestamp": self.timestamp.isoformat(),
            "metadata": dict(self.metadata),
            "risk_score": self.risk_score,
        }


class AuditLogger:
    """Audit logger with metadata redaction and risk scoring."""

    def __init__(
        self,
        *,
        redact_fields: Optional[Iterable[str]] = None,
        action_weights: Optional[Mapping[str, float]] = None,
        failure_indicators: Optional[Mapping[str, Iterable[Any]]] = None,
        severity_weights: Optional[Mapping[str, float]] = None,
        evaluators: Optional[Iterable[RiskEvaluator]] = None,
    ) -> None:
        self._redact_fields = {field.lower() for field in (redact_fields or [])}
        self._action_weights = dict(action_weights or {})
        self._failure_indicators = {
            key.lower(): {str(value).lower() for value in values}
            for key, values in (failure_indicators or {"status": {"failed", "denied", "error"}}).items()
        }
        self._severity_weights = dict(
            severity_weights
            or {
                "low": 0.0,
                "medium": 1.0,
                "high": 3.0,
                "critical": 5.0,
            }
        )
        self._evaluators = list(evaluators or [])
        self._events: List[AuditEvent] = []

    @property
    def events(self) -> List[AuditEvent]:
        """Return the recorded audit events."""
        return list(self._events)

    def log_event(
        self,
        *,
        actor: str,
        action: str,
        target: str,
        metadata: Optional[MutableMapping[str, Any]] = None,
        timestamp: Optional[datetime] = None,
    ) -> AuditEvent:
        """Create and store an audit event."""
        ts = timestamp or datetime.now(timezone.utc)
        cleaned_metadata = self._redact_metadata(metadata or {})
        risk_score = self._calculate_risk(action, cleaned_metadata)
        event = AuditEvent(actor=actor, action=action, target=target, timestamp=ts, metadata=cleaned_metadata, risk_score=risk_score)
        self._events.append(event)
        return event

    def _redact_metadata(self, metadata: MutableMapping[str, Any]) -> MutableMapping[str, Any]:
        """Return metadata with sensitive fields redacted."""
        redacted = dict(metadata)
        for key in list(redacted.keys()):
            if key.lower() in self._redact_fields:
                redacted[key] = "<redacted>"
        return redacted

    def _calculate_risk(self, action: str, metadata: Mapping[str, Any]) -> float:
        """Calculate a risk score using configured heuristics."""
        score = 1.0 + self._action_weights.get(action, 0.0)
        severity = metadata.get("severity")
        if severity:
            score += self._severity_weights.get(str(severity).lower(), 0.0)
        for key, risky_values in self._failure_indicators.items():
            value = metadata.get(key)
            if value is not None and str(value).lower() in risky_values:
                score += 2.0
        success = metadata.get("success")
        if success is False:
            score += 2.0
        for evaluator in self._evaluators:
            score += float(evaluator(
                AuditEvent(
                    actor="", action=action, target="", timestamp=datetime.now(timezone.utc), metadata=metadata, risk_score=score
                )
            ))
        return score
