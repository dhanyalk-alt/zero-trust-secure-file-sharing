import os
import hashlib
import datetime
import secrets
import io
import base64
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.backends import default_backend
from cryptography.fernet import Fernet

from backend.app.config import settings
from backend.app.database import get_db
from backend.app.models.user import User
from backend.app.models.file import EncryptedFile
from backend.app.models.share_link import SecureShareLink
from backend.app.security.auth import get_current_user
from backend.app.security.audit_logger import log_audit_event
from backend.app.crypto.rsa_key import unwrap_aes_key_oaep
from backend.app.crypto.aes_gcm import decrypt_aes_gcm, bytes_to_b64, b64_to_bytes
from backend.app.storage import get_storage_provider

router = APIRouter(tags=["Secure Share Links"])

PBKDF2_ITERATIONS = 100000


def derive_fernet_key(token: str, file_id: str) -> bytes:
    """Derives a Fernet key from the token, server secret, and file_id."""
    salt = hashlib.sha256(f"{settings.SECRET_KEY}_{file_id}".encode()).digest()[:16]
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=PBKDF2_ITERATIONS,
        backend=default_backend()
    )
    raw_key = kdf.derive(token.encode())
    return base64.urlsafe_b64encode(raw_key)


class CreateShareLinkRequest(BaseModel):
    owner_private_key: str  # PEM - used to unwrap AES key for link encryption
    expires_hours: Optional[int] = 24  # None = never
    max_uses: Optional[int] = None
    label: Optional[str] = None


@router.post("/api/files/{file_id}/share-links", status_code=status.HTTP_201_CREATED)
def create_share_link(
    file_id: str,
    req: CreateShareLinkRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    file = db.query(EncryptedFile).filter(
        EncryptedFile.id == file_id,
        EncryptedFile.is_deleted == False
    ).first()
    if not file:
        raise HTTPException(status_code=404, detail="File not found.")

    if file.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the file owner can create public share links.")

    # Unwrap AES key using owner's private key
    try:
        raw_aes_key = unwrap_aes_key_oaep(
            b64_to_bytes(file.owner_encrypted_aes_key),
            req.owner_private_key
        )
    except Exception:
        raise HTTPException(
            status_code=400,
            detail="Failed to decrypt file encryption key. Please check your private key."
        )

    # Generate cryptographically secure token
    token = secrets.token_hex(32)

    # Wrap AES key with Fernet derived from token
    try:
        fernet_key = derive_fernet_key(token, file_id)
        f = Fernet(fernet_key)
        wrapped_bytes = f.encrypt(raw_aes_key)
        wrapped_b64 = bytes_to_b64(wrapped_bytes)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Key encapsulation failed: {str(e)}")

    expires_at = None
    if req.expires_hours and req.expires_hours > 0:
        expires_at = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=req.expires_hours)

    link = SecureShareLink(
        file_id=file_id,
        created_by_id=current_user.id,
        token=token,
        wrapped_key_fernet=wrapped_b64,
        expires_at=expires_at,
        is_active=True,
        max_uses=req.max_uses,
        label=req.label or f"Share link for {file.original_filename}"
    )
    db.add(link)
    db.commit()
    db.refresh(link)

    log_audit_event(
        db=db,
        action="SHARE_LINK_CREATED",
        status="SUCCESS",
        user_id=current_user.id,
        username=current_user.username,
        resource_id=file.id,
        resource_name=file.original_filename,
        details=f"Secure share link created (token={token[:8]}..., expires={expires_at}, max_uses={req.max_uses})",
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent")
    )

    return {
        "id": link.id,
        "token": link.token,
        "label": link.label,
        "expires_at": link.expires_at.isoformat() if link.expires_at else None,
        "max_uses": link.max_uses,
        "use_count": link.use_count,
        "is_active": link.is_active,
        "created_at": link.created_at.isoformat()
    }


