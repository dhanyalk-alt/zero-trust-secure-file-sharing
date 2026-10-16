import datetime
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from backend.app.database import Base


class FileCategory(Base):
    __tablename__ = "file_categories"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.datetime.now(datetime.timezone.utc), nullable=False)

    __table_args__ = (
        UniqueConstraint("user_id", "name", name="uq_user_category_name"),
    )

    user = relationship("User", backref="file_categories")
    files = relationship("EncryptedFile", back_populates="category")
