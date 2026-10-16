from backend.app.storage.base import StorageProvider
from backend.app.config import settings


class S3StorageProvider(StorageProvider):
    """
    Cloud Object Storage Provider for Amazon S3 / MinIO / S3-compatible endpoints.
    Requires S3_BUCKET_NAME, S3_ACCESS_KEY, S3_SECRET_KEY, and optional S3_ENDPOINT_URL.
    """

    def __init__(self):
        if not settings.S3_BUCKET_NAME or not settings.S3_ACCESS_KEY or not settings.S3_SECRET_KEY:
            raise ValueError(
                "S3StorageProvider requires S3_BUCKET_NAME, S3_ACCESS_KEY, and S3_SECRET_KEY to be set in environment."
            )
        try:
            import boto3
            self.s3_client = boto3.client(
                "s3",
                endpoint_url=settings.S3_ENDPOINT_URL or None,
                aws_access_key_id=settings.S3_ACCESS_KEY,
                aws_secret_access_key=settings.S3_SECRET_KEY,
                region_name=settings.S3_REGION or "us-east-1"
            )
            self.bucket_name = settings.S3_BUCKET_NAME
        except ImportError:
            raise ImportError("boto3 package is required for S3StorageProvider. Install with `pip install boto3`.")

    def save(self, storage_key: str, data: bytes) -> str:
        self.s3_client.put_object(
            Bucket=self.bucket_name,
            Key=storage_key,
            Body=data,
            ServerSideEncryption="AES256"
        )
        return f"s3://{self.bucket_name}/{storage_key}"

    def read(self, storage_key: str) -> bytes:
        response = self.s3_client.get_object(Bucket=self.bucket_name, Key=storage_key)
        return response["Body"].read()

    def delete(self, storage_key: str) -> bool:
        self.s3_client.delete_object(Bucket=self.bucket_name, Key=storage_key)
        return True

    def exists(self, storage_key: str) -> bool:
        try:
            self.s3_client.head_object(Bucket=self.bucket_name, Key=storage_key)
            return True
        except Exception:
            return False
