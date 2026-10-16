"""
Admin API Router — Zero Trust File Vault
Provides system-wide management capabilities restricted to ADMIN role users only.
Every endpoint verifies role on every request (Zero Trust: never cache authorization).
"""
import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from sqlalchemy.orm import Session
from pydantic import BaseModel, ConfigDict

from backend.app.database import get_db
from backend.app.models.user import User
from backend.app.models.file import EncryptedFile
from backend.app.models.audit import AuditLog
from backend.app.models.permission import FilePermission
from backend.app.security.auth import get_current_user
from backend.app.security.audit_logger import log_audit_event

router = APIRouter(prefix="/api/admin", tags=["Admin"])


# ── Schemas ────────────────────────────────────────────────────────────────────

class AdminUserOut(BaseModel):
    id: int
    username: str
    email: str
    role: str
    is_active: bool
    failed_login_count: int
    lockout_until: Optional[datetime.datetime] = None
    created_at: datetime.datetime
    has_encryption_key: bool
    has_signing_key: bool
    files_owned: int

    model_config = ConfigDict(from_attributes=True)


class AdminUserUpdate(BaseModel):
    is_active: Optional[bool] = None
    role: Optional[str] = None
    clear_lockout: Optional[bool] = False


class AdminFileOut(BaseModel):
    id: str
    owner_username: str
    original_filename: str
    file_size: int
    mime_type: str
    created_at: datetime.datetime
    expires_at: Optional[datetime.datetime] = None
    is_deleted: bool
    active_permissions: int

    model_config = ConfigDict(from_attributes=True)


class SystemStatsOut(BaseModel):
    total_users: int
    active_users: int
    locked_users: int
    total_files: int
    deleted_files: int
    expired_files: int
    total_permissions: int
    revoked_permissions: int
    total_audit_logs: int
    denied_events: int
    tamper_alerts: int


# ── Helper ─────────────────────────────────────────────────────────────────────

def _require_admin(current_user: User) -> None:
    """Verify ADMIN role on every call — no caching, no trust."""
    if current_user.role != "ADMIN":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privilege required. Access denied."
        )


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("/system-stats", response_model=SystemStatsOut)
def get_system_stats(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """System-wide statistics — admin only."""
    _require_admin(current_user)
    now_utc = datetime.datetime.now(datetime.timezone.utc)

    total_users = db.query(User).count()
    active_users = db.query(User).filter(User.is_active == True).count()
    locked_users = db.query(User).filter(
        User.lockout_until != None,
        User.lockout_until > now_utc
    ).count()

    total_files = db.query(EncryptedFile).count()
    deleted_files = db.query(EncryptedFile).filter(EncryptedFile.is_deleted == True).count()
    expired_files = db.query(EncryptedFile).filter(
        EncryptedFile.expires_at != None,
        EncryptedFile.expires_at < now_utc,
        EncryptedFile.is_deleted == False
    ).count()

    total_perms = db.query(FilePermission).count()
    revoked_perms = db.query(FilePermission).filter(FilePermission.is_revoked == True).count()

    total_audits = db.query(AuditLog).count()
    denied_events = db.query(AuditLog).filter(AuditLog.status == "DENIED").count()
    tamper_alerts = db.query(AuditLog).filter(AuditLog.status.in_(["TAMPERED", "SUSPICIOUS"])).count()

    log_audit_event(
        db=db,
        action="ADMIN_SYSTEM_STATS_VIEWED",
        status="SUCCESS",
        user_id=current_user.id,
        username=current_user.username,
        details="Admin viewed system-wide statistics.",
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent")
    )

    return SystemStatsOut(
        total_users=total_users,
        active_users=active_users,
        locked_users=locked_users,
        total_files=total_files,
        deleted_files=deleted_files,
        expired_files=expired_files,
        total_permissions=total_perms,
        revoked_permissions=revoked_perms,
        total_audit_logs=total_audits,
        denied_events=denied_events,
        tamper_alerts=tamper_alerts,
    )


@router.get("/users", response_model=List[AdminUserOut])
def list_all_users(
    request: Request,
    search: Optional[str] = Query(None, description="Filter by username or email"),
    is_active: Optional[bool] = Query(None),
    role: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List all registered users with system-level details — admin only."""
    _require_admin(current_user)

    query = db.query(User)
    if search:
        like = f"%{search}%"
        query = query.filter((User.username.ilike(like)) | (User.email.ilike(like)))
    if is_active is not None:
        query = query.filter(User.is_active == is_active)
    if role:
        query = query.filter(User.role == role.upper())

    users_list = query.order_by(User.created_at.desc()).offset(offset).limit(limit).all()

    results = []
    for u in users_list:
        files_owned = db.query(EncryptedFile).filter(
            EncryptedFile.owner_id == u.id,
            EncryptedFile.is_deleted == False
        ).count()
        results.append(AdminUserOut(
            id=u.id,
            username=u.username,
            email=u.email,
            role=u.role,
            is_active=u.is_active,
            failed_login_count=u.failed_login_count,
            lockout_until=u.lockout_until,
            created_at=u.created_at,
            has_encryption_key=bool(u.encryption_public_key),
            has_signing_key=bool(u.signing_public_key),
            files_owned=files_owned
        ))
    return results


@router.patch("/users/{user_id}", response_model=AdminUserOut)
def update_user(
    user_id: int,
    update: AdminUserUpdate,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Update user account — admin only.
    Supports: toggle is_active, change role, clear lockout.
    Cannot deactivate own account to prevent admin lockout.
    """
    _require_admin(current_user)

    if user_id == current_user.id and update.is_active is False:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Admins cannot deactivate their own account."
        )

    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    changes = []
    if update.is_active is not None:
        target.is_active = update.is_active
        changes.append(f"is_active={update.is_active}")

    if update.role is not None:
        valid_roles = {"USER", "ADMIN"}
        if update.role.upper() not in valid_roles:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid role. Valid options: {', '.join(valid_roles)}"
            )
        target.role = update.role.upper()
        changes.append(f"role={update.role.upper()}")

    if update.clear_lockout:
        target.failed_login_count = 0
        target.lockout_until = None
        changes.append("lockout_cleared")

    db.commit()
    db.refresh(target)

    log_audit_event(
        db=db,
        action="ADMIN_USER_UPDATED",
        status="SUCCESS",
        user_id=current_user.id,
        username=current_user.username,
        resource_id=str(target.id),
        resource_name=target.username,
        details=f"Admin updated user '{target.username}': {', '.join(changes) or 'no changes'}.",
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent")
    )

    files_owned = db.query(EncryptedFile).filter(
        EncryptedFile.owner_id == target.id,
        EncryptedFile.is_deleted == False
    ).count()

    return AdminUserOut(
        id=target.id,
        username=target.username,
        email=target.email,
        role=target.role,
        is_active=target.is_active,
        failed_login_count=target.failed_login_count,
        lockout_until=target.lockout_until,
        created_at=target.created_at,
        has_encryption_key=bool(target.encryption_public_key),
        has_signing_key=bool(target.signing_public_key),
        files_owned=files_owned
    )


