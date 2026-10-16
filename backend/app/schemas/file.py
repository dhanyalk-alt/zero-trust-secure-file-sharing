import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict


class FileMetadataOut(BaseModel):
    id: str
    owner_id: int
    owner_username: Optional[str] = None
    shared_by_username: Optional[str] = None
    original_filename: str
    file_size: int
    mime_type: str
    file_sha256_hash: str
    aes_gcm_nonce: str
    aes_gcm_tag: str
    canonical_manifest_json: str
    manifest_signature: str
    created_at: datetime.datetime
    expires_at: Optional[datetime.datetime] = None
    is_expired: bool = False
    can_read: bool = True
    can_download: bool = True
    can_share: bool = False
    is_one_time: bool = False
    is_owner: bool = False
    category_id: Optional[int] = None
    category_name: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class FileVerifyOut(BaseModel):
    file_id: str
    original_filename: str
    file_sha256_hash: str
    signature_valid: bool
    hash_valid: bool
    aes_gcm_authenticated: bool
    sender_public_key_present: bool
    overall_status: str  # "VERIFIED_AUTHENTIC", "INTEGRITY_COMPROMISED", "SIGNATURE_INVALID"
    details: str


class SetFileExpiryRequest(BaseModel):
    expires_at: Optional[datetime.datetime] = None
    clear_expiry: bool = False
