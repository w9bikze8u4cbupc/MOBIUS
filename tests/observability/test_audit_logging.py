import pytest

from telemetry.audit import AuditLogger


def test_audit_logger_records_structured_events():
    logger = AuditLogger()

    event = logger.log_event(
        actor="alice",
        action="create",
        target="project:42",
        metadata={"ip": "127.0.0.1", "agent": "pytest"},
        risk_score=5,
    )

    assert event.actor == "alice"
    assert event.metadata["agent"] == "pytest"
    assert event.risk_score == 5
    assert logger.latest_for_actor("alice") == event


def test_audit_logger_redacts_sensitive_fields():
    logger = AuditLogger(redact_fields={"ip"})

    event = logger.log_event(
        actor="bob",
        action="download",
        target="asset:9001",
        metadata={"ip": "10.0.0.5", "file": "manual.pdf"},
    )

    assert event.metadata["ip"] == "[REDACTED]"
    assert event.metadata["file"] == "manual.pdf"


@pytest.mark.parametrize("field", ["actor", "action", "target"])
def test_audit_logger_requires_mandatory_fields(field):
    logger = AuditLogger()
    kwargs = dict(actor="carol", action="delete", target="asset:12")
    kwargs[field] = ""

    with pytest.raises(ValueError):
        logger.log_event(**kwargs)


def test_audit_logger_rejects_negative_risk_score():
    logger = AuditLogger()
    with pytest.raises(ValueError):
        logger.log_event(actor="dan", action="read", target="asset", risk_score=-1)

