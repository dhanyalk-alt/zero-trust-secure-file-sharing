import datetime
import base64
import hashlib
import hmac
import json
import secrets
import time
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session

from backend.app.database import get_db
from backend.app.config import settings
from backend.app.models.user import User
from backend.app.models.token_blacklist import TokenBlacklist
from backend.app.schemas.auth import UserRegister, UserLogin, UserOut, Token, KeyRegistration, EncryptionKeyProof, ProfileUpdate, PasswordChange
from backend.app.security.auth import (
    get_password_hash,
    verify_password,
    create_access_token,
    get_current_user,
    decode_token,
    oauth2_scheme
)
from backend.app.security.audit_logger import log_audit_event
from backend.app.crypto.rsa_key import generate_rsa_keypair, load_public_key
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives import hashes

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def _decode_b64url(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def user_to_user_out(user: User) -> UserOut:
    now_utc = datetime.datetime.now(datetime.timezone.utc)
    sub_status = user.subscription_status or "FREE"
    if sub_status == "ACTIVE" and user.subscription_expires_at:
        exp = user.subscription_expires_at
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=datetime.timezone.utc)
        if exp < now_utc:
            sub_status = "EXPIRED"

    return UserOut(
        id=user.id,
        username=user.username,
        email=user.email,
        role=user.role,
        is_active=user.is_active,
        created_at=user.created_at,
        has_encryption_key=bool(user.encryption_public_key),
        has_signing_key=bool(user.signing_public_key),
        profile_pic=user.profile_pic,
        subscription_plan=user.subscription_plan or "Free Tier",
        subscription_status=sub_status,
        subscription_expires_at=user.subscription_expires_at
    )


