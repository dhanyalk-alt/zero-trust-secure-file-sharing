import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr, Field, ConfigDict


class UserRegister(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    email: EmailStr
    password: str = Field(..., min_length=8)
    encryption_public_key: Optional[str] = None
    signing_public_key: Optional[str] = None


class UserLogin(BaseModel):
    username: str
    password: str


class KeyRegistration(BaseModel):
    encryption_public_key: str
    signing_public_key: str


class EncryptionKeyProof(BaseModel):
    challenge_token: str
    decrypted_challenge_b64: str


class UserOut(BaseModel):
    id: int
    username: str
    email: str
    role: str
    is_active: bool
    created_at: datetime.datetime
    has_encryption_key: bool
    has_signing_key: bool
    profile_pic: Optional[str] = None
    subscription_plan: str = "Free Tier"
    subscription_status: str = "FREE"
    subscription_expires_at: Optional[datetime.datetime] = None

    model_config = ConfigDict(from_attributes=True)


class ProfileUpdate(BaseModel):
    username: Optional[str] = Field(None, min_length=3, max_length=50)
    email: Optional[EmailStr] = None
    profile_pic: Optional[str] = None
    subscription_plan: Optional[str] = None


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=8)


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in_minutes: int
    user: UserOut


class KeyPairOut(BaseModel):
    private_key_pem: str
    public_key_pem: str

