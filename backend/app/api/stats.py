from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func

from backend.app.database import get_db
from backend.app.models.user import User
from backend.app.models.file import EncryptedFile
from backend.app.models.permission import FilePermission
from backend.app.models.audit import AuditLog
from backend.app.models.organization import OrganizationMembership
from backend.app.schemas.stats import DashboardStats
from backend.app.security.auth import get_current_user

router = APIRouter(prefix="/api/stats", tags=["Dashboard Statistics"])


@router.get("/dashboard", response_model=DashboardStats)
def get_dashboard_stats(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Computes dashboard metrics dynamically from live database queries.
    Strictly zero hardcoding.
    """
    # 1. Total files owned by current user
    user_files_query = db.query(EncryptedFile).filter(
        EncryptedFile.owner_id == current_user.id,
        EncryptedFile.is_deleted == False
    )
    total_files_count = user_files_query.count()

    # 2. Total bytes stored by current user
    bytes_sum = db.query(func.coalesce(func.sum(EncryptedFile.file_size), 0)).filter(
        EncryptedFile.owner_id == current_user.id,
        EncryptedFile.is_deleted == False
    ).scalar() or 0

    # 3. Active file shares granted by current user
    total_shared_by_user = db.query(FilePermission).join(EncryptedFile).filter(
        EncryptedFile.owner_id == current_user.id,
        FilePermission.is_revoked == False,
        EncryptedFile.is_deleted == False
    ).count()

    # 4. Active files shared with current user
    total_shared_with_user = db.query(FilePermission).join(EncryptedFile).filter(
        FilePermission.recipient_id == current_user.id,
        FilePermission.is_revoked == False,
        EncryptedFile.is_deleted == False
    ).count()

    # 5. Security events / alerts associated with current user
    security_events_count = db.query(AuditLog).filter(
        (AuditLog.user_id == current_user.id) | (AuditLog.username == current_user.username),
        AuditLog.status != "SUCCESS"
    ).count()

    # 6. Total active users in the system
    active_users_count = db.query(User).filter(User.is_active == True).count()

    # 7. Total organizations current user is a member of
    organizations_count = db.query(OrganizationMembership).filter(
        OrganizationMembership.user_id == current_user.id
    ).count()

    return DashboardStats(
        total_files_count=total_files_count,
        total_bytes_stored=bytes_sum,
        total_shared_by_user=total_shared_by_user,
        total_shared_with_user=total_shared_with_user,
        security_events_count=security_events_count,
        active_users_count=active_users_count,
        organizations_count=organizations_count
    )