@router.post("/register", status_code=status.HTTP_201_CREATED)
def register(user_data: UserRegister, request: Request, db: Session = Depends(get_db)):
    # Check if username or email exists
    existing_user = db.query(User).filter(
        (User.username == user_data.username) | (User.email == user_data.email)
    ).first()

    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username or email is already registered."
        )

    # Provision each missing identity independently. A supplied encryption public
    # key must never be silently replaced just because the signing key is absent.
    generated_keys = None
    enc_pub = user_data.encryption_public_key
    sig_pub = user_data.signing_public_key
    if not enc_pub:
        enc_priv, enc_pub = generate_rsa_keypair(key_size=2048)
        generated_keys = generated_keys or {}
        generated_keys.update({"encryption_private_key": enc_priv, "encryption_public_key": enc_pub})
    if not sig_pub:
        sig_priv, sig_pub = generate_rsa_keypair(key_size=2048)
        generated_keys = generated_keys or {}
        generated_keys.update({"signing_private_key": sig_priv, "signing_public_key": sig_pub})

    hashed_password = get_password_hash(user_data.password)

    new_user = User(
        username=user_data.username,
        email=user_data.email,
        password_hash=hashed_password,
        role="USER",
        is_active=True,
        encryption_public_key=enc_pub,
        signing_public_key=sig_pub
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    log_audit_event(
        db=db,
        action="USER_REGISTRATION",
        status="SUCCESS",
        user_id=new_user.id,
        username=new_user.username,
        details="User account registered successfully.",
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent")
    )

    response_data = {
        "user": {
            "id": new_user.id,
            "username": new_user.username,
            "email": new_user.email,
            "role": new_user.role,
            "is_active": new_user.is_active,
            "created_at": new_user.created_at,
            "has_encryption_key": bool(new_user.encryption_public_key),
            "has_signing_key": bool(new_user.signing_public_key)
        }
    }

    if generated_keys:
        response_data["generated_keypairs"] = generated_keys

    return response_data


@router.post("/login", response_model=Token)
def login(login_data: UserLogin, request: Request, db: Session = Depends(get_db)):
    ip_addr = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")

    user = db.query(User).filter(User.username == login_data.username).first()

    now_utc = datetime.datetime.now(datetime.timezone.utc)

    if not user:
        log_audit_event(
            db=db,
            action="LOGIN_ATTEMPT",
            status="FAILED",
            username=login_data.username,
            details="Login failed: user does not exist.",
            ip_address=ip_addr,
            user_agent=user_agent
        )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password.")

    if not user.is_active:
        log_audit_event(
            db=db,
            action="DEACTIVATED_USER_LOGIN_ATTEMPT",
            status="DENIED",
            user_id=user.id,
            username=user.username,
            details="Login blocked: user account is deactivated.",
            ip_address=ip_addr,
            user_agent=user_agent
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account has been deactivated. Please contact an administrator."
        )

    # Check lockout
    if user.lockout_until:
        lockout_time = user.lockout_until
        if lockout_time.tzinfo is None:
            lockout_time = lockout_time.replace(tzinfo=datetime.timezone.utc)
        if lockout_time > now_utc:
            log_audit_event(
                db=db,
                action="LOCKED_ACCOUNT_LOGIN_ATTEMPT",
                status="DENIED",
                user_id=user.id,
                username=user.username,
                details=f"Login blocked due to active security lockout until {lockout_time.isoformat()}.",
                ip_address=ip_addr,
                user_agent=user_agent
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Account locked due to consecutive failed attempts. Try again after {lockout_time.strftime('%H:%M:%S UTC')}."
            )

    # Verify password
    if not verify_password(login_data.password, user.password_hash):
        user.failed_login_count += 1
        if user.failed_login_count >= settings.MAX_FAILED_LOGINS_BEFORE_LOCKOUT:
            user.lockout_until = now_utc + datetime.timedelta(minutes=settings.LOCKOUT_DURATION_MINUTES)
            db.commit()
            log_audit_event(
                db=db,
                action="ACCOUNT_LOCKED",
                status="SUSPICIOUS",
                user_id=user.id,
                username=user.username,
                details=f"Account locked for {settings.LOCKOUT_DURATION_MINUTES} minutes after {user.failed_login_count} failed attempts.",
                ip_address=ip_addr,
                user_agent=user_agent
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Maximum failed attempts exceeded. Account is locked for {settings.LOCKOUT_DURATION_MINUTES} minutes."
            )

        db.commit()
        log_audit_event(
            db=db,
            action="LOGIN_ATTEMPT",
            status="FAILED",
            user_id=user.id,
            username=user.username,
            details=f"Invalid password. Failed attempt {user.failed_login_count}/{settings.MAX_FAILED_LOGINS_BEFORE_LOCKOUT}.",
            ip_address=ip_addr,
            user_agent=user_agent
        )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password.")

    # Reset lockout counters on success
    user.failed_login_count = 0
    user.lockout_until = None
    db.commit()

    # Generate JWT
    token_str = create_access_token(data={"sub": str(user.id), "username": user.username, "role": user.role})

    log_audit_event(
        db=db,
        action="LOGIN_SUCCESS",
        status="SUCCESS",
        user_id=user.id,
        username=user.username,
        details="User authenticated successfully.",
        ip_address=ip_addr,
        user_agent=user_agent
    )

    user_out = user_to_user_out(user)

    return Token(
        access_token=token_str,
        token_type="bearer",
        expires_in_minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES,
        user=user_out
    )


@router.post("/logout")
def logout(
    request: Request,
    token: str = Depends(oauth2_scheme),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    try:
        payload = decode_token(token)
        jti = payload.get("jti")
        exp_ts = payload.get("exp")

        if jti and exp_ts:
            exp_dt = datetime.datetime.fromtimestamp(exp_ts, tz=datetime.timezone.utc)
            blacklist_entry = TokenBlacklist(
                jti=jti,
                user_id=current_user.id,
                expires_at=exp_dt
            )
            db.add(blacklist_entry)
            db.commit()
    except Exception:
        pass

    log_audit_event(
        db=db,
        action="LOGOUT_SUCCESS",
        status="SUCCESS",
        user_id=current_user.id,
        username=current_user.username,
        details="Session token invalidated.",
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent")
    )

    return {"message": "Logged out successfully. Token invalidated."}


@router.get("/me", response_model=UserOut)
def get_me(current_user: User = Depends(get_current_user)):
    return user_to_user_out(current_user)


@router.patch("/profile", response_model=UserOut)
def update_profile(
    profile_data: ProfileUpdate,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if profile_data.username and profile_data.username != current_user.username:
        existing = db.query(User).filter(User.username == profile_data.username, User.id != current_user.id).first()
        if existing:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username is already taken.")
        current_user.username = profile_data.username

    if profile_data.email and profile_data.email != current_user.email:
        existing = db.query(User).filter(User.email == profile_data.email, User.id != current_user.id).first()
        if existing:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email is already registered.")
        current_user.email = profile_data.email

    if profile_data.profile_pic is not None:
        current_user.profile_pic = profile_data.profile_pic

    if profile_data.subscription_plan:
        current_user.subscription_plan = profile_data.subscription_plan

    db.commit()
    db.refresh(current_user)

    log_audit_event(
        db=db,
        action="PROFILE_UPDATED",
        status="SUCCESS",
        user_id=current_user.id,
        username=current_user.username,
        details="User profile information updated.",
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent")
    )

    return user_to_user_out(current_user)


@router.post("/change-password")
def change_password(
    pass_data: PasswordChange,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if not verify_password(pass_data.current_password, current_user.password_hash):
        log_audit_event(
            db=db,
            action="PASSWORD_CHANGE_FAILED",
            status="DENIED",
            user_id=current_user.id,
            username=current_user.username,
            details="Password change rejected: current password verification failed.",
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent")
        )
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect.")

    current_user.password_hash = get_password_hash(pass_data.new_password)
    db.commit()

    log_audit_event(
        db=db,
        action="PASSWORD_CHANGED",
        status="SUCCESS",
        user_id=current_user.id,
        username=current_user.username,
        details="Password changed successfully.",
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent")
    )

    return {"message": "Password updated successfully."}



@router.post("/keys")
def register_keys(
    keys: KeyRegistration,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # A key replacement makes all existing AES keys wrapped to the old public
    # key undecryptable. Keep the registered identity immutable here; recovery
    # must use the original backup, or a dedicated verified rewrap operation.
    if current_user.encryption_public_key and keys.encryption_public_key != current_user.encryption_public_key:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Encryption public key is already established. Replacing it would make existing files inaccessible; restore the matching private key backup instead."
        )
    if current_user.signing_public_key and keys.signing_public_key != current_user.signing_public_key:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Signing public key is already established. Key replacement requires a verified key migration."
        )

    current_user.encryption_public_key = keys.encryption_public_key
    current_user.signing_public_key = keys.signing_public_key
    db.commit()

    log_audit_event(
        db=db,
        action="KEYS_REGISTERED",
        status="SUCCESS",
        user_id=current_user.id,
        username=current_user.username,
        details="User registered/updated public encryption and signing keys.",
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent")
    )

    return {"message": "Public keys registered successfully."}


@router.post("/keys/encryption-challenge")
def create_encryption_key_challenge(current_user: User = Depends(get_current_user)):
    """Issue a short-lived proof that the client holds this account's encryption key.

    Only the public key is used on the server. The corresponding private key is
    used locally by the browser to decrypt the challenge and is never uploaded.
    """
    if not current_user.encryption_public_key:
        raise HTTPException(status_code=400, detail="No encryption public key is registered for this account.")
    nonce = secrets.token_bytes(32)
    issued_at = int(time.time())
    payload = {
        "user_id": current_user.id,
        "issued_at": issued_at,
        "nonce_hash": hashlib.sha256(nonce).hexdigest(),
    }
    payload_bytes = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    payload_part = _b64url(payload_bytes)
    mac = hmac.new(settings.SECRET_KEY.encode("utf-8"), payload_part.encode("ascii"), hashlib.sha256).digest()
    try:
        public_key = load_public_key(current_user.encryption_public_key)
        encrypted_nonce = public_key.encrypt(
            nonce,
            padding.OAEP(mgf=padding.MGF1(algorithm=hashes.SHA256()), algorithm=hashes.SHA256(), label=None),
        )
    except Exception:
        raise HTTPException(status_code=409, detail="The registered encryption public key is invalid. Restore a matching keypair before continuing.")
    return {"challenge_token": f"{payload_part}.{_b64url(mac)}", "encrypted_challenge_b64": base64.b64encode(encrypted_nonce).decode("ascii")}


@router.post("/keys/verify-encryption")
def verify_encryption_key_proof(
    proof: EncryptionKeyProof,
    current_user: User = Depends(get_current_user),
):
    try:
        payload_part, mac_part = proof.challenge_token.split(".", 1)
        expected_mac = hmac.new(settings.SECRET_KEY.encode("utf-8"), payload_part.encode("ascii"), hashlib.sha256).digest()
        if not hmac.compare_digest(expected_mac, _decode_b64url(mac_part)):
            raise ValueError("invalid challenge signature")
        payload = json.loads(_decode_b64url(payload_part))
        decrypted_nonce = base64.b64decode(proof.decrypted_challenge_b64, validate=True)
        valid = (
            payload.get("user_id") == current_user.id
            and 0 <= int(time.time()) - int(payload.get("issued_at", 0)) <= 300
            and hmac.compare_digest(hashlib.sha256(decrypted_nonce).hexdigest(), payload.get("nonce_hash", ""))
        )
    except Exception:
        valid = False
    if not valid:
        raise HTTPException(status_code=403, detail="This private encryption key does not match the public key registered to the signed-in account.")
    return {"verified": True}
