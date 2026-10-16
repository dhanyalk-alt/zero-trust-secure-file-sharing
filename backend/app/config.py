import os
from typing import List, Set
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field


class Settings(BaseSettings):
    ENVIRONMENT: str = "development"
    APP_NAME: str = "ZeroTrust File Vault"
    APP_HOST: str = "0.0.0.0"
    APP_PORT: int = 8001
    DEBUG: bool = False

    DATABASE_URL: str = "sqlite:///./zerotrust_storage.db"

    # Cryptographic & Auth
    SECRET_KEY: str = Field(..., min_length=32)
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 120

    # Upload constraints
    MAX_UPLOAD_SIZE_BYTES: int = 104857600  # 100 MB default
    ALLOWED_EXTENSIONS: str = "pdf,docx,txt,png,jpg,jpeg,csv,json,zip,xlsx,pptx,py,md"

    # Storage
    STORAGE_PROVIDER: str = "local"
    LOCAL_STORAGE_DIR: str = "./storage_data"

    # Optional S3 settings
    S3_BUCKET_NAME: str = ""
    S3_ENDPOINT_URL: str = ""
    S3_ACCESS_KEY: str = ""
    S3_SECRET_KEY: str = ""
    S3_REGION: str = "us-east-1"

    # Zero Trust & Risk Controls
    MAX_FAILED_LOGINS_BEFORE_LOCKOUT: int = 5
    LOCKOUT_DURATION_MINUTES: int = 15
    DOWNLOAD_RATE_LIMIT_PER_MINUTE: int = 20
    SUSPICIOUS_ACCESS_THRESHOLD_PER_HOUR: int = 10

    # CORS
    CORS_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000"

    # Razorpay Payment Gateway
    RAZORPAY_KEY_ID: str = ""
    RAZORPAY_KEY_SECRET: str = ""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

    @property
    def cors_origins_list(self) -> List[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]

    @property
    def allowed_extensions_set(self) -> Set[str]:
        return {ext.strip().lower().lstrip(".") for ext in self.ALLOWED_EXTENSIONS.split(",") if ext.strip()}


settings = Settings()
