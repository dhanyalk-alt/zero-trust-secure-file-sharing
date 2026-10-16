import datetime
from typing import Optional, List, Any
from pydantic import BaseModel, ConfigDict, Field


class CreateOrderRequest(BaseModel):
    plan_type: str = Field(..., description="'MONTHLY' or 'YEARLY'")


class OrderOut(BaseModel):
    order_id: str
    amount: int
    currency: str = "INR"
    key_id: str
    plan_type: str
    plan_name: str


class VerifyPaymentRequest(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


class PlanInfo(BaseModel):
    id: str
    name: str
    price: int
    currency: str
    interval: str
    features: List[str]
    description: str


class SubscriptionStatusOut(BaseModel):
    current_plan: str
    subscription_status: str  # FREE, ACTIVE, EXPIRED
    subscription_expires_at: Optional[datetime.datetime] = None
    personal_files_count: int
    max_free_files: int = 15
    is_limit_reached: bool
    razorpay_configured: bool
    key_id: Optional[str] = None
    plans: List[PlanInfo]

    model_config = ConfigDict(from_attributes=True)
