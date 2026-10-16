import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Request, Header
from sqlalchemy.orm import Session

from backend.app.database import get_db
from backend.app.models.user import User
from backend.app.models.file import EncryptedFile
from backend.app.models.permission import FilePermission
from backend.app.models.organization import OrganizationFile, OrganizationMembership
from backend.app.schemas.permission import ShareFileRequest, UpdatePermissionRequest, PermissionOut, TemporalWindowRequest
from backend.app.security.auth import get_current_user
from backend.app.security.audit_logger import log_audit_event
from backend.app.crypto.rsa_key import wrap_aes_key_oaep, unwrap_aes_key_oaep
from backend.app.crypto.aes_gcm import bytes_to_b64, b64_to_bytes

router = APIRouter(prefix="/api/files", tags=["Permissions & Sharing"])


def check_temporal_access(perm: FilePermission) -> bool:
    """Returns True if access is allowed at the current UTC time."""
    if not hasattr(perm, 'access_start_hour') or perm.access_start_hour is None:
        return True  # no hour restriction

    now_utc = datetime.datetime.now(datetime.timezone.utc)
    current_hour = now_utc.hour
    current_day = now_utc.weekday()  # 0=Monday

    if perm.access_start_hour is not None and perm.access_end_hour is not None:
        if perm.access_start_hour <= perm.access_end_hour:
            if not (perm.access_start_hour <= current_hour < perm.access_end_hour):
                return False
        else:  # overnight window, e.g. 22 to 6
            if not (current_hour >= perm.access_start_hour or current_hour < perm.access_end_hour):
                return False

    if perm.access_days:
        try:
            allowed_days = [int(d.strip()) for d in str(perm.access_days).split(',') if d.strip()]
            if current_day not in allowed_days:
                return False
        except Exception:
            pass

    return True


