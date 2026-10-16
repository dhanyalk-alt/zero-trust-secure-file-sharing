import uuid
import datetime
from sqlalchemy import Column, String, Integer, DateTime, Boolean, ForeignKey, Text
from sqlalchemy.orm import relationship
from backend.app.database import Base


class EncryptedFile(Base):
    __tablename__ = "encrypted_files"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    owner_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    original_filename = Column(String(255), nullable=False)
    file_size = Column(Integer, nullable=False)
    mime_type = Column(String(100), nullable=False, default="application/octet-stream")

    # Secure storage location reference (abstracted for local or cloud object storage)
    encrypted_storage_path = Column(String(500), nullable=False)

    # Cryptographic integrity & confidentiality metadata
    file_sha256_hash = Column(String(64), nullable=False, index=True)
    aes_gcm_nonce = Column(String(64), nullable=False)  # Base64 encoded 12-byte nonce
    aes_gcm_tag = Column(String(64), nullable=False)    # Base64 encoded 16-byte tag

    # Canonical signed manifest for authenticity and non-repudiation
    canonical_manifest_json = Column(Text, nullable=False)
    manifest_signature = Column(Text, nullable=False)  # Base64 encoded RSA-PSS signature

    # Owner's encrypted AES-256 key (wrapped with owner's RSA encryption public key)
    owner_encrypted_aes_key = Column(Text, nullable=False)

    is_deleted = Column(Boolean, default=False, nullable=False)
    expires_at = Column(DateTime, nullable=True)  # None means no expiry; enforced by ZeroTrustVerifier
    created_at = Column(DateTime, default=lambda: datetime.datetime.now(datetime.timezone.utc), nullable=False)
    category_id = Column(Integer, ForeignKey("file_categories.id", ondelete="SET NULL"), nullable=True, index=True)

    # Relationships
    owner = relationship("User", back_populates="owned_files")
    permissions = relationship("FilePermission", back_populates="file", cascade="all, delete-orphan")
    category = relationship("backend.app.models.category.FileCategory", back_populates="files")
