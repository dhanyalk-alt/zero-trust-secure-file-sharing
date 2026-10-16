import datetime
from typing import List
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.app.database import get_db
from backend.app.models.file import EncryptedFile
from backend.app.models.organization import Organization, OrganizationFile, OrganizationMembership
from backend.app.models.permission import FilePermission
from backend.app.models.user import User
from backend.app.schemas.organization import (
    OrganizationCreate,
    OrganizationFileOut,
    OrganizationMemberCreate,
    OrganizationMemberOut,
    OrganizationOut,
)
from backend.app.security.audit_logger import log_audit_event
from backend.app.security.auth import get_current_user
from backend.app.storage import get_storage_provider

router = APIRouter(prefix="/api/organizations", tags=["Organizations"])


def _membership(db: Session, organization_id: int, user: User) -> OrganizationMembership:
    membership = db.query(OrganizationMembership).filter(
        OrganizationMembership.organization_id == organization_id,
        OrganizationMembership.user_id == user.id
    ).first()
    if not membership:
        log_audit_event(
            db=db,
            action="ORGANIZATION_ACCESS_DENIED",
            status="DENIED",
            user_id=user.id,
            username=user.username,
            resource_id=str(organization_id),
            details="Non-member attempted to access organization resources."
        )
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found.")
    return membership


def _organization(db: Session, organization_id: int) -> Organization:
    organization = db.query(Organization).filter(Organization.id == organization_id).first()
    if not organization:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found.")
    return organization


def _require_manager(
    db: Session,
    membership: OrganizationMembership,
    organization_id: int,
    user: User,
    request: Request
) -> None:
    if membership.role not in ("owner", "admin"):
        log_audit_event(
            db=db,
            action="ORGANIZATION_MANAGEMENT_DENIED",
            status="DENIED",
            user_id=user.id,
            username=user.username,
            resource_id=str(organization_id),
            details="Organization member attempted a management operation without admin privileges.",
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent")
        )
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Organization owner or admin access is required.")


def _get_org_counts(db: Session, organization_id: int):
    member_count = db.query(OrganizationMembership).filter(
        OrganizationMembership.organization_id == organization_id
    ).count()
    file_count = db.query(OrganizationFile).join(
        EncryptedFile, OrganizationFile.file_id == EncryptedFile.id
    ).filter(
        OrganizationFile.organization_id == organization_id,
        EncryptedFile.is_deleted == False
    ).count()
    return member_count, file_count


