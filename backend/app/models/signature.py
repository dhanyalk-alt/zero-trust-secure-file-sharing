import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from backend.app.database import Base


class DocumentSignature(Base):
    __tablename__ = "document_signatures"

    id = Column(Integer, primary_key=True, index=True)
    file_id = Column(String(36), ForeignKey("encrypted_files.id", ondelete="CASCADE"), nullable=False, index=True)
    signer_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    signer_username = Column(String(50), nullable=False)

    signature_b64 = Column(Text, nullable=False)  # RSA-PSS signature, base64 encoded
    signed_hash = Column(String(64), nullable=False)  # SHA-256 hash that was signed
    algorithm = Column(String(50), default="RSA-PSS-SHA256", nullable=False)
    is_valid = Column(String(10), default="VALID", nullable=False)  # VALID, INVALID

    signed_at = Column(DateTime, default=lambda: datetime.datetime.now(datetime.timezone.utc), nullable=False)

    file = relationship("EncryptedFile")
    signer = relationship("User", foreign_keys=[signer_id])
