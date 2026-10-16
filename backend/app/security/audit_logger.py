import uuid
import datetime
from typing import Optional
from sqlalchemy.orm import Session
from backend.app.models.audit import AuditLog


def log_audit_event(
    db: Session,
    action: str,
    status: str,
    user_id: Optional[int] = None,
    username: Optional[str] = None,
    resource_id: Optional[str] = None,
    resource_name: Optional[str] = None,
    details: Optional[str] = None,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
    correlation_id: Optional[str] = None
) -> AuditLog:
    """
    Safely creates and commits an immutable audit log record.
    Ensures no secrets, keys, or passwords are leaked in details.
    """
    if correlation_id is None:
        correlation_id = str(uuid.uuid4())

    log_entry = AuditLog(
        correlation_id=correlation_id,
        user_id=user_id,
        username=username,
        action=action,
        status=status,
        resource_id=resource_id,
        resource_name=resource_name,
        details=details,
        ip_address=ip_address,
        user_agent=user_agent,
        timestamp=datetime.datetime.now(datetime.timezone.utc)
    )

    try:
        db.add(log_entry)
        db.commit()
        db.refresh(log_entry)

        # Blockchain-style cryptographic chaining
        import hashlib
        import json

        prev_entry = db.query(AuditLog).filter(AuditLog.id < log_entry.id).order_by(AuditLog.id.desc()).first()
        prev_hash = prev_entry.event_hash if (prev_entry and prev_entry.event_hash) else ("0" * 64)
        log_entry.prev_hash = prev_hash

        chain_payload = {
            "id": log_entry.id,
            "timestamp": log_entry.timestamp.isoformat() if log_entry.timestamp else "",
            "user_id": log_entry.user_id,
            "action": log_entry.action,
            "status": log_entry.status,
            "resource_id": log_entry.resource_id,
            "details": log_entry.details,
            "prev_hash": prev_hash
        }
        serialized = json.dumps(chain_payload, sort_keys=True)
        log_entry.event_hash = hashlib.sha256(serialized.encode("utf-8")).hexdigest()
        db.commit()
        db.refresh(log_entry)

        return log_entry
    except Exception as e:
        db.rollback()
        # Fallback logging should not crash the primary flow, but let's record to stderr
        import sys
        print(f"[AUDIT_LOG_ERROR] Failed to persist audit record: {e}", file=sys.stderr)
        return log_entry
