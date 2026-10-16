import datetime
from typing import Optional, Literal
from pydantic import BaseModel, ConfigDict, Field, field_validator
from backend.app.schemas.file import FileMetadataOut


class OrganizationCreate(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    description: Optional[str] = Field(default=None, max_length=500)

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        value = value.strip()
        if len(value) < 2:
            raise ValueError("Organization name must contain at least 2 non-space characters.")
        return value

    @field_validator("description")
    @classmethod
    def normalize_description(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        value = value.strip()
        return value or None


class OrganizationMemberCreate(BaseModel):
    user_identifier: str = Field(min_length=1, max_length=100)
    role: Literal["member", "admin"] = "member"
    can_upload: bool = False

    @field_validator("user_identifier")
    @classmethod
    def normalize_identifier(cls, value: str) -> str:
        return value.strip()


class OrganizationOut(BaseModel):
    id: int
    name: str
    description: Optional[str]
    owner_id: int
    role: str
    can_upload: bool
    created_at: datetime.datetime
    member_count: int = 0
    file_count: int = 0

    model_config = ConfigDict(from_attributes=True)


class OrganizationMemberOut(BaseModel):
    user_id: int
    username: str
    email: str
    role: str
    can_upload: bool
    joined_at: datetime.datetime


class OrganizationFileOut(FileMetadataOut):
    organization_id: int
    uploader_username: str
    can_read: bool = True