@router.get("/api/files/{file_id}/share-links")
def list_share_links(
    file_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    file = db.query(EncryptedFile).filter(
        EncryptedFile.id == file_id,
        EncryptedFile.is_deleted == False
    ).first()
    if not file:
        raise HTTPException(status_code=404, detail="File not found.")

    if file.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the file owner can view share links.")

    links = db.query(SecureShareLink).filter(
        SecureShareLink.file_id == file_id
    ).order_by(SecureShareLink.created_at.desc()).all()

    return [
        {
            "id": l.id,
            "token": l.token,
            "label": l.label,
            "expires_at": l.expires_at.isoformat() if l.expires_at else None,
            "max_uses": l.max_uses,
            "use_count": l.use_count,
            "is_active": l.is_active,
            "created_at": l.created_at.isoformat()
        }
        for l in links
    ]


@router.delete("/api/files/{file_id}/share-links/{link_id}")
def revoke_share_link(
    file_id: str,
    link_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    file = db.query(EncryptedFile).filter(
        EncryptedFile.id == file_id,
        EncryptedFile.is_deleted == False
    ).first()
    if not file:
        raise HTTPException(status_code=404, detail="File not found.")

    if file.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the file owner can revoke share links.")

    link = db.query(SecureShareLink).filter(
        SecureShareLink.id == link_id,
        SecureShareLink.file_id == file_id
    ).first()
    if not link:
        raise HTTPException(status_code=404, detail="Share link not found.")

    db.delete(link)
    db.commit()

    log_audit_event(
        db=db,
        action="SHARE_LINK_REVOKED",
        status="SUCCESS",
        user_id=current_user.id,
        username=current_user.username,
        resource_id=file.id,
        resource_name=file.original_filename,
        details=f"Secure share link {link_id} revoked."
    )

    return {"message": "Share link successfully revoked."}


# Public endpoints (no authentication required)
@router.get("/api/share/{token}")
def get_public_share_info(
    token: str,
    db: Session = Depends(get_db)
):
    link = db.query(SecureShareLink).filter(
        SecureShareLink.token == token,
        SecureShareLink.is_active == True
    ).first()
    if not link:
        raise HTTPException(status_code=404, detail="Share link not found or has been revoked.")

    now_utc = datetime.datetime.now(datetime.timezone.utc)
    if link.expires_at:
        exp = link.expires_at
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=datetime.timezone.utc)
        if exp < now_utc:
            raise HTTPException(status_code=410, detail="This share link has expired.")

    if link.max_uses and link.use_count >= link.max_uses:
        raise HTTPException(status_code=410, detail="This share link has reached its maximum download limit.")

    file = db.query(EncryptedFile).filter(
        EncryptedFile.id == link.file_id,
        EncryptedFile.is_deleted == False
    ).first()
    if not file:
        raise HTTPException(status_code=404, detail="Shared file is no longer available.")

    owner = db.query(User).filter(User.id == file.owner_id).first()

    return {
        "filename": file.original_filename,
        "file_size": file.file_size,
        "mime_type": file.mime_type,
        "label": link.label,
        "owner_username": owner.username if owner else "Unknown",
        "created_at": file.created_at.isoformat() if file.created_at else None,
        "expires_at": link.expires_at.isoformat() if link.expires_at else None,
        "uses_remaining": (link.max_uses - link.use_count) if link.max_uses else None
    }


@router.get("/api/share/{token}/download")
def download_public_share(
    token: str,
    request: Request,
    db: Session = Depends(get_db)
):
    link = db.query(SecureShareLink).filter(
        SecureShareLink.token == token,
        SecureShareLink.is_active == True
    ).first()
    if not link:
        raise HTTPException(status_code=404, detail="Share link not found or revoked.")

    now_utc = datetime.datetime.now(datetime.timezone.utc)
    if link.expires_at:
        exp = link.expires_at
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=datetime.timezone.utc)
        if exp < now_utc:
            raise HTTPException(status_code=410, detail="Share link has expired.")

    if link.max_uses and link.use_count >= link.max_uses:
        raise HTTPException(status_code=410, detail="Share link has reached its maximum allowed downloads.")

    file = db.query(EncryptedFile).filter(
        EncryptedFile.id == link.file_id,
        EncryptedFile.is_deleted == False
    ).first()
    if not file:
        raise HTTPException(status_code=404, detail="File no longer exists.")

    # Decrypt AES key with Fernet derived from token
    try:
        fernet_key = derive_fernet_key(token, file.id)
        f = Fernet(fernet_key)
        raw_aes_key = f.decrypt(b64_to_bytes(link.wrapped_key_fernet))
    except Exception:
        raise HTTPException(status_code=500, detail="Key derivation / decryption failed.")

    # Read ciphertext from storage
    storage_provider = get_storage_provider()
    storage_key = f"{file.id}.enc"
    try:
        ciphertext = storage_provider.read(storage_key)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Encrypted file payload missing.")

    # Decrypt file with AES-256-GCM
    try:
        plaintext = decrypt_aes_gcm(
            ciphertext=ciphertext,
            tag=b64_to_bytes(file.aes_gcm_tag),
            key=raw_aes_key,
            nonce=b64_to_bytes(file.aes_gcm_nonce)
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"File decryption failed: {str(e)}")

    # Increment use count
    link.use_count += 1
    db.commit()

    log_audit_event(
        db=db,
        action="SHARE_LINK_DOWNLOAD",
        status="SUCCESS",
        resource_id=file.id,
        resource_name=file.original_filename,
        details=f"Public download via share link '{token[:8]}...' (use #{link.use_count})",
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent")
    )

    return StreamingResponse(
        io.BytesIO(plaintext),
        media_type=file.mime_type or "application/octet-stream",
        headers={
            "Content-Disposition": f'attachment; filename="{file.original_filename}"',
            "X-File-SHA256": file.file_sha256_hash or ""
        }
    )
