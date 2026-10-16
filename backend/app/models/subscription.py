import datetime
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from backend.app.database import Base


class SubscriptionOrder(Base):
    __tablename__ = "subscription_orders"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    order_id = Column(String(100), unique=True, nullable=False, index=True)  # Razorpay order_id
    plan_type = Column(String(20), nullable=False)  # "MONTHLY" (₹60) or "YEARLY" (₹699)
    amount_in_paise = Column(Integer, nullable=False)  # 6000 or 69900
    currency = Column(String(10), default="INR", nullable=False)
    status = Column(String(20), default="CREATED", nullable=False)  # CREATED, PAID, FAILED
    payment_id = Column(String(100), nullable=True)  # Razorpay payment_id
    created_at = Column(DateTime, default=lambda: datetime.datetime.now(datetime.timezone.utc), nullable=False)
    paid_at = Column(DateTime, nullable=True)

    user = relationship("User")