@router.get("/files", response_model=List[AdminFileOut])
def list_all_files(
    request: Request,
    search: Optional[str] = Query(None, description="Filter by filename"),
    include_deleted: bool = Query(False),
    owner_id: Optional[int] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """System-wide file listing — admin only."""
    _require_admin(current_user)

    query = db.query(EncryptedFile)
    if not include_deleted:
        query = query.filter(EncryptedFile.is_deleted == False)
    if search:
        query = query.filter(EncryptedFile.original_filename.ilike(f"%{search}%"))
    if owner_id:
        query = query.filter(EncryptedFile.owner_id == owner_id)

    files_list = query.order_by(EncryptedFile.created_at.desc()).offset(offset).limit(limit).all()

    results = []
    for f in files_list:
        owner = db.query(User).filter(User.id == f.owner_id).first()
        active_perms = db.query(FilePermission).filter(
            FilePermission.file_id == f.id,
            FilePermission.is_revoked == False
        ).count()
        results.append(AdminFileOut(
            id=f.id,
            owner_username=owner.username if owner else "Unknown",
            original_filename=f.original_filename,
            file_size=f.file_size,
            mime_type=f.mime_type,
            created_at=f.created_at,
            expires_at=f.expires_at,
            is_deleted=f.is_deleted,
            active_permissions=active_perms
        ))
    return results


@router.get("/audit-logs")
def get_all_audit_logs(
    request: Request,
    action: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    username: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Full system-wide audit log access — admin only."""
    _require_admin(current_user)

    query = db.query(AuditLog)
    if action:
        query = query.filter(AuditLog.action == action)
    if status_filter:
        query = query.filter(AuditLog.status == status_filter)
    if username:
        query = query.filter(AuditLog.username.ilike(f"%{username}%"))

    logs = query.order_by(AuditLog.timestamp.desc()).offset(offset).limit(limit).all()

    log_audit_event(
        db=db,
        action="ADMIN_AUDIT_LOGS_ACCESSED",
        status="SUCCESS",
        user_id=current_user.id,
        username=current_user.username,
        details=f"Admin accessed system-wide audit logs (limit={limit}, offset={offset}).",
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent")
    )

    return logs
