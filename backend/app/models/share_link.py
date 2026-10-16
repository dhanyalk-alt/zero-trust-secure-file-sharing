import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from backend.app.database import Base


class SecureShareLink(Base):
    __tablename__ = "secure_share_links"

    id = Column(Integer, primary_key=True, index=True)
    file_id = Column(String(36), ForeignKey("encrypted_files.id", ondelete="CASCADE"), nullable=False, index=True)
    created_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    token = Column(String(64), unique=True, nullable=False, index=True)  # random secure hex token
    wrapped_key_fernet = Column(Text, nullable=False)  # AES key wrapped with Fernet(PBKDF2(token))
    expires_at = Column(DateTime, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    max_uses = Column(Integer, nullable=True)  # None = unlimited
    use_count = Column(Integer, default=0, nullable=False)
    label = Column(String(100), nullable=True)

    created_at = Column(DateTime, default=lambda: datetime.datetime.now(datetime.timezone.utc), nullable=False)

    file = relationship("EncryptedFile")
    created_by = relationship("User", foreign_keys=[created_by_id])
