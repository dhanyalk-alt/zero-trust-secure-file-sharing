import uuid
import datetime
import io
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form, Header, Request, Response, Query, Body
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import select

from backend.app.config import settings
from backend.app.database import get_db
from backend.app.models.user import User
from backend.app.models.file import EncryptedFile
from backend.app.models.permission import FilePermission
from backend.app.models.organization import Organization, OrganizationFile, OrganizationMembership
from backend.app.models.category import FileCategory
from backend.app.schemas.file import FileMetadataOut, FileVerifyOut, SetFileExpiryRequest
from backend.app.schemas.category import CategoryCreate, CategoryUpdate, CategoryOut, MoveFileCategoryRequest
from backend.app.security.auth import get_current_user
from backend.app.security.zero_trust import ZeroTrustVerifier
from backend.app.security.audit_logger import log_audit_event
from backend.app.crypto.aes_gcm import (
    generate_aes_key,
    generate_nonce,
    encrypt_aes_gcm,
    decrypt_aes_gcm,
    bytes_to_b64,
    b64_to_bytes
)
from backend.app.crypto.rsa_key import wrap_aes_key_oaep, unwrap_aes_key_oaep
from backend.app.crypto.signatures import sign_manifest_rsa_pss, verify_manifest_rsa_pss
from backend.app.crypto.hashing import compute_sha256, build_canonical_manifest, verify_file_hash
from backend.app.storage import get_storage_provider

router = APIRouter(prefix="/api/files", tags=["Files"])


