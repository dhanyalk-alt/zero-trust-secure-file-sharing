import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict


class ShareFileRequest(BaseModel):
    recipient_identifier: str  # username or email
    can_read: bool = True
    can_download: bool = True
    can_share: bool = False
    is_one_time: bool = False


class UpdatePermissionRequest(BaseModel):
    can_read: bool = True
    can_download: bool = True
    can_share: bool = False
    is_one_time: Optional[bool] = None


class TemporalWindowRequest(BaseModel):
    access_start_hour: Optional[int] = None  # 0-23
    access_end_hour: Optional[int] = None    # 0-23
    access_days: Optional[str] = None        # e.g. "0,1,2,3,4"


class PermissionOut(BaseModel):
    id: int
    file_id: str
    recipient_id: int
    recipient_username: str
    recipient_email: str
    can_read: bool
    can_download: bool
    can_share: bool
    is_one_time: bool = False
    access_count: int = 0
    is_revoked: bool
    revoked_at: Optional[datetime.datetime] = None
    revoked_by_username: Optional[str] = None
    granted_at: datetime.datetime
    access_start_hour: Optional[int] = None
    access_end_hour: Optional[int] = None
    access_days: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)
