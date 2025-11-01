"""Audit logging helpers used by security sensitive services."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Iterable, List, Mapping, Optional


@dataclass(frozen=True)
class AuditEvent:
    """Normalized audit event representation."""

    actor: str
    action: str
    target: str
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    metadata: Mapping[str, str] = field(default_factory=dict)
    risk_score: int = 0

    def redact(self, fields: Iterable[str]) -> "AuditEvent":
        redacted = {key: ("[REDACTED]" if key in fields else value) for key, value in self.metadata.items()}
        return AuditEvent(
            actor=self.actor,
            action=self.action,
            target=self.target,
            timestamp=self.timestamp,
            metadata=redacted,
            risk_score=self.risk_score,
        )


class AuditLogger:
    """Captures structured audit events with optional risk scoring."""

    def __init__(self, *, redact_fields: Optional[Iterable[str]] = None) -> None:
        self._events: List[AuditEvent] = []
        self._redact_fields = set(redact_fields or [])

    def log_event(
        self,
        *,
        actor: str,
        action: str,
        target: str,
        metadata: Optional[Mapping[str, str]] = None,
        risk_score: int = 0,
    ) -> AuditEvent:
        if not actor or not action or not target:
            raise ValueError("actor, action, and target are required for audit events")
        if risk_score < 0:
            raise ValueError("risk_score cannot be negative")

        event = AuditEvent(
            actor=actor,
            action=action,
            target=target,
            metadata=dict(metadata or {}),
            risk_score=risk_score,
        )
        if self._redact_fields:
            event = event.redact(self._redact_fields)

        self._events.append(event)
        return event

    @property
    def events(self) -> List[AuditEvent]:
        return list(self._events)

    def latest_for_actor(self, actor: str) -> Optional[AuditEvent]:
        for event in reversed(self._events):
            if event.actor == actor:
                return event
        return None