@router.post("/{file_id}/share", response_model=PermissionOut, status_code=status.HTTP_201_CREATED)
def share_file(
    file_id: str,
    share_req: ShareFileRequest,
    request: Request,
    owner_private_key: Optional[str] = Header(None, alias="X-Owner-Private-Key"),
    recipient_wrapped_key_b64: Optional[str] = Header(None, alias="X-Recipient-Wrapped-Key"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Dynamic Recipient Key Distribution:
    1. Authenticate and verify owner / share rights.
    2. Dynamically lookup recipient identity and verify account status.
    3. Retrieve recipient's registered RSA encryption public key.
    4. Securely wrap the file's AES key for the recipient.
    5. Save recipient-specific permission and encrypted key record.
    6. Record event in immutable audit log.
    """
    ip_addr = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")

    file = db.query(EncryptedFile).filter(
        EncryptedFile.id == file_id,
        EncryptedFile.is_deleted == False
    ).first()

    if not file:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found.")

    organization_file = db.query(OrganizationFile).filter(OrganizationFile.file_id == file_id).first()
    if organization_file:
        caller_membership = db.query(OrganizationMembership).filter(
            OrganizationMembership.organization_id == organization_file.organization_id,
            OrganizationMembership.user_id == current_user.id
        ).first()
        if not caller_membership:
            log_audit_event(
                db=db,
                action="ORGANIZATION_FILE_SHARE_DENIED",
                status="DENIED",
                user_id=current_user.id,
                username=current_user.username,
                resource_id=file.id,
                resource_name=file.original_filename,
                details="Non-member attempted to share an organization file.",
                ip_address=ip_addr,
                user_agent=user_agent
            )
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only organization members may share this file.")

    # Check permission to share
    is_owner = (file.owner_id == current_user.id)
    if not is_owner:
        existing_perm = db.query(FilePermission).filter(
            FilePermission.file_id == file_id,
            FilePermission.recipient_id == current_user.id,
            FilePermission.is_revoked == False
        ).first()
        if not existing_perm or not existing_perm.can_share:
            log_audit_event(
                db=db,
                action="UNAUTHORIZED_SHARE_ATTEMPT",
                status="DENIED",
                user_id=current_user.id,
                username=current_user.username,
                resource_id=file.id,
                resource_name=file.original_filename,
                details="User attempted to share file without share permission.",
                ip_address=ip_addr,
                user_agent=user_agent
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to share this file."
            )

    # Locate recipient
    identifier = share_req.recipient_identifier.strip()
    recipient = db.query(User).filter(
        (User.username == identifier) | (User.email == identifier)
    ).first()

    if not recipient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Recipient '{identifier}' not found.")

    if recipient.id == file.owner_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot share file with the file owner.")

    if not recipient.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Recipient account is deactivated.")

    if not recipient.encryption_public_key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Recipient '{recipient.username}' has not registered an encryption public key."
        )

    if organization_file:
        recipient_membership = db.query(OrganizationMembership).filter(
            OrganizationMembership.organization_id == organization_file.organization_id,
            OrganizationMembership.user_id == recipient.id
        ).first()
        if not recipient_membership:
            log_audit_event(
                db=db,
                action="ORGANIZATION_FILE_SHARE_DENIED",
                status="DENIED",
                user_id=current_user.id,
                username=current_user.username,
                resource_id=file.id,
                resource_name=file.original_filename,
                details="Attempted to share an organization file with a non-member.",
                ip_address=ip_addr,
                user_agent=user_agent
            )
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Organization files may only be shared with organization members.")

    # Establish wrapped key for recipient
    if recipient_wrapped_key_b64:
        encrypted_aes_key = recipient_wrapped_key_b64
    elif owner_private_key:
        try:
            # Re-wrappers must use the caller's own encrypted key, not the file owner's key.
            caller_permission = None if is_owner else existing_perm
            caller_wrapped_key = (
                file.owner_encrypted_aes_key if is_owner else caller_permission.encrypted_aes_key
            )
            raw_aes_key = unwrap_aes_key_oaep(b64_to_bytes(caller_wrapped_key), owner_private_key)
            # Re-wrap for recipient
            recipient_wrapped_bytes = wrap_aes_key_oaep(raw_aes_key, recipient.encryption_public_key)
            encrypted_aes_key = bytes_to_b64(recipient_wrapped_bytes)
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Could not unwrap this file's AES key. Use the unencrypted PEM encryption private key that matches the key used to encrypt this file."
            )
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Header 'X-Owner-Private-Key' or 'X-Recipient-Wrapped-Key' is required to provision recipient key."
        )

    # Create or update permission
    perm = db.query(FilePermission).filter(
        FilePermission.file_id == file_id,
        FilePermission.recipient_id == recipient.id
    ).first()

    now_utc = datetime.datetime.now(datetime.timezone.utc)

    if perm:
        perm.granted_by_id = current_user.id
        perm.can_read = share_req.can_read
        perm.can_download = share_req.can_download
        perm.can_share = share_req.can_share
        perm.is_one_time = share_req.is_one_time
        perm.access_count = 0
        perm.encrypted_aes_key = encrypted_aes_key
        perm.is_revoked = False
        perm.revoked_at = None
        perm.revoked_by_id = None
        perm.granted_at = now_utc
    else:
        perm = FilePermission(
            file_id=file_id,
            recipient_id=recipient.id,
            granted_by_id=current_user.id,
            can_read=share_req.can_read,
            can_download=share_req.can_download,
            can_share=share_req.can_share,
            is_one_time=share_req.is_one_time,
            access_count=0,
            encrypted_aes_key=encrypted_aes_key,
            is_revoked=False,
            granted_at=now_utc
        )
        db.add(perm)

    db.commit()
    db.refresh(perm)

    one_time_str = ", Burn-on-Read: Enabled" if perm.is_one_time else ""
    log_audit_event(
        db=db,
        action="PERMISSION_GRANTED",
        status="SUCCESS",
        user_id=current_user.id,
        username=current_user.username,
        resource_id=file.id,
        resource_name=file.original_filename,
        details=f"File shared with user '{recipient.username}' (Read: {perm.can_read}, Download: {perm.can_download}, Share: {perm.can_share}{one_time_str}).",
        ip_address=ip_addr,
        user_agent=user_agent
    )

    return PermissionOut(
        id=perm.id,
        file_id=perm.file_id,
        recipient_id=recipient.id,
        recipient_username=recipient.username,
        recipient_email=recipient.email,
        can_read=perm.can_read,
        can_download=perm.can_download,
        can_share=perm.can_share,
        is_one_time=perm.is_one_time,
        access_count=perm.access_count,
        is_revoked=perm.is_revoked,
        revoked_at=perm.revoked_at,
        granted_at=perm.granted_at,
        access_start_hour=perm.access_start_hour,
        access_end_hour=perm.access_end_hour,
        access_days=perm.access_days
    )


@router.get("/{file_id}/permissions", response_model=List[PermissionOut])
def get_file_permissions(
    file_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    file = db.query(EncryptedFile).filter(
        EncryptedFile.id == file_id,
        EncryptedFile.is_deleted == False
    ).first()

    if not file:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found.")

    if file.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the file owner can view all permissions.")

    perms = db.query(FilePermission).filter(FilePermission.file_id == file_id).all()
    results = []
    for p in perms:
        rec = db.query(User).filter(User.id == p.recipient_id).first()
        revoked_by_user = db.query(User).filter(User.id == p.revoked_by_id).first() if p.revoked_by_id else None
        results.append(
            PermissionOut(
                id=p.id,
                file_id=p.file_id,
                recipient_id=p.recipient_id,
                recipient_username=rec.username if rec else "Unknown",
                recipient_email=rec.email if rec else "Unknown",
                can_read=p.can_read,
                can_download=p.can_download,
                can_share=p.can_share,
                is_one_time=p.is_one_time,
                access_count=p.access_count,
                is_revoked=p.is_revoked,
                revoked_at=p.revoked_at,
                revoked_by_username=revoked_by_user.username if revoked_by_user else None,
                granted_at=p.granted_at,
                access_start_hour=p.access_start_hour,
                access_end_hour=p.access_end_hour,
                access_days=p.access_days
            )
        )
    return results


@router.post("/{file_id}/permissions/{recipient_id}/revoke")
def revoke_permission(
    file_id: str,
    recipient_id: int,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Immediate Application-Level Revocation:
    - Sets is_revoked = True
    - Sets revoked_at = UTC timestamp
    - Clears/zeroes encrypted_aes_key to ensure cryptographic inaccessible state
    - Subsequent access requests immediately denied by ZeroTrustVerifier
    - Logs immutable revocation audit record
    """
    ip_addr = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")

    file = db.query(EncryptedFile).filter(
        EncryptedFile.id == file_id,
        EncryptedFile.is_deleted == False
    ).first()

    if not file:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found.")

    if file.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the file owner can revoke permissions.")

    perm = db.query(FilePermission).filter(
        FilePermission.file_id == file_id,
        FilePermission.recipient_id == recipient_id
    ).first()

    if not perm:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Permission grant not found.")

    now_utc = datetime.datetime.now(datetime.timezone.utc)
    perm.is_revoked = True
    perm.revoked_at = now_utc
    perm.revoked_by_id = current_user.id
    # Overwrite the wrapped key to guarantee immediate key access denial
    perm.encrypted_aes_key = ""

    db.commit()

    recipient = db.query(User).filter(User.id == recipient_id).first()
    recipient_name = recipient.username if recipient else f"ID {recipient_id}"

    log_audit_event(
        db=db,
        action="ACCESS_REVOKED",
        status="SUCCESS",
        user_id=current_user.id,
        username=current_user.username,
        resource_id=file.id,
        resource_name=file.original_filename,
        details=f"Access revoked for recipient '{recipient_name}'. Recipient key destroyed and permissions invalidated.",
        ip_address=ip_addr,
        user_agent=user_agent
    )

    return {"message": f"Access successfully revoked for user '{recipient_name}'."}


@router.patch("/{file_id}/permissions/{recipient_id}", response_model=PermissionOut)
def update_permission(
    file_id: str,
    recipient_id: int,
    perm_update: UpdatePermissionRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    file = db.query(EncryptedFile).filter(
        EncryptedFile.id == file_id,
        EncryptedFile.is_deleted == False
    ).first()

    if not file:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found.")

    if file.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the file owner can update permissions.")

    perm = db.query(FilePermission).filter(
        FilePermission.file_id == file_id,
        FilePermission.recipient_id == recipient_id
    ).first()

    if not perm:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Permission record not found.")

    perm.can_read = perm_update.can_read
    perm.can_download = perm_update.can_download
    perm.can_share = perm_update.can_share
    if perm_update.is_one_time is not None:
        perm.is_one_time = perm_update.is_one_time
    db.commit()
    db.refresh(perm)

    recipient = db.query(User).filter(User.id == recipient_id).first()

    log_audit_event(
        db=db,
        action="PERMISSION_MODIFIED",
        status="SUCCESS",
        user_id=current_user.id,
        username=current_user.username,
        resource_id=file.id,
        resource_name=file.original_filename,
        details=f"Permissions updated for '{recipient.username if recipient else recipient_id}' (Read: {perm.can_read}, Download: {perm.can_download}, Share: {perm.can_share}, One-Time: {perm.is_one_time}).",
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent")
    )

    return PermissionOut(
        id=perm.id,
        file_id=perm.file_id,
        recipient_id=perm.recipient_id,
        recipient_username=recipient.username if recipient else "Unknown",
        recipient_email=recipient.email if recipient else "Unknown",
        can_read=perm.can_read,
        can_download=perm.can_download,
        can_share=perm.can_share,
        is_one_time=perm.is_one_time,
        access_count=perm.access_count,
        is_revoked=perm.is_revoked,
        revoked_at=perm.revoked_at,
        granted_at=perm.granted_at,
        access_start_hour=perm.access_start_hour,
        access_end_hour=perm.access_end_hour,
        access_days=perm.access_days
    )


@router.patch("/{file_id}/permissions/{recipient_id}/window", response_model=PermissionOut)
def set_temporal_window(
    file_id: str,
    recipient_id: int,
    window: TemporalWindowRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Set or clear the temporal access window for a permission grant."""
    file = db.query(EncryptedFile).filter(
        EncryptedFile.id == file_id,
        EncryptedFile.is_deleted == False
    ).first()

    if not file:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found.")

    if file.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the file owner can set temporal windows.")

    perm = db.query(FilePermission).filter(
        FilePermission.file_id == file_id,
        FilePermission.recipient_id == recipient_id
    ).first()

    if not perm:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Permission record not found.")

    perm.access_start_hour = window.access_start_hour
    perm.access_end_hour = window.access_end_hour
    perm.access_days = window.access_days

    db.commit()
    db.refresh(perm)

    recipient = db.query(User).filter(User.id == recipient_id).first()

    log_audit_event(
        db=db,
        action="TEMPORAL_WINDOW_SET",
        status="SUCCESS",
        user_id=current_user.id,
        username=current_user.username,
        resource_id=file.id,
        resource_name=file.original_filename,
        details=f"Temporal window set for '{recipient.username if recipient else recipient_id}': hours {window.access_start_hour}-{window.access_end_hour}, days {window.access_days}",
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent")
    )

    return PermissionOut(
        id=perm.id,
        file_id=perm.file_id,
        recipient_id=perm.recipient_id,
        recipient_username=recipient.username if recipient else "Unknown",
        recipient_email=recipient.email if recipient else "Unknown",
        can_read=perm.can_read,
        can_download=perm.can_download,
        can_share=perm.can_share,
        is_one_time=perm.is_one_time,
        access_count=perm.access_count,
        is_revoked=perm.is_revoked,
        revoked_at=perm.revoked_at,
        granted_at=perm.granted_at,
        access_start_hour=perm.access_start_hour,
        access_end_hour=perm.access_end_hour,
        access_days=perm.access_days
    )