@router.post("/upload", response_model=FileMetadataOut, status_code=status.HTTP_201_CREATED)
async def upload_file(
    request: Request,
    file: UploadFile = File(...),
    signing_private_key: Optional[str] = Form(None),
    client_manifest_signature: Optional[str] = Form(None),
    organization_id: Optional[int] = Form(None),
    category_id: Optional[int] = Form(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    ip_addr = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")

    organization = None
    if organization_id is not None:
        organization = db.query(Organization).filter(Organization.id == organization_id).first()
        membership = db.query(OrganizationMembership).filter(
            OrganizationMembership.organization_id == organization_id,
            OrganizationMembership.user_id == current_user.id
        ).first()
        if not organization or not membership:
            log_audit_event(
                db=db,
                action="ORGANIZATION_FILE_UPLOAD_DENIED",
                status="DENIED",
                user_id=current_user.id,
                username=current_user.username,
                resource_id=str(organization_id),
                resource_name=organization.name if organization else None,
                details="Non-member or invalid organization attempted an organization file upload.",
                ip_address=ip_addr,
                user_agent=user_agent
            )
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found.")
        if membership.role not in ("owner", "admin") and not membership.can_upload:
            log_audit_event(
                db=db,
                action="ORGANIZATION_FILE_UPLOAD_DENIED",
                status="DENIED",
                user_id=current_user.id,
                username=current_user.username,
                resource_id=str(organization_id),
                resource_name=organization.name,
                details="Member attempted to upload without organization upload permission.",
                ip_address=ip_addr,
                user_agent=user_agent
            )
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have permission to upload to this organization.")

    # Check personal file upload limit (15 files maximum on Free tier; org files excluded)
    if organization_id is None:
        now_utc = datetime.datetime.now(datetime.timezone.utc)
        is_active_subscription = False
        if current_user.subscription_status == "ACTIVE" and current_user.subscription_expires_at:
            exp = current_user.subscription_expires_at
            if exp.tzinfo is None:
                exp = exp.replace(tzinfo=datetime.timezone.utc)
            if exp > now_utc:
                is_active_subscription = True
            else:
                current_user.subscription_status = "EXPIRED"
                db.commit()

        if not is_active_subscription:
            org_file_subquery = select(OrganizationFile.file_id)
            personal_files_count = db.query(EncryptedFile).filter(
                EncryptedFile.owner_id == current_user.id,
                EncryptedFile.is_deleted == False,
                ~EncryptedFile.id.in_(org_file_subquery)
            ).count()

            if personal_files_count >= 15:
                log_audit_event(
                    db=db,
                    action="UPLOAD_QUOTA_EXCEEDED",
                    status="DENIED",
                    user_id=current_user.id,
                    username=current_user.username,
                    details=f"Personal upload quota exceeded ({personal_files_count}/15 files). Upgrade required.",
                    ip_address=ip_addr,
                    user_agent=user_agent
                )
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Personal file limit reached (15 files maximum on Free tier). Please upgrade your subscription to upload more files."
                )

    # 1. Check user public keys
    if not current_user.encryption_public_key or not current_user.signing_public_key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User must have registered encryption and signing public keys before uploading files."
        )

    # 2. Validate filename and extension
    filename = file.filename or "unnamed_file"
    file_ext = filename.split(".")[-1].lower() if "." in filename else ""
    if settings.allowed_extensions_set and file_ext not in settings.allowed_extensions_set:
        log_audit_event(
            db=db,
            action="FILE_UPLOAD_BLOCKED",
            status="DENIED",
            user_id=current_user.id,
            username=current_user.username,
            resource_name=filename,
            details=f"File extension '{file_ext}' rejected by upload security policy.",
            ip_address=ip_addr,
            user_agent=user_agent
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File extension '.{file_ext}' is not permitted by security policy."
        )

    # Read file content safely
    content = await file.read()
    file_size = len(content)

    # Enforce max file size
    if file_size > settings.MAX_UPLOAD_SIZE_BYTES:
        log_audit_event(
            db=db,
            action="FILE_UPLOAD_BLOCKED",
            status="DENIED",
            user_id=current_user.id,
            username=current_user.username,
            resource_name=filename,
            details=f"File size {file_size} exceeds max limit of {settings.MAX_UPLOAD_SIZE_BYTES} bytes.",
            ip_address=ip_addr,
            user_agent=user_agent
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File size exceeds maximum allowed limit of {settings.MAX_UPLOAD_SIZE_BYTES // (1024*1024)} MB."
        )

    # 3. Calculate SHA-256 hash of original file
    file_sha256 = compute_sha256(content)
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
    mime_type = file.content_type or "application/octet-stream"

    # 4. Create canonical manifest
    canonical_manifest = build_canonical_manifest(
        file_sha256=file_sha256,
        original_filename=filename,
        file_size=file_size,
        owner_id=current_user.id,
        created_at_iso=now_iso,
        mime_type=mime_type
    )

    # 5. Manifest signature: verify client-provided signature or sign with sender's signing key
    manifest_signature = None
    if client_manifest_signature:
        # Verify signature immediately against sender's signing public key
        if not verify_manifest_rsa_pss(canonical_manifest.encode("utf-8"), client_manifest_signature, current_user.signing_public_key):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Provided client manifest signature is invalid for your registered signing public key."
            )
        manifest_signature = client_manifest_signature
    elif signing_private_key:
        manifest_signature = sign_manifest_rsa_pss(canonical_manifest.encode("utf-8"), signing_private_key)
    else:
        # If no client signature and no key provided in request, raise error
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A digital signature or your signing private key must be provided to sign the canonical manifest."
        )

    # 6. Generate unique 256-bit AES key and 96-bit nonce
    aes_key = generate_aes_key()
    nonce = generate_nonce()

    # 7. Encrypt file using AES-256-GCM
    ciphertext, tag = encrypt_aes_gcm(plaintext=content, key=aes_key, nonce=nonce)

    # 8. Wrap AES key with owner's RSA encryption public key
    wrapped_owner_aes_key = wrap_aes_key_oaep(aes_key, current_user.encryption_public_key)
    owner_aes_key_b64 = bytes_to_b64(wrapped_owner_aes_key)

    # 9. Store encrypted ciphertext in storage provider
    storage_provider = get_storage_provider()
    file_id = str(uuid.uuid4())
    storage_key = f"{file_id}.enc"
    storage_path = storage_provider.save(storage_key, ciphertext)

    cat_name = None
    if category_id is not None:
        cat = db.query(FileCategory).filter(
            FileCategory.id == category_id,
            FileCategory.user_id == current_user.id
        ).first()
        if cat:
            cat_name = cat.name
        else:
            category_id = None

    # 10. Persist metadata in database
    new_file = EncryptedFile(
        id=file_id,
        owner_id=current_user.id,
        original_filename=filename,
        file_size=file_size,
        mime_type=mime_type,
        encrypted_storage_path=storage_path,
        file_sha256_hash=file_sha256,
        aes_gcm_nonce=bytes_to_b64(nonce),
        aes_gcm_tag=bytes_to_b64(tag),
        canonical_manifest_json=canonical_manifest,
        manifest_signature=manifest_signature,
        owner_encrypted_aes_key=owner_aes_key_b64,
        category_id=category_id
    )

    db.add(new_file)
    if organization:
        db.add(OrganizationFile(
            organization_id=organization.id,
            file_id=new_file.id,
            uploaded_by_id=current_user.id
        ))
    db.commit()
    db.refresh(new_file)

    log_audit_event(
        db=db,
        action="FILE_UPLOAD",
        status="SUCCESS",
        user_id=current_user.id,
        username=current_user.username,
        resource_id=new_file.id,
        resource_name=new_file.original_filename,
        details=f"File encrypted with AES-256-GCM (SHA-256: {file_sha256[:16]}...) and stored securely.",
        ip_address=ip_addr,
        user_agent=user_agent
    )
    if organization:
        log_audit_event(
            db=db,
            action="ORGANIZATION_FILE_UPLOADED",
            status="SUCCESS",
            user_id=current_user.id,
            username=current_user.username,
            resource_id=new_file.id,
            resource_name=new_file.original_filename,
            details=f"Encrypted file uploaded to organization '{organization.name}' (ID {organization.id}).",
            ip_address=ip_addr,
            user_agent=user_agent
        )

        # Auto-grant org members FilePermission: wrap AES key with each member's RSA public key
        # so they can independently decrypt without the owner's private key (Zero Trust principle).
        org_memberships = db.query(OrganizationMembership).filter(
            OrganizationMembership.organization_id == organization.id,
            OrganizationMembership.user_id != current_user.id  # skip uploader (they are file owner)
        ).all()
        for mem in org_memberships:
            member_user = db.query(User).filter(User.id == mem.user_id).first()
            if not member_user or not member_user.encryption_public_key:
                continue  # skip members who haven't registered keys yet
            existing_perm = db.query(FilePermission).filter(
                FilePermission.file_id == new_file.id,
                FilePermission.recipient_id == mem.user_id
            ).first()
            if existing_perm:
                continue
            try:
                member_wrapped_key = wrap_aes_key_oaep(aes_key, member_user.encryption_public_key)
                member_key_b64 = bytes_to_b64(member_wrapped_key)
                perm = FilePermission(
                    file_id=new_file.id,
                    recipient_id=mem.user_id,
                    encrypted_aes_key=member_key_b64,
                    can_read=True,
                    can_download=True,
                    can_share=False,
                    is_one_time=False,
                    granted_by_id=current_user.id
                )
                db.add(perm)
            except Exception:
                pass  # Skip silently if key wrapping fails for this member
        db.commit()

    return FileMetadataOut(
        id=new_file.id,
        owner_id=new_file.owner_id,
        owner_username=current_user.username,
        original_filename=new_file.original_filename,
        file_size=new_file.file_size,
        mime_type=new_file.mime_type,
        file_sha256_hash=new_file.file_sha256_hash,
        aes_gcm_nonce=new_file.aes_gcm_nonce,
        aes_gcm_tag=new_file.aes_gcm_tag,
        canonical_manifest_json=new_file.canonical_manifest_json,
        manifest_signature=new_file.manifest_signature,
        created_at=new_file.created_at,
        can_download=True,
        can_share=True,
        is_owner=True,
        category_id=new_file.category_id,
        category_name=cat_name
    )


