import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text
from sqlalchemy.orm import relationship
from backend.app.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    email = Column(String(100), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(20), default="USER", nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)

    # Cryptographic public keys registered by the user
    encryption_public_key = Column(Text, nullable=True)
    signing_public_key = Column(Text, nullable=True)

    # Profile & Subscription
    profile_pic = Column(Text, nullable=True)
    subscription_plan = Column(String(50), default="Free Tier", nullable=False)
    subscription_status = Column(String(20), default="FREE", nullable=False)  # FREE, ACTIVE, EXPIRED
    subscription_expires_at = Column(DateTime, nullable=True)

    # Brute-force & Lockout tracking
    failed_login_count = Column(Integer, default=0, nullable=False)
    lockout_until = Column(DateTime, nullable=True)

    created_at = Column(DateTime, default=lambda: datetime.datetime.now(datetime.timezone.utc), nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.datetime.now(datetime.timezone.utc), onupdate=lambda: datetime.datetime.now(datetime.timezone.utc), nullable=False)

    # Relationships with explicit foreign_keys specification
    owned_files = relationship("EncryptedFile", back_populates="owner", cascade="all, delete-orphan")
    received_permissions = relationship(
        "FilePermission",
        foreign_keys="[FilePermission.recipient_id]",
        back_populates="recipient",
        cascade="all, delete-orphan"
    )
    audit_logs = relationship("AuditLog", back_populates="user")
