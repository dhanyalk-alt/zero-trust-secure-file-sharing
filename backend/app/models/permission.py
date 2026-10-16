import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text, UniqueConstraint
from sqlalchemy.orm import relationship
from backend.app.database import Base


class FilePermission(Base):
    __tablename__ = "file_permissions"

    id = Column(Integer, primary_key=True, index=True)
    file_id = Column(String(36), ForeignKey("encrypted_files.id", ondelete="CASCADE"), nullable=False, index=True)
    recipient_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    granted_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    # Granular permissions
    can_read = Column(Boolean, default=True, nullable=False)
    can_download = Column(Boolean, default=True, nullable=False)
    can_share = Column(Boolean, default=False, nullable=False)

    # Burn-on-Read / One-time access policy
    is_one_time = Column(Boolean, default=False, nullable=False)
    access_count = Column(Integer, default=0, nullable=False)

    # Recipient-specific wrapped AES key (encrypted with recipient's RSA-OAEP public key)
    # Never stored in plaintext. Zeroed/cleared or made inaccessible when revoked.
    encrypted_aes_key = Column(Text, nullable=False)

    # Zero Trust Revocation state
    is_revoked = Column(Boolean, default=False, nullable=False, index=True)
    revoked_at = Column(DateTime, nullable=True)
    revoked_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    granted_at = Column(DateTime, default=lambda: datetime.datetime.now(datetime.timezone.utc), nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.datetime.now(datetime.timezone.utc), onupdate=lambda: datetime.datetime.now(datetime.timezone.utc), nullable=False)

    # Temporal access window (UTC hours, 0-23; None = unrestricted)
    access_start_hour = Column(Integer, nullable=True)
    access_end_hour = Column(Integer, nullable=True)
    access_days = Column(String(20), nullable=True)  # e.g., "0,1,2,3,4" for Mon-Fri

    # Relationships
    file = relationship("EncryptedFile", back_populates="permissions")
    recipient = relationship("User", foreign_keys=[recipient_id], back_populates="received_permissions")
    granted_by = relationship("User", foreign_keys=[granted_by_id])
    revoked_by = relationship("User", foreign_keys=[revoked_by_id])

    __table_args__ = (
        UniqueConstraint("file_id", "recipient_id", name="uq_file_recipient"),
    )
