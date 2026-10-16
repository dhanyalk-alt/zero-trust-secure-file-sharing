import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator


class CategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Category name cannot be empty.")
        if v.lower() in ("all", "all files", "uncategorized"):
            raise ValueError("Category name is reserved.")
        return v


class CategoryUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=100)

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Category name cannot be empty.")
        if v.lower() in ("all", "all files", "uncategorized"):
            raise ValueError("Category name is reserved.")
        return v


class CategoryOut(BaseModel):
    id: int
    user_id: int
    name: str
    file_count: int = 0
    created_at: datetime.datetime

    model_config = ConfigDict(from_attributes=True)


class MoveFileCategoryRequest(BaseModel):
    category_id: Optional[int] = None  # None indicates Uncategorized
