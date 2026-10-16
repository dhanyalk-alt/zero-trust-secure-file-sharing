import uuid
import datetime
from typing import Tuple, Optional, Dict, Any
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from backend.app.models.user import User
from backend.app.models.file import EncryptedFile
from backend.app.models.permission import FilePermission
from backend.app.security.audit_logger import log_audit_event
from backend.app.security.rate_limiter import risk_limiter


class ZeroTrustVerifier:
    """
    Enforces the Zero Trust security model on every sensitive access request:
    'Never Trust, Always Verify'
    """

    @staticmethod
    def verify_file_access(
        db: Session,
        user: User,
        file_id: str,
        action: str,  # "read", "download", "share", "delete", "manage_permissions"
        request_context: Optional[Dict[str, Any]] = None
    ) -> Tuple[EncryptedFile, Optional[FilePermission], str]:
        """
        Validates:
        1. Authenticated user active status
        2. File existence and non-deletion
        3. Ownership or active explicit permission
        4. Real-time revocation state (instant denial if revoked)
        5. Specific permission flags (can_read, can_download, can_share)
        6. Risk evaluation & download rate limit
        7. Audit logging of access decisions

        Returns: (file, permission_record, encrypted_aes_key)
        """
        correlation_id = str(uuid.uuid4())
        ip_addr = request_context.get("ip_address") if request_context else None
        user_agent = request_context.get("user_agent") if request_context else None

        # 1. Verify user active status
        if not user.is_active:
            log_audit_event(
                db=db,
                action="ZERO_TRUST_DENIAL",
                status="DENIED",
                user_id=user.id,
                username=user.username,
                resource_id=file_id,
                details="Deactivated user attempted file access.",
                ip_address=ip_addr,
                user_agent=user_agent,
                correlation_id=correlation_id
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User account is deactivated."
            )

        # 2. File existence check
        file = db.query(EncryptedFile).filter(
            EncryptedFile.id == file_id,
            EncryptedFile.is_deleted == False
        ).first()

        if not file:
            log_audit_event(
                db=db,
                action="ZERO_TRUST_DENIAL",
                status="DENIED",
                user_id=user.id,
                username=user.username,
                resource_id=file_id,
                details="Attempted access to non-existent or deleted file.",
                ip_address=ip_addr,
                user_agent=user_agent,
                correlation_id=correlation_id
            )
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="File not found or has been removed."
            )

        # 3. File expiry check (configurable TTL per file)
        if file.expires_at is not None:
            expires_at = file.expires_at
            if expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=datetime.timezone.utc)
            if expires_at < datetime.datetime.now(datetime.timezone.utc):
                log_audit_event(
                    db=db,
                    action="EXPIRED_FILE_ACCESS_ATTEMPT",
                    status="DENIED",
                    user_id=user.id,
                    username=user.username,
                    resource_id=file_id,
                    resource_name=file.original_filename,
                    details=f"Access denied: file expired at {expires_at.isoformat()}.",
                    ip_address=ip_addr,
                    user_agent=user_agent,
                    correlation_id=correlation_id
                )
                raise HTTPException(
                    status_code=status.HTTP_410_GONE,
                    detail="Access denied: This file has expired and is no longer accessible."
                )

        # 4. Ownership evaluation
        is_owner = (file.owner_id == user.id)

        if is_owner:
            # Owner has full rights
            encrypted_key = file.owner_encrypted_aes_key
            permission = None
        else:
            # Must have explicit non-revoked permission
            if action in ["delete", "manage_permissions"]:
                log_audit_event(
                    db=db,
                    action="UNAUTHORIZED_MANAGEMENT_ATTEMPT",
                    status="DENIED",
                    user_id=user.id,
                    username=user.username,
                    resource_id=file_id,
                    resource_name=file.original_filename,
                    details=f"Non-owner attempted '{action}' on file.",
                    ip_address=ip_addr,
                    user_agent=user_agent,
                    correlation_id=correlation_id
                )
                risk_limiter.record_failed_request(f"{user.id}:{ip_addr}")
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Only the file owner can perform this operation."
                )

            # Query recipient permission record
            permission = db.query(FilePermission).filter(
                FilePermission.file_id == file_id,
                FilePermission.recipient_id == user.id
            ).first()

            if not permission:
                log_audit_event(
                    db=db,
                    action="ZERO_TRUST_DENIAL",
                    status="DENIED",
                    user_id=user.id,
                    username=user.username,
                    resource_id=file_id,
                    resource_name=file.original_filename,
                    details=f"Unauthorized access attempt for action '{action}'. No permission grant exists.",
                    ip_address=ip_addr,
                    user_agent=user_agent,
                    correlation_id=correlation_id
                )
                risk_limiter.record_failed_request(f"{user.id}:{ip_addr}")
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Access denied: You do not have permissions for this file."
                )

            # 4. Immediate revocation verification
            if permission.is_revoked:
                log_audit_event(
                    db=db,
                    action="REVOKED_ACCESS_ATTEMPT",
                    status="DENIED",
                    user_id=user.id,
                    username=user.username,
                    resource_id=file_id,
                    resource_name=file.original_filename,
                    details=f"Attempted access on revoked permission (revoked at: {permission.revoked_at}).",
                    ip_address=ip_addr,
                    user_agent=user_agent,
                    correlation_id=correlation_id
                )
                risk_limiter.record_failed_request(f"{user.id}:{ip_addr}")
                revocation_msg = (
                    "Access denied: One-time access (Burn-on-Read) has already been consumed and revoked."
                    if permission.is_one_time
                    else "Access denied: Your authorization for this file was revoked."
                )
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=revocation_msg
                )

            # 5. Granular action flags check
            if action == "download" and not permission.can_download:
                log_audit_event(
                    db=db,
                    action="PERMISSION_DENIAL",
                    status="DENIED",
                    user_id=user.id,
                    username=user.username,
                    resource_id=file_id,
                    resource_name=file.original_filename,
                    details="User lacks download permission.",
                    ip_address=ip_addr,
                    user_agent=user_agent,
                    correlation_id=correlation_id
                )
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Access denied: You do not have permission to download this file."
                )

            if action == "read" and not permission.can_read:
                log_audit_event(
                    db=db,
                    action="PERMISSION_DENIAL",
                    status="DENIED",
                    user_id=user.id,
                    username=user.username,
                    resource_id=file_id,
                    resource_name=file.original_filename,
                    details="User lacks read permission.",
                    ip_address=ip_addr,
                    user_agent=user_agent,
                    correlation_id=correlation_id
                )
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Access denied: You do not have permission to view this file."
                )

            if action == "share" and not permission.can_share:
                log_audit_event(
                    db=db,
                    action="PERMISSION_DENIAL",
                    status="DENIED",
                    user_id=user.id,
                    username=user.username,
                    resource_id=file_id,
                    resource_name=file.original_filename,
                    details="User lacks sharing permission.",
                    ip_address=ip_addr,
                    user_agent=user_agent,
                    correlation_id=correlation_id
                )
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Access denied: You do not have permission to share this file."
                )

            encrypted_key = permission.encrypted_aes_key

        # 6. Risk Evaluation & Rate Limiting (e.g. for downloads)
        if action == "download":
            user_key = f"user_{user.id}"
            if not risk_limiter.record_download(user_key):
                log_audit_event(
                    db=db,
                    action="RATE_LIMIT_EXCEEDED",
                    status="SUSPICIOUS",
                    user_id=user.id,
                    username=user.username,
                    resource_id=file_id,
                    resource_name=file.original_filename,
                    details="Rapid download spike detected. Blocked by Zero Trust rate limiting.",
                    ip_address=ip_addr,
                    user_agent=user_agent,
                    correlation_id=correlation_id
                )
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="Rate limit exceeded. Too many download requests in a short period."
                )

        return file, permission, encrypted_key
