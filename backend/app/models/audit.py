import uuid
import datetime
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from backend.app.database import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    correlation_id = Column(String(36), default=lambda: str(uuid.uuid4()), index=True, nullable=False)

    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    username = Column(String(50), nullable=True)

    action = Column(String(100), nullable=False, index=True)
    status = Column(String(20), nullable=False, index=True)  # SUCCESS, DENIED, FAILED, TAMPERED, SUSPICIOUS

    resource_id = Column(String(100), nullable=True, index=True)  # e.g. file_id or permission_id
    resource_name = Column(String(255), nullable=True)

    ip_address = Column(String(50), nullable=True)
    user_agent = Column(String(255), nullable=True)

    # Contextual details (NEVER storing plaintext keys, passwords, or tokens)
    details = Column(Text, nullable=True)

    timestamp = Column(DateTime, default=lambda: datetime.datetime.now(datetime.timezone.utc), nullable=False, index=True)

    # Blockchain-style cryptographic integrity chain
    prev_hash = Column(String(64), nullable=True)
    event_hash = Column(String(64), nullable=True)

    # Relationship
    user = relationship("User", back_populates="audit_logs")