def _member_out(db: Session, membership: OrganizationMembership) -> OrganizationMemberOut:
    user = db.query(User).filter(User.id == membership.user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization member no longer exists.")
    return OrganizationMemberOut(
        user_id=user.id,
        username=user.username,
        email=user.email,
        role=membership.role,
        can_upload=membership.can_upload,
        joined_at=membership.joined_at
    )


@router.post("", response_model=OrganizationOut, status_code=status.HTTP_201_CREATED)
def create_organization(
    organization_data: OrganizationCreate,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    organization = Organization(
        name=organization_data.name,
        description=organization_data.description,
        owner_id=current_user.id
    )
    db.add(organization)
    db.flush()
    membership = OrganizationMembership(
        organization_id=organization.id,
        user_id=current_user.id,
        role="owner",
        can_upload=True
    )
    db.add(membership)
    db.commit()
    db.refresh(organization)
    log_audit_event(
        db=db,
        action="ORGANIZATION_CREATED",
        status="SUCCESS",
        user_id=current_user.id,
        username=current_user.username,
        resource_id=str(organization.id),
        resource_name=organization.name,
        details="Organization created and creator assigned as owner.",
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent")
    )
    return OrganizationOut(
        id=organization.id,
        name=organization.name,
        description=organization.description,
        owner_id=organization.owner_id,
        role=membership.role,
        can_upload=membership.can_upload,
        created_at=organization.created_at,
        member_count=1,
        file_count=0
    )


@router.get("", response_model=List[OrganizationOut])
def list_organizations(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    memberships = db.query(OrganizationMembership).filter(
        OrganizationMembership.user_id == current_user.id
    ).all()
    organizations = []
    for membership in memberships:
        organization = db.query(Organization).filter(Organization.id == membership.organization_id).first()
        if organization:
            m_count, f_count = _get_org_counts(db, organization.id)
            organizations.append(OrganizationOut(
                id=organization.id,
                name=organization.name,
                description=organization.description,
                owner_id=organization.owner_id,
                role=membership.role,
                can_upload=membership.can_upload,
                created_at=organization.created_at,
                member_count=m_count,
                file_count=f_count
            ))
    return organizations


@router.get("/{organization_id}", response_model=OrganizationOut)
def get_organization(
    organization_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    membership = _membership(db, organization_id, current_user)
    organization = _organization(db, organization_id)
    m_count, f_count = _get_org_counts(db, organization_id)
    return OrganizationOut(
        id=organization.id,
        name=organization.name,
        description=organization.description,
        owner_id=organization.owner_id,
        role=membership.role,
        can_upload=membership.can_upload,
        created_at=organization.created_at,
        member_count=m_count,
        file_count=f_count
    )


@router.get("/{organization_id}/members", response_model=List[OrganizationMemberOut])
def list_members(
    organization_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    _membership(db, organization_id, current_user)
    memberships = db.query(OrganizationMembership).filter(
        OrganizationMembership.organization_id == organization_id
    ).order_by(OrganizationMembership.joined_at.asc()).all()
    return [_member_out(db, membership) for membership in memberships]


@router.post("/{organization_id}/members", response_model=OrganizationMemberOut, status_code=status.HTTP_201_CREATED)
def add_member(
    organization_id: int,
    member_data: OrganizationMemberCreate,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    manager_membership = _membership(db, organization_id, current_user)
    _require_manager(db, manager_membership, organization_id, current_user, request)
    if member_data.role == "admin" and manager_membership.role != "owner":
        log_audit_event(
            db=db,
            action="ORGANIZATION_MANAGEMENT_DENIED",
            status="DENIED",
            user_id=current_user.id,
            username=current_user.username,
            resource_id=str(organization_id),
            details="Organization admin attempted to appoint another administrator.",
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent")
        )
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the organization owner can appoint admins.")

    user = db.query(User).filter(
        (User.username == member_data.user_identifier) | (User.email == member_data.user_identifier)
    ).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Active registered user not found.")
    if user.id == current_user.id and manager_membership.role == "owner":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="You are already an organization member.")
    existing = db.query(OrganizationMembership).filter(
        OrganizationMembership.organization_id == organization_id,
        OrganizationMembership.user_id == user.id
    ).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="User is already an organization member.")

    membership = OrganizationMembership(
        organization_id=organization_id,
        user_id=user.id,
        role=member_data.role,
        can_upload=member_data.can_upload
    )
    db.add(membership)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="User is already an organization member.")
    db.refresh(membership)
    organization = _organization(db, organization_id)
    log_audit_event(
        db=db,
        action="ORGANIZATION_MEMBER_ADDED",
        status="SUCCESS",
        user_id=current_user.id,
        username=current_user.username,
        resource_id=str(organization_id),
        resource_name=organization.name,
        details=f"User '{user.username}' added with role '{membership.role}' and upload permission {membership.can_upload}. Note: existing files will be visible but require admin to re-share AES keys for download.",
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent")
    )
    return _member_out(db, membership)


@router.delete("/{organization_id}/members/{user_id}")
def remove_member(
    organization_id: int,
    user_id: int,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    manager_membership = _membership(db, organization_id, current_user)
    _require_manager(db, manager_membership, organization_id, current_user, request)
    target = db.query(OrganizationMembership).filter(
        OrganizationMembership.organization_id == organization_id,
        OrganizationMembership.user_id == user_id
    ).first()
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization member not found.")
    if target.role == "owner":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="The organization owner cannot be removed.")
    if manager_membership.role == "admin" and target.role == "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Organization admins cannot remove other admins.")

    organization = _organization(db, organization_id)
    file_ids = [
        row.file_id for row in db.query(OrganizationFile.file_id).filter(
            OrganizationFile.organization_id == organization_id
        ).all()
    ]
    permissions = db.query(FilePermission).filter(
        FilePermission.file_id.in_(file_ids) if file_ids else False,
        FilePermission.recipient_id == user_id,
        FilePermission.is_revoked == False
    ).all()
    revoked_at = datetime.datetime.now(datetime.timezone.utc)
    for permission in permissions:
        permission.is_revoked = True
        permission.revoked_at = revoked_at
        permission.revoked_by_id = current_user.id
        permission.encrypted_aes_key = ""

    removed_user = db.query(User).filter(User.id == user_id).first()
    db.delete(target)
    db.commit()

    for permission in permissions:
        log_audit_event(
            db=db,
            action="ORGANIZATION_FILE_ACCESS_REVOKED",
            status="SUCCESS",
            user_id=current_user.id,
            username=current_user.username,
            resource_id=permission.file_id,
            resource_name=organization.name,
            details=f"Organization member '{removed_user.username if removed_user else user_id}' removed; wrapped key cleared.",
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent")
        )
    log_audit_event(
        db=db,
        action="ORGANIZATION_MEMBER_REMOVED",
        status="SUCCESS",
        user_id=current_user.id,
        username=current_user.username,
        resource_id=str(organization_id),
        resource_name=organization.name,
        details=f"User '{removed_user.username if removed_user else user_id}' removed and organization file grants revoked.",
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent")
    )
    return {"message": "Organization member removed and associated file grants revoked."}


@router.get("/{organization_id}/files", response_model=List[OrganizationFileOut])
def list_organization_files(
    organization_id: int,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    _membership(db, organization_id, current_user)
    organization = _organization(db, organization_id)
    rows = db.query(OrganizationFile, EncryptedFile).join(
        EncryptedFile, OrganizationFile.file_id == EncryptedFile.id
    ).filter(
        OrganizationFile.organization_id == organization_id,
        EncryptedFile.is_deleted == False
    ).order_by(OrganizationFile.added_at.desc()).all()

    results = []
    for organization_file, file in rows:
        is_owner = file.owner_id == current_user.id
        # Check for explicit FilePermission (granted via Share)
        permission = db.query(FilePermission).filter(
            FilePermission.file_id == file.id,
            FilePermission.recipient_id == current_user.id,
            FilePermission.is_revoked == False
        ).first()
        # Membership grants visibility, but decryption requires a recipient-specific
        # wrapped AES key. Existing files must be explicitly re-shared after a new
        # member joins because the server cannot derive that key without the owner's key.
        uploader = db.query(User).filter(User.id == organization_file.uploaded_by_id).first()
        owner = db.query(User).filter(User.id == file.owner_id).first()
        expires_at = file.expires_at
        if expires_at and expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=datetime.timezone.utc)
        # Report only permissions backed by an available wrapped key.
        if is_owner:
            can_read, can_download, can_share, is_one_time = True, True, True, False
        elif permission:
            can_read, can_download, can_share, is_one_time = (
                permission.can_read, permission.can_download,
                permission.can_share, permission.is_one_time
            )
        else:
            can_read, can_download, can_share, is_one_time = False, False, False, False
        results.append(OrganizationFileOut(
            id=file.id,
            owner_id=file.owner_id,
            owner_username=owner.username if owner else "Unknown",
            original_filename=file.original_filename,
            file_size=file.file_size,
            mime_type=file.mime_type,
            file_sha256_hash=file.file_sha256_hash,
            aes_gcm_nonce=file.aes_gcm_nonce,
            aes_gcm_tag=file.aes_gcm_tag,
            canonical_manifest_json=file.canonical_manifest_json,
            manifest_signature=file.manifest_signature,
            created_at=file.created_at,
            expires_at=file.expires_at,
            is_expired=bool(expires_at and expires_at < datetime.datetime.now(datetime.timezone.utc)),
            can_download=can_download,
            can_share=can_share,
            is_one_time=is_one_time,
            is_owner=is_owner,
            organization_id=organization_id,
            uploader_username=uploader.username if uploader else (owner.username if owner else "Unknown"),
            can_read=can_read
        ))
    log_audit_event(
        db=db,
        action="ORGANIZATION_FILES_VIEWED",
        status="SUCCESS",
        user_id=current_user.id,
        username=current_user.username,
        resource_id=str(organization_id),
        resource_name=organization.name,
        details=f"Listed {len(results)} organization files authorized for the current user.",
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent")
    )
    return results


@router.delete("/{organization_id}")
def delete_organization(
    organization_id: int,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    membership = _membership(db, organization_id, current_user)
    _require_manager(db, membership, organization_id, current_user, request)
    organization = _organization(db, organization_id)

    if membership.role != "owner":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the organization owner can delete this organization."
        )

    db.query(OrganizationFile).filter(OrganizationFile.organization_id == organization_id).delete(synchronize_session=False)
    db.query(OrganizationMembership).filter(OrganizationMembership.organization_id == organization_id).delete(synchronize_session=False)
    db.delete(organization)
    db.commit()

    log_audit_event(
        db=db,
        action="ORGANIZATION_DELETED",
        status="SUCCESS",
        user_id=current_user.id,
        username=current_user.username,
        resource_id=str(organization_id),
        resource_name=organization.name,
        details="Organization deleted by owner and workspace associations cleared safely.",
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent")
    )
    return {"message": "Organization deleted successfully."}


@router.delete("/{organization_id}/files/{file_id}")
def delete_organization_file(
    organization_id: int,
    file_id: str,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    membership = _membership(db, organization_id, current_user)
    organization = _organization(db, organization_id)

    org_file = db.query(OrganizationFile).filter(
        OrganizationFile.organization_id == organization_id,
        OrganizationFile.file_id == file_id
    ).first()
    if not org_file:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found in this organization.")

    file = db.query(EncryptedFile).filter(EncryptedFile.id == file_id).first()
    if not file or file.is_deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found.")

    is_file_owner = file.owner_id == current_user.id
    is_org_manager = membership.role in ("owner", "admin")
    if not (is_file_owner or is_org_manager):
        log_audit_event(
            db=db,
            action="ORGANIZATION_FILE_DELETE_DENIED",
            status="DENIED",
            user_id=current_user.id,
            username=current_user.username,
            resource_id=file.id,
            resource_name=file.original_filename,
            details="Unauthorized attempt to delete organization file.",
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent")
        )
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have permission to delete this file.")

    db.delete(org_file)
    file.is_deleted = True

    db.query(FilePermission).filter(FilePermission.file_id == file.id).update({
        FilePermission.is_revoked: True,
        FilePermission.encrypted_aes_key: ""
    })
    db.commit()

    storage_provider = get_storage_provider()
    storage_key = f"{file.id}.enc"
    try:
        storage_provider.delete(storage_key)
    except Exception:
        pass

    log_audit_event(
        db=db,
        action="ORGANIZATION_FILE_DELETED",
        status="SUCCESS",
        user_id=current_user.id,
        username=current_user.username,
        resource_id=file.id,
        resource_name=file.original_filename,
        details=f"Organization file deleted by {'owner' if is_file_owner else 'organization manager'} and removed from storage.",
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent")
    )

    return {"message": "Organization file deleted successfully."}


@router.get("/{organization_id}/activity")
def get_organization_activity(
    organization_id: int,
    limit: int = 100,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Return recent audit log activity for all files belonging to this organization.
    Shows who did what (download, share, view, etc.) on each org file.
    Only org members can view this.
    """
    from backend.app.models.audit import AuditLog
    from sqlalchemy import func

    _membership(db, organization_id, current_user)
    organization = _organization(db, organization_id)

    # Get all file IDs in this org
    org_file_rows = db.query(OrganizationFile).filter(
        OrganizationFile.organization_id == organization_id
    ).all()
    file_ids = [row.file_id for row in org_file_rows]

    if not file_ids:
        return {"organization_id": organization_id, "activity": [], "summary": []}

    # Fetch recent audit log events for these files
    logs = db.query(AuditLog).filter(
        AuditLog.resource_id.in_(file_ids)
    ).order_by(AuditLog.timestamp.desc()).limit(limit).all()

    # Build file name lookup
    files_map = {}
    for fid in file_ids:
        f = db.query(EncryptedFile).filter(EncryptedFile.id == fid).first()
        if f:
            files_map[fid] = f.original_filename

    activity = []
    for log in logs:
        activity.append({
            "id": log.id,
            "username": log.username or "Unknown",
            "action": log.action,
            "status": log.status,
            "file_id": log.resource_id,
            "filename": files_map.get(log.resource_id, log.resource_name or "Unknown"),
            "details": log.details,
            "timestamp": log.timestamp.isoformat(),
            "ip_address": log.ip_address
        })

    # Per-member summary: how many actions each member did (grouped by username+action)
    summary_rows = db.query(
        AuditLog.username,
        AuditLog.action,
        func.count(AuditLog.id).label("count")
    ).filter(
        AuditLog.resource_id.in_(file_ids)
    ).group_by(AuditLog.username, AuditLog.action).order_by(
        func.count(AuditLog.id).desc()
    ).all()

    summary = [
        {
            "username": row.username or "Unknown",
            "action": row.action,
            "count": row.count
        }
        for row in summary_rows
    ]

    return {
        "organization_id": organization_id,
        "organization_name": organization.name,
        "total_events": len(activity),
        "activity": activity,
        "summary": summary
    }


@router.get("/{organization_id}/files/{file_id}/activity")
def get_org_file_activity(
    organization_id: int,
    file_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Return audit log activity for a specific org file. Members can see who accessed it.
    """
    from backend.app.models.audit import AuditLog

    _membership(db, organization_id, current_user)

    org_file = db.query(OrganizationFile).filter(
        OrganizationFile.organization_id == organization_id,
        OrganizationFile.file_id == file_id
    ).first()
    if not org_file:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found in this organization.")

    logs = db.query(AuditLog).filter(
        AuditLog.resource_id == file_id
    ).order_by(AuditLog.timestamp.desc()).limit(50).all()

    return [
        {
            "id": log.id,
            "username": log.username or "Unknown",
            "action": log.action,
            "status": log.status,
            "details": log.details,
            "timestamp": log.timestamp.isoformat(),
            "ip_address": log.ip_address
        }
        for log in logs
    ]
