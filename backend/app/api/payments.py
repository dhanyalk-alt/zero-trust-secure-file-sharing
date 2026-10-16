import datetime
import hashlib
import hmac
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from sqlalchemy import select
from backend.app.config import settings
from backend.app.database import get_db
from backend.app.models.user import User
from backend.app.models.file import EncryptedFile
from backend.app.models.organization import OrganizationFile
from backend.app.models.subscription import SubscriptionOrder
from backend.app.schemas.subscription import (
    CreateOrderRequest,
    OrderOut,
    VerifyPaymentRequest,
    SubscriptionStatusOut,
    PlanInfo
)
from backend.app.security.auth import get_current_user
from backend.app.security.audit_logger import log_audit_event

router = APIRouter(prefix="/api/subscription", tags=["Subscription & Payments"])

PLANS = [
    PlanInfo(
        id="MONTHLY",
        name="Pro Monthly",
        price=60,
        currency="₹",
        interval="month",
        features=[
            "Unlimited encrypted file uploads",
            "Zero Trust Integrity & RSA verification",
            "Blockchain-audited event tracking",
            "Temporal & custom access permissions",
            "RSA-PSS document e-signatures"
        ],
        description="Ideal for short-term projects and individual workflows."
    ),
    PlanInfo(
        id="YEARLY",
        name="Pro Yearly",
        price=699,
        currency="₹",
        interval="year",
        features=[
            "Unlimited encrypted file uploads",
            "Zero Trust Integrity & RSA verification",
            "Blockchain-audited event tracking",
            "Temporal & custom access permissions",
            "RSA-PSS document e-signatures",
            "Best value with uninterrupted yearly access"
        ],
        description="Comprehensive year-round Zero Trust security with maximum savings."
    )
]


def get_user_personal_file_count(db: Session, user_id: int) -> int:
    org_file_subquery = select(OrganizationFile.file_id)
    return db.query(EncryptedFile).filter(
        EncryptedFile.owner_id == user_id,
        EncryptedFile.is_deleted == False,
        ~EncryptedFile.id.in_(org_file_subquery)
    ).count()


@router.get("/status", response_model=SubscriptionStatusOut)
def get_subscription_status(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get current subscription details, personal file usage, and available plans.
    """
    now_utc = datetime.datetime.now(datetime.timezone.utc)
    sub_status = current_user.subscription_status or "FREE"

    # Check expiry
    if sub_status == "ACTIVE" and current_user.subscription_expires_at:
        exp = current_user.subscription_expires_at
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=datetime.timezone.utc)
        if exp < now_utc:
            sub_status = "EXPIRED"
            if current_user.subscription_status != "EXPIRED":
                current_user.subscription_status = "EXPIRED"
                db.commit()

    personal_count = get_user_personal_file_count(db, current_user.id)
    is_limit_reached = (sub_status != "ACTIVE") and (personal_count >= 15)
    razorpay_ready = bool(settings.RAZORPAY_KEY_ID and settings.RAZORPAY_KEY_SECRET)

    return SubscriptionStatusOut(
        current_plan=current_user.subscription_plan or "Free Tier",
        subscription_status=sub_status,
        subscription_expires_at=current_user.subscription_expires_at,
        personal_files_count=personal_count,
        max_free_files=15,
        is_limit_reached=is_limit_reached,
        razorpay_configured=razorpay_ready,
        key_id=settings.RAZORPAY_KEY_ID if razorpay_ready else None,
        plans=PLANS
    )


@router.post("/create-order", response_model=OrderOut)
def create_subscription_order(
    req: CreateOrderRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Create a Razorpay order for the selected subscription plan.
    Requires RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.
    """
    plan_type = req.plan_type.upper()
    if plan_type not in ("MONTHLY", "YEARLY"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid plan type. Must be 'MONTHLY' or 'YEARLY'."
        )

    if not settings.RAZORPAY_KEY_ID or not settings.RAZORPAY_KEY_SECRET:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Payment gateway is not configured. Please set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in the environment (.env)."
        )

    if plan_type == "MONTHLY":
        amount_paise = 6000  # ₹60.00
        plan_name = "Pro Monthly"
    else:
        amount_paise = 69900  # ₹699.00
        plan_name = "Pro Yearly"

    ip_addr = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")

    try:
        import razorpay
        client = razorpay.Client(auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET))
        order_payload = {
            "amount": amount_paise,
            "currency": "INR",
            "receipt": f"rcpt_u{current_user.id}_{int(datetime.datetime.now(datetime.timezone.utc).timestamp())}",
            "notes": {
                "user_id": str(current_user.id),
                "username": current_user.username,
                "plan_type": plan_type
            }
        }
        order_data = client.order.create(data=order_payload)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to initiate order with Razorpay: {str(exc)}"
        )

    order = SubscriptionOrder(
        user_id=current_user.id,
        order_id=order_data["id"],
        plan_type=plan_type,
        amount_in_paise=amount_paise,
        currency="INR",
        status="CREATED"
    )
    db.add(order)
    db.commit()
    db.refresh(order)

    log_audit_event(
        db=db,
        action="SUBSCRIPTION_ORDER_CREATED",
        status="SUCCESS",
        user_id=current_user.id,
        username=current_user.username,
        resource_id=order.order_id,
        resource_name=plan_name,
        details=f"Created {plan_type} subscription order for ₹{amount_paise // 100}.",
        ip_address=ip_addr,
        user_agent=user_agent
    )

    return OrderOut(
        order_id=order.order_id,
        amount=amount_paise,
        currency="INR",
        key_id=settings.RAZORPAY_KEY_ID,
        plan_type=plan_type,
        plan_name=plan_name
    )


