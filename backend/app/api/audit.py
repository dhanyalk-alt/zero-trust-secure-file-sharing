from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func

from backend.app.database import get_db
from backend.app.models.user import User
from backend.app.models.file import EncryptedFile
from backend.app.models.audit import AuditLog
from backend.app.schemas.audit import AuditLogOut, SecuritySummary
from backend.app.security.auth import get_current_user

router = APIRouter(prefix="/api/audit", tags=["Audit & Security Monitoring"])


@router.get("/chain-verify")
def verify_audit_chain(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Verify the cryptographic integrity of the audit log chain."""
    import hashlib
    import json

    logs = db.query(AuditLog).order_by(AuditLog.id.asc()).all()
    total = len(logs)
    verified = 0
    tampered = []
    prev_hash = "0" * 64

    for log in logs:
        if not log.event_hash:
            continue
        chain_payload = {
            "id": log.id,
            "timestamp": log.timestamp.isoformat() if log.timestamp else "",
            "user_id": log.user_id,
            "action": log.action,
            "status": log.status,
            "resource_id": log.resource_id,
            "details": log.details,
            "prev_hash": log.prev_hash or prev_hash
        }
        expected_hash = hashlib.sha256(json.dumps(chain_payload, sort_keys=True).encode("utf-8")).hexdigest()

        if log.event_hash == expected_hash and (log.prev_hash == prev_hash or prev_hash == ("0" * 64)):
            verified += 1
            prev_hash = log.event_hash
        else:
            tampered.append(log.id)
            prev_hash = log.event_hash or prev_hash

    return {
        "total": total,
        "verified": verified,
        "tampered": tampered,
        "chain_valid": len(tampered) == 0,
        "unhashed_entries": total - verified - len(tampered)
    }


@router.get("/logs", response_model=List[AuditLogOut])
def get_audit_logs(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    action: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    resource_id: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    query = db.query(AuditLog)

    # Standard users can see events where they are actor OR events on files they own
    if current_user.role != "ADMIN":
        user_file_ids = [f[0] for f in db.query(EncryptedFile.id).filter(EncryptedFile.owner_id == current_user.id).all()]
        query = query.filter(
            (AuditLog.user_id == current_user.id) |
            (AuditLog.username == current_user.username) |
            (AuditLog.resource_id.in_(user_file_ids))
        )

    if action:
        query = query.filter(AuditLog.action == action)
    if status:
        query = query.filter(AuditLog.status == status)
    if resource_id:
        query = query.filter(AuditLog.resource_id == resource_id)

    logs = query.order_by(AuditLog.timestamp.desc()).offset(offset).limit(limit).all()
    return logs


@router.get("/security-summary", response_model=SecuritySummary)
def get_security_summary(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    base_query = db.query(AuditLog)
    if current_user.role != "ADMIN":
        user_file_ids = [f[0] for f in db.query(EncryptedFile.id).filter(EncryptedFile.owner_id == current_user.id).all()]
        base_query = base_query.filter(
            (AuditLog.user_id == current_user.id) |
            (AuditLog.username == current_user.username) |
            (AuditLog.resource_id.in_(user_file_ids))
        )

    total_audits = base_query.count()

    successful_logins = base_query.filter(AuditLog.action == "LOGIN_SUCCESS").count()
    failed_logins = base_query.filter(AuditLog.action == "LOGIN_ATTEMPT", AuditLog.status == "FAILED").count()
    revocations = base_query.filter(AuditLog.action == "ACCESS_REVOKED").count()
    denied = base_query.filter(AuditLog.status == "DENIED").count()
    tamper_alerts = base_query.filter(AuditLog.status.in_(["TAMPERED", "SUSPICIOUS"])).count()

    recent_events = base_query.order_by(AuditLog.timestamp.desc()).limit(10).all()

    return SecuritySummary(
        total_audits=total_audits,
        successful_logins=successful_logins,
        failed_logins=failed_logins,
        revocation_events=revocations,
        denied_events=denied,
        tamper_alerts=tamper_alerts,
        recent_events=recent_events
    )
