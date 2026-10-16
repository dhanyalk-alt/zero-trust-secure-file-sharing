from backend.app.config import settings
from backend.app.storage.base import StorageProvider
from backend.app.storage.local import LocalStorageProvider


def get_storage_provider() -> StorageProvider:
    provider_type = settings.STORAGE_PROVIDER.lower().strip()
    if provider_type == "s3":
        from backend.app.storage.s3 import S3StorageProvider
        return S3StorageProvider()
    elif provider_type == "local":
        return LocalStorageProvider(settings.LOCAL_STORAGE_DIR)
    else:
        raise ValueError(f"Unsupported STORAGE_PROVIDER: '{provider_type}'. Must be 'local' or 's3'.")