@router.post("/verify-payment")
def verify_payment(
    req: VerifyPaymentRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Verify payment signature cryptographically via HMAC-SHA256 and activate subscription.
    Never accepts unverified payments.
    """
    if not settings.RAZORPAY_KEY_SECRET:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Payment gateway secret is not configured."
        )

    order = db.query(SubscriptionOrder).filter(
        SubscriptionOrder.order_id == req.razorpay_order_id,
        SubscriptionOrder.user_id == current_user.id
    ).first()

    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Subscription order not found."
        )

    if order.status == "PAID":
        return {
            "success": True,
            "message": "Payment has already been verified and processed.",
            "subscription_plan": current_user.subscription_plan,
            "subscription_status": current_user.subscription_status
        }

    ip_addr = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")

    # Cryptographic HMAC-SHA256 verification
    message = f"{req.razorpay_order_id}|{req.razorpay_payment_id}"
    expected_signature = hmac.new(
        settings.RAZORPAY_KEY_SECRET.encode("utf-8"),
        message.encode("utf-8"),
        hashlib.sha256
    ).hexdigest()

    is_valid = hmac.compare_digest(expected_signature, req.razorpay_signature)

    if not is_valid:
        order.status = "FAILED"
        db.commit()
        log_audit_event(
            db=db,
            action="PAYMENT_VERIFICATION_FAILED",
            status="DENIED",
            user_id=current_user.id,
            username=current_user.username,
            resource_id=order.order_id,
            resource_name=order.plan_type,
            details="Cryptographic signature mismatch for Razorpay payment.",
            ip_address=ip_addr,
            user_agent=user_agent
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Payment verification failed: Invalid cryptographic signature."
        )

    now_utc = datetime.datetime.now(datetime.timezone.utc)
    order.status = "PAID"
    order.payment_id = req.razorpay_payment_id
    order.paid_at = now_utc

    # Activate subscription
    if order.plan_type == "MONTHLY":
        current_user.subscription_plan = "Pro Monthly"
        current_user.subscription_expires_at = now_utc + datetime.timedelta(days=30)
    else:
        current_user.subscription_plan = "Pro Yearly"
        current_user.subscription_expires_at = now_utc + datetime.timedelta(days=365)

    current_user.subscription_status = "ACTIVE"
    db.commit()
    db.refresh(current_user)

    log_audit_event(
        db=db,
        action="SUBSCRIPTION_ACTIVATED",
        status="SUCCESS",
        user_id=current_user.id,
        username=current_user.username,
        resource_id=order.order_id,
        resource_name=current_user.subscription_plan,
        details=f"Payment verified ({order.payment_id}). Subscription activated until {current_user.subscription_expires_at.isoformat()}.",
        ip_address=ip_addr,
        user_agent=user_agent
    )

    return {
        "success": True,
        "message": f"Payment verified successfully! Your subscription to {current_user.subscription_plan} is now active.",
        "subscription_plan": current_user.subscription_plan,
        "subscription_status": current_user.subscription_status,
        "subscription_expires_at": current_user.subscription_expires_at.isoformat()
    }
