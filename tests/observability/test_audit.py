"""Tests for audit logging."""

from datetime import datetime, timezone

from observability.audit import AuditLogger


def test_metadata_redaction():
    logger = AuditLogger(redact_fields={"password", "secret"})
    event = logger.log_event(
        actor="user:1",
        action="login",
        target="console",
        metadata={"password": "hunter2", "status": "success"},
        timestamp=datetime(2024, 1, 1, tzinfo=timezone.utc),
    )
    assert event.metadata["password"] == "<redacted>"
    assert event.metadata["status"] == "success"


def test_risk_scoring_uses_action_weight_and_failures():
    logger = AuditLogger(action_weights={"delete": 4}, failure_indicators={"status": {"denied"}})
    event = logger.log_event(
        actor="user:1",
        action="delete",
        target="record:1",
        metadata={"status": "denied", "severity": "high", "success": False},
    )
    # Base 1 + action weight 4 + severity high (3) + failure indicator 2 + success False (2)
    assert event.risk_score == 12.0
