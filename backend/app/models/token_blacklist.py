import datetime
from sqlalchemy import Column, Integer, String, DateTime
from backend.app.database import Base


class TokenBlacklist(Base):
    __tablename__ = "token_blacklist"

    id = Column(Integer, primary_key=True, index=True)
    jti = Column(String(64), unique=True, index=True, nullable=False)
    user_id = Column(Integer, nullable=False, index=True)
    revoked_at = Column(DateTime, default=lambda: datetime.datetime.now(datetime.timezone.utc), nullable=False)
    expires_at = Column(DateTime, nullable=False)
