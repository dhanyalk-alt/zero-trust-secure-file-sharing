from typing import List
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session

from backend.app.database import get_db
from backend.app.models.user import User
from backend.app.schemas.auth import UserOut
from backend.app.security.auth import get_current_user

router = APIRouter(prefix="/api/users", tags=["Users"])


@router.get("/search", response_model=List[UserOut])
def search_users(
    q: str = Query("", min_length=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    query = db.query(User).filter(
        User.id != current_user.id,
        User.is_active == True
    )

    if q.strip():
        search_filter = f"%{q.strip()}%"
        query = query.filter(
            (User.username.ilike(search_filter)) | (User.email.ilike(search_filter))
        )

    users = query.limit(20).all()

    return [
        UserOut(
            id=u.id,
            username=u.username,
            email=u.email,
            role=u.role,
            is_active=u.is_active,
            created_at=u.created_at,
            has_encryption_key=bool(u.encryption_public_key),
            has_signing_key=bool(u.signing_public_key),
            profile_pic=u.profile_pic,
            subscription_plan=u.subscription_plan or "Free Tier",
            subscription_status=u.subscription_status or "FREE",
            subscription_expires_at=u.subscription_expires_at
        )
        for u in users
    ]


@router.get("/{user_id}/public-keys")
def get_user_public_keys(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(User.id == user_id, User.is_active == True).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    return {
        "user_id": user.id,
        "username": user.username,
        "encryption_public_key": user.encryption_public_key,
        "signing_public_key": user.signing_public_key
    }