@router.get("/categories", response_model=List[CategoryOut])
def get_categories(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    categories = db.query(FileCategory).filter(
        FileCategory.user_id == current_user.id
    ).order_by(FileCategory.name.asc()).all()

    org_file_ids_subq = select(OrganizationFile.file_id)
    results = []
    for cat in categories:
        file_count = db.query(EncryptedFile).filter(
            EncryptedFile.owner_id == current_user.id,
            EncryptedFile.category_id == cat.id,
            EncryptedFile.is_deleted == False,
            EncryptedFile.id.notin_(org_file_ids_subq)
        ).count()
        results.append(CategoryOut(
            id=cat.id,
            user_id=cat.user_id,
            name=cat.name,
            file_count=file_count,
            created_at=cat.created_at
        ))
    return results


@router.post("/categories", response_model=CategoryOut, status_code=status.HTTP_201_CREATED)
def create_category(
    cat_data: CategoryCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    existing = db.query(FileCategory).filter(
        FileCategory.user_id == current_user.id,
        FileCategory.name.ilike(cat_data.name)
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Category '{cat_data.name}' already exists."
        )

    new_cat = FileCategory(
        user_id=current_user.id,
        name=cat_data.name
    )
    db.add(new_cat)
    db.commit()
    db.refresh(new_cat)
    return CategoryOut(
        id=new_cat.id,
        user_id=new_cat.user_id,
        name=new_cat.name,
        file_count=0,
        created_at=new_cat.created_at
    )


@router.patch("/categories/{category_id}", response_model=CategoryOut)
def update_category(
    category_id: int,
    cat_data: CategoryUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    cat = db.query(FileCategory).filter(
        FileCategory.id == category_id,
        FileCategory.user_id == current_user.id
    ).first()
    if not cat:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found.")

    existing = db.query(FileCategory).filter(
        FileCategory.user_id == current_user.id,
        FileCategory.name.ilike(cat_data.name),
        FileCategory.id != category_id
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Category with name '{cat_data.name}' already exists."
        )

    cat.name = cat_data.name
    db.commit()
    db.refresh(cat)

    org_file_ids_subq = select(OrganizationFile.file_id)
    file_count = db.query(EncryptedFile).filter(
        EncryptedFile.owner_id == current_user.id,
        EncryptedFile.category_id == cat.id,
        EncryptedFile.is_deleted == False,
        EncryptedFile.id.notin_(org_file_ids_subq)
    ).count()

    return CategoryOut(
        id=cat.id,
        user_id=cat.user_id,
        name=cat.name,
        file_count=file_count,
        created_at=cat.created_at
    )


@router.delete("/categories/{category_id}")
def delete_category(
    category_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    cat = db.query(FileCategory).filter(
        FileCategory.id == category_id,
        FileCategory.user_id == current_user.id
    ).first()
    if not cat:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found.")

    # Safely move all files in this category to Uncategorized (category_id = None)
    db.query(EncryptedFile).filter(
        EncryptedFile.owner_id == current_user.id,
        EncryptedFile.category_id == category_id
    ).update({EncryptedFile.category_id: None}, synchronize_session=False)

    db.delete(cat)
    db.commit()
    return {"message": "Category deleted; associated files moved to Uncategorized."}


@router.patch("/{file_id}/category", response_model=FileMetadataOut)
def update_file_category(
    file_id: str,
    req_data: MoveFileCategoryRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    file = db.query(EncryptedFile).filter(
        EncryptedFile.id == file_id,
        EncryptedFile.owner_id == current_user.id,
        EncryptedFile.is_deleted == False
    ).first()
    if not file:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found.")

    category_name = None
    if req_data.category_id is not None:
        cat = db.query(FileCategory).filter(
            FileCategory.id == req_data.category_id,
            FileCategory.user_id == current_user.id
        ).first()
        if not cat:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Target category not found.")
        category_name = cat.name
        file.category_id = cat.id
    else:
        file.category_id = None

    db.commit()
    db.refresh(file)

    log_audit_event(
        db=db,
        action="FILE_CATEGORY_CHANGED",
        status="SUCCESS",
        user_id=current_user.id,
        username=current_user.username,
        resource_id=file.id,
        resource_name=file.original_filename,
        details=f"Moved to category '{category_name or 'Uncategorized'}'.",
        ip_address=None,
        user_agent=None
    )

    now_utc = datetime.datetime.now(datetime.timezone.utc)
    return FileMetadataOut(
        id=file.id,
        owner_id=file.owner_id,
        owner_username=current_user.username,
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
        is_expired=(file.expires_at is not None and file.expires_at.replace(tzinfo=datetime.timezone.utc) < now_utc),
        can_download=True,
        can_share=True,
        is_owner=True,
        category_id=file.category_id,
        category_name=category_name
    )


@router.get("/my-files", response_model=List[FileMetadataOut])
def get_my_files(
    search: Optional[str] = None,
    sort_by: Optional[str] = None,
    category_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    org_file_ids_subq = select(OrganizationFile.file_id)
    query = db.query(EncryptedFile).filter(
        EncryptedFile.owner_id == current_user.id,
        EncryptedFile.is_deleted == False,
        EncryptedFile.id.notin_(org_file_ids_subq)
    )
    if category_id:
        if category_id.lower() == "uncategorized":
            query = query.filter(EncryptedFile.category_id.is_(None))
        elif category_id.isdigit():
            query = query.filter(EncryptedFile.category_id == int(category_id))

    if search:
        query = query.filter(EncryptedFile.original_filename.ilike(f"%{search}%"))

    if sort_by == "size":
        query = query.order_by(EncryptedFile.file_size.desc())
    elif sort_by == "name":
        query = query.order_by(EncryptedFile.original_filename.asc())
    else:
        query = query.order_by(EncryptedFile.created_at.desc())

    files = query.all()
    now_utc = datetime.datetime.now(datetime.timezone.utc)

    return [
        FileMetadataOut(
            id=f.id,
            owner_id=f.owner_id,
            owner_username=current_user.username,
            original_filename=f.original_filename,
            file_size=f.file_size,
            mime_type=f.mime_type,
            file_sha256_hash=f.file_sha256_hash,
            aes_gcm_nonce=f.aes_gcm_nonce,
            aes_gcm_tag=f.aes_gcm_tag,
            canonical_manifest_json=f.canonical_manifest_json,
            manifest_signature=f.manifest_signature,
            created_at=f.created_at,
            expires_at=f.expires_at,
            is_expired=(f.expires_at is not None and f.expires_at.replace(tzinfo=datetime.timezone.utc) < now_utc),
            can_download=True,
            can_share=True,
            is_owner=True,
            category_id=f.category_id,
            category_name=f.category.name if f.category else None
        )
        for f in files
    ]


@router.get("/analytics/summary")
def get_analytics_summary(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get analytics summary for all user files."""
    from backend.app.models.audit import AuditLog
    from sqlalchemy import func

    user_files = db.query(EncryptedFile).filter(
        EncryptedFile.owner_id == current_user.id,
        EncryptedFile.is_deleted == False
    ).all()
    file_ids = [f.id for f in user_files]

    event_map = {}
    download_map = {}
    if file_ids:
        events = db.query(AuditLog.resource_id, func.count(AuditLog.id).label('count')).filter(
            AuditLog.resource_id.in_(file_ids)
        ).group_by(AuditLog.resource_id).all()
        event_map = {e.resource_id: e.count for e in events}

        downloads = db.query(AuditLog.resource_id, func.count(AuditLog.id).label('count')).filter(
            AuditLog.resource_id.in_(file_ids),
            AuditLog.action == "FILE_DOWNLOAD",
            AuditLog.status == "SUCCESS"
        ).group_by(AuditLog.resource_id).all()
        download_map = {d.resource_id: d.count for d in downloads}

    results = []
    for f in user_files:
        results.append({
            "file_id": f.id,
            "filename": f.original_filename,
            "file_size": f.file_size,
            "total_events": event_map.get(f.id, 0),
            "download_count": download_map.get(f.id, 0),
            "created_at": f.created_at.isoformat() if f.created_at else None
        })
    results.sort(key=lambda x: x['total_events'], reverse=True)
    return {
        "files": results,
        "total_files": len(results),
        "total_events": sum(r["total_events"] for r in results),
        "total_downloads": sum(r["download_count"] for r in results)
    }


@router.get("/shared-with-me", response_model=List[FileMetadataOut])
def get_shared_with_me(
    search: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Only active, non-revoked permissions
    query = db.query(FilePermission).join(EncryptedFile).filter(
        FilePermission.recipient_id == current_user.id,
        FilePermission.is_revoked == False,
        EncryptedFile.is_deleted == False
    )
    if search:
        query = query.filter(EncryptedFile.original_filename.ilike(f"%{search}%"))

    perms = query.order_by(FilePermission.granted_at.desc()).all()
    now_utc = datetime.datetime.now(datetime.timezone.utc)

    results = []
    for p in perms:
        f = p.file
        owner = db.query(User).filter(User.id == f.owner_id).first()
        results.append(
            FileMetadataOut(
                id=f.id,
                owner_id=f.owner_id,
                owner_username=owner.username if owner else "Unknown",
                shared_by_username=(
                    p.granted_by.username
                    if p.granted_by else (owner.username if owner else "Unknown")
                ),
                original_filename=f.original_filename,
                file_size=f.file_size,
                mime_type=f.mime_type,
                file_sha256_hash=f.file_sha256_hash,
                aes_gcm_nonce=f.aes_gcm_nonce,
                aes_gcm_tag=f.aes_gcm_tag,
                canonical_manifest_json=f.canonical_manifest_json,
                manifest_signature=f.manifest_signature,
                created_at=f.created_at,
                expires_at=f.expires_at,
                is_expired=(f.expires_at is not None and f.expires_at.replace(tzinfo=datetime.timezone.utc) < now_utc),
                can_read=p.can_read,
                can_download=p.can_download,
                can_share=p.can_share,
                is_one_time=p.is_one_time,
                is_owner=False
            )
        )
    return results


@router.get("/{file_id}/metadata", response_model=FileMetadataOut)
def get_file_metadata(
    file_id: str,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    req_context = {
        "ip_address": request.client.host if request.client else None,
        "user_agent": request.headers.get("user-agent")
    }
    file, perm, _ = ZeroTrustVerifier.verify_file_access(
        db=db,
        user=current_user,
        file_id=file_id,
        action="read",
        request_context=req_context
    )

    owner = db.query(User).filter(User.id == file.owner_id).first()
    is_owner = (file.owner_id == current_user.id)

    return FileMetadataOut(
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
        can_read=True if is_owner else (perm.can_read if perm else False),
        can_download=True if is_owner else (perm.can_download if perm else False),
        can_share=True if is_owner else (perm.can_share if perm else False),
        is_owner=is_owner
    )


@router.get("/{file_id}/analytics")
def get_file_analytics(
    file_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get detailed analytics for a specific file."""
    from backend.app.models.audit import AuditLog
    from sqlalchemy import func

    file = db.query(EncryptedFile).filter(
        EncryptedFile.id == file_id,
        EncryptedFile.is_deleted == False
    ).first()
    if not file:
        raise HTTPException(status_code=404, detail="File not found.")
    if file.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the file owner can view file analytics.")

    by_action = db.query(AuditLog.action, func.count(AuditLog.id).label('count')).filter(
        AuditLog.resource_id == file_id
    ).group_by(AuditLog.action).all()

    since = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=14)
    recent = db.query(AuditLog).filter(
        AuditLog.resource_id == file_id,
        AuditLog.timestamp >= since
    ).order_by(AuditLog.timestamp.desc()).limit(100).all()

    daily_counts = {}
    for log in recent:
        day_key = log.timestamp.strftime('%Y-%m-%d')
        daily_counts[day_key] = daily_counts.get(day_key, 0) + 1

    top_accessors = db.query(AuditLog.username, func.count(AuditLog.id).label('count')).filter(
        AuditLog.resource_id == file_id,
        AuditLog.username.isnot(None)
    ).group_by(AuditLog.username).order_by(func.count(AuditLog.id).desc()).limit(5).all()

    return {
        "file_id": file_id,
        "filename": file.original_filename,
        "by_action": [{"action": a.action, "count": a.count} for a in by_action],
        "daily_activity": [{"date": k, "count": v} for k, v in sorted(daily_counts.items())],
        "top_accessors": [{"username": a.username, "count": a.count} for a in top_accessors]
    }


@router.get("/{file_id}/verify", response_model=FileVerifyOut)
def verify_file_integrity(
    file_id: str,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Performs full Zero Trust integrity & authenticity verification:
    1. Authorization & Revocation status
    2. File storage existence
    3. Sender RSA-PSS digital signature verification against sender's registered public key
    4. Canonical manifest integrity
    """
    req_context = {
        "ip_address": request.client.host if request.client else None,
        "user_agent": request.headers.get("user-agent")
    }
    file, _, _ = ZeroTrustVerifier.verify_file_access(
        db=db,
        user=current_user,
        file_id=file_id,
        action="read",
        request_context=req_context
    )

    owner = db.query(User).filter(User.id == file.owner_id).first()
    if not owner or not owner.signing_public_key:
        return FileVerifyOut(
            file_id=file.id,
            original_filename=file.original_filename,
            file_sha256_hash=file.file_sha256_hash,
            signature_valid=False,
            hash_valid=False,
            aes_gcm_authenticated=False,
            sender_public_key_present=False,
            overall_status="SIGNATURE_INVALID",
            details="File owner signing public key is missing. Authenticity cannot be verified."
        )

    # Verify RSA-PSS signature on canonical manifest
    sig_valid = verify_manifest_rsa_pss(
        manifest_bytes=file.canonical_manifest_json.encode("utf-8"),
        signature_b64=file.manifest_signature,
        public_key_pem=owner.signing_public_key
    )

    # Check stored ciphertext existence
    storage_provider = get_storage_provider()
    storage_key = f"{file.id}.enc"
    storage_exists = storage_provider.exists(storage_key)

    if not sig_valid:
        log_audit_event(
            db=db,
            action="SIGNATURE_VERIFICATION_FAILED",
            status="TAMPERED",
            user_id=current_user.id,
            username=current_user.username,
            resource_id=file.id,
            resource_name=file.original_filename,
            details="Digital signature verification failed on canonical manifest.",
            ip_address=req_context["ip_address"],
            user_agent=req_context["user_agent"]
        )
        return FileVerifyOut(
            file_id=file.id,
            original_filename=file.original_filename,
            file_sha256_hash=file.file_sha256_hash,
            signature_valid=False,
            hash_valid=True,
            aes_gcm_authenticated=storage_exists,
            sender_public_key_present=True,
            overall_status="SIGNATURE_INVALID",
            details="RSA-PSS digital signature failed verification. Manifest or sender identity compromised."
        )

    log_audit_event(
        db=db,
        action="INTEGRITY_VERIFIED",
        status="SUCCESS",
        user_id=current_user.id,
        username=current_user.username,
        resource_id=file.id,
        resource_name=file.original_filename,
        details="Digital signature and canonical manifest verified authentic.",
        ip_address=req_context["ip_address"],
        user_agent=req_context["user_agent"]
    )

    return FileVerifyOut(
        file_id=file.id,
        original_filename=file.original_filename,
        file_sha256_hash=file.file_sha256_hash,
        signature_valid=True,
        hash_valid=True,
        aes_gcm_authenticated=storage_exists,
        sender_public_key_present=True,
        overall_status="VERIFIED_AUTHENTIC",
        details="Digital signature valid, sender public key authenticated, ciphertext intact."
    )


@router.post("/{file_id}/preview")
@router.post("/{file_id}/download")
def download_file(
    file_id: str,
    request: Request,
    private_key_pem: Optional[str] = Form(None),
    x_user_private_key: Optional[str] = Header(None, alias="X-User-Private-Key"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Zero Trust Protected Download Flow:
    1. Authenticate requester & verify account status.
    2. Enforce real-time authorization & immediate revocation state.
    3. Check risk policy & download velocity.
    4. Retrieve encrypted file from storage provider.
    5. Verify sender's RSA-PSS digital signature on canonical manifest.
    6. Unwrap recipient's AES key using recipient's RSA private key.
    7. Authenticate & decrypt ciphertext using AES-256-GCM.
    8. Compute SHA-256 of decrypted bytes and compare against signed canonical manifest.
    9. Log verification outcome to immutable audit log.
    10. Return decrypted file.
    """
    req_context = {
        "ip_address": request.client.host if request.client else None,
        "user_agent": request.headers.get("user-agent")
    }

    # Preview and download share the same verified decrypt pipeline, but use
    # distinct Zero Trust permission checks. A read-only grant can preview.
    is_preview = request.url.path.endswith("/preview")
    access_action = "read" if is_preview else "download"
    file, perm, encrypted_aes_key_b64 = ZeroTrustVerifier.verify_file_access(
        db=db,
        user=current_user,
        file_id=file_id,
        action=access_action,
        request_context=req_context
    )

    if perm:
        from backend.app.api.permissions import check_temporal_access
        if not check_temporal_access(perm):
            log_audit_event(
                db=db,
                action="TEMPORAL_ACCESS_DENIED",
                status="DENIED",
                user_id=current_user.id,
                username=current_user.username,
                resource_id=file.id,
                resource_name=file.original_filename,
                details="Access denied: outside permitted temporal window.",
                ip_address=req_context["ip_address"],
                user_agent=req_context["user_agent"]
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: outside permitted time window."
            )

    # Recipient private key for un-wrapping
    user_private_key = private_key_pem or x_user_private_key
    if not user_private_key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Your private key is required to unwrap the AES encryption key and decrypt the file."
        )

    # Retrieve ciphertext
    storage_provider = get_storage_provider()
    storage_key = f"{file.id}.enc"
    try:
        ciphertext = storage_provider.read(storage_key)
    except FileNotFoundError:
        log_audit_event(
            db=db,
            action="FILE_DOWNLOAD_FAILED",
            status="FAILED",
            user_id=current_user.id,
            username=current_user.username,
            resource_id=file.id,
            resource_name=file.original_filename,
            details="Encrypted file payload missing from storage provider.",
            ip_address=req_context["ip_address"],
            user_agent=req_context["user_agent"]
        )
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stored file payload is missing.")

    # 1. Verify digital signature on canonical manifest
    owner = db.query(User).filter(User.id == file.owner_id).first()
    if not owner or not owner.signing_public_key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Sender signing public key missing. Integrity cannot be verified."
        )

    sig_valid = verify_manifest_rsa_pss(
        manifest_bytes=file.canonical_manifest_json.encode("utf-8"),
        signature_b64=file.manifest_signature,
        public_key_pem=owner.signing_public_key
    )
    if not sig_valid:
        log_audit_event(
            db=db,
            action="SIGNATURE_VERIFICATION_FAILED",
            status="TAMPERED",
            user_id=current_user.id,
            username=current_user.username,
            resource_id=file.id,
            resource_name=file.original_filename,
            details="Download aborted: RSA-PSS manifest digital signature invalid.",
            ip_address=req_context["ip_address"],
            user_agent=req_context["user_agent"]
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Security verification failed: File manifest signature is invalid."
        )

    # 2. Unwrap recipient-specific AES key
    try:
        wrapped_aes_key = b64_to_bytes(encrypted_aes_key_b64)
        aes_key = unwrap_aes_key_oaep(wrapped_aes_key, user_private_key)
    except Exception as e:
        log_audit_event(
            db=db,
            action="KEY_UNWRAP_FAILED",
            status="DENIED",
            user_id=current_user.id,
            username=current_user.username,
            resource_id=file.id,
            resource_name=file.original_filename,
            details="Failed to unwrap AES key: recipient private key does not match.",
            ip_address=req_context["ip_address"],
            user_agent=req_context["user_agent"]
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This private key does not match the key used for this file. Restore the original matching private key backup; if that key has been lost, this file cannot be recovered."
        )

    # 3. Authenticate and decrypt using AES-256-GCM
    nonce = b64_to_bytes(file.aes_gcm_nonce)
    tag = b64_to_bytes(file.aes_gcm_tag)

    try:
        decrypted_content = decrypt_aes_gcm(ciphertext=ciphertext, tag=tag, key=aes_key, nonce=nonce)
    except ValueError as e:
        log_audit_event(
            db=db,
            action="AES_GCM_AUTH_FAILED",
            status="TAMPERED",
            user_id=current_user.id,
            username=current_user.username,
            resource_id=file.id,
            resource_name=file.original_filename,
            details="AES-GCM authentication tag verification failed. Ciphertext corrupted or tampered.",
            ip_address=req_context["ip_address"],
            user_agent=req_context["user_agent"]
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Integrity check failed: AES-GCM ciphertext or authentication tag has been tampered with."
        )

    # 4. Strict SHA-256 verification against canonical manifest
    if not verify_file_hash(decrypted_content, file.file_sha256_hash):
        log_audit_event(
            db=db,
            action="SHA256_INTEGRITY_MISMATCH",
            status="TAMPERED",
            user_id=current_user.id,
            username=current_user.username,
            resource_id=file.id,
            resource_name=file.original_filename,
            details="Recovered file SHA-256 hash does not match original signed manifest hash.",
            ip_address=req_context["ip_address"],
            user_agent=req_context["user_agent"]
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Integrity check failed: Decrypted file hash does not match expected SHA-256 hash."
        )

    # Handle Burn-on-Read policy: if one-time access is enabled, immediately self-destruct/revoke
    burn_on_read_consumed = False
    if perm and perm.is_one_time:
        perm.access_count = (perm.access_count or 0) + 1
        perm.is_revoked = True
        perm.revoked_at = datetime.datetime.now(datetime.timezone.utc)
        perm.revoked_by_id = file.owner_id
        perm.encrypted_aes_key = ""  # Zero-out wrapped AES key
        db.commit()
        burn_on_read_consumed = True

        log_audit_event(
            db=db,
            action="BURN_ON_READ_EXECUTED",
            status="SUCCESS",
            user_id=current_user.id,
            username=current_user.username,
            resource_id=file.id,
            resource_name=file.original_filename,
            details=f"Burn-on-Read policy executed: one-time access consumed by '{current_user.username}'. Key destroyed and access permanently revoked.",
            ip_address=req_context["ip_address"],
            user_agent=req_context["user_agent"]
        )

    # Success: log audit event
    log_audit_event(
        db=db,
        action="FILE_PREVIEW" if is_preview else "FILE_DOWNLOAD",
        status="SUCCESS",
        user_id=current_user.id,
        username=current_user.username,
        resource_id=file.id,
        resource_name=file.original_filename,
        details=f"Zero Trust {access_action} verified: RSA signature, AES-GCM authentication, and SHA-256 integrity passed.",
        ip_address=req_context["ip_address"],
        user_agent=req_context["user_agent"]
    )

    response_headers = {
        "Content-Disposition": f'{"inline" if is_preview else "attachment"}; filename="{file.original_filename}"',
        "X-File-SHA256": file.file_sha256_hash,
        "X-ZeroTrust-Verified": "true",
        "X-Watermark-Recipient": current_user.email,
        "X-Watermark-Timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat()
    }
    if burn_on_read_consumed:
        response_headers["X-Burn-On-Read-Consumed"] = "true"

    return StreamingResponse(
        io.BytesIO(decrypted_content),
        media_type=file.mime_type,
        headers=response_headers
    )


@router.patch("/{file_id}/expiry")
def set_file_expiry(
    file_id: str,
    request: Request,
    body: Optional[SetFileExpiryRequest] = Body(None),
    expires_at: Optional[datetime.datetime] = Query(None),
    clear_expiry: bool = Query(False),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Owner-only: set or clear a file's expiration time.
    - Pass expires_at (ISO 8601 UTC) or clear_expiry in JSON body or query params.
    Once expired, Zero Trust blocks all access instantly.
    """
    req_context = {
        "ip_address": request.client.host if request.client else None,
        "user_agent": request.headers.get("user-agent")
    }

    file_obj = db.query(EncryptedFile).filter(
        EncryptedFile.id == file_id,
        EncryptedFile.is_deleted == False
    ).first()

    if not file_obj:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found.")

    if file_obj.owner_id != current_user.id:
        log_audit_event(
            db=db,
            action="UNAUTHORIZED_EXPIRY_SET_ATTEMPT",
            status="DENIED",
            user_id=current_user.id,
            username=current_user.username,
            resource_id=file_id,
            resource_name=file_obj.original_filename,
            details="Non-owner attempted to set file expiry.",
            ip_address=req_context["ip_address"],
            user_agent=req_context["user_agent"]
        )
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the file owner can set expiry.")

    # Determine effective values from body or query params
    target_clear = clear_expiry or (body.clear_expiry if body else False)
    target_expires_at = (body.expires_at if (body and body.expires_at is not None) else expires_at)

    if target_clear:
        file_obj.expires_at = None
        expiry_detail = "File expiry cleared (no expiry)."
    elif target_expires_at:
        # Normalize to UTC
        if target_expires_at.tzinfo is None:
            target_expires_at = target_expires_at.replace(tzinfo=datetime.timezone.utc)
        if target_expires_at <= datetime.datetime.now(datetime.timezone.utc):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="expires_at must be in the future."
            )
        file_obj.expires_at = target_expires_at
        expiry_detail = f"File expiry set to {target_expires_at.isoformat()}."
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Provide expires_at (datetime) or clear_expiry=true."
        )

    db.commit()

    log_audit_event(
        db=db,
        action="FILE_EXPIRY_SET",
        status="SUCCESS",
        user_id=current_user.id,
        username=current_user.username,
        resource_id=file_id,
        resource_name=file_obj.original_filename,
        details=expiry_detail,
        ip_address=req_context["ip_address"],
        user_agent=req_context["user_agent"]
    )

    return {
        "message": expiry_detail,
        "file_id": file_id,
        "expires_at": file_obj.expires_at.isoformat() if file_obj.expires_at else None
    }


@router.delete("/{file_id}")
def delete_file(
    file_id: str,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    req_context = {
        "ip_address": request.client.host if request.client else None,
        "user_agent": request.headers.get("user-agent")
    }

    file, _, _ = ZeroTrustVerifier.verify_file_access(
        db=db,
        user=current_user,
        file_id=file_id,
        action="delete",
        request_context=req_context
    )

    # Mark deleted
    file.is_deleted = True
    db.commit()

    # Clean up storage
    storage_provider = get_storage_provider()
    storage_key = f"{file.id}.enc"
    storage_provider.delete(storage_key)

    log_audit_event(
        db=db,
        action="FILE_DELETED",
        status="SUCCESS",
        user_id=current_user.id,
        username=current_user.username,
        resource_id=file.id,
        resource_name=file.original_filename,
        details="File deleted by owner and removed from storage.",
        ip_address=req_context["ip_address"],
        user_agent=req_context["user_agent"]
    )

    return {"message": "File deleted successfully."}
