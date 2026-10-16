import os
import pathlib
from backend.app.storage.base import StorageProvider


class LocalStorageProvider(StorageProvider):
    def __init__(self, base_dir: str):
        self.base_path = pathlib.Path(base_dir).resolve()
        self.base_path.mkdir(parents=True, exist_ok=True)

    def _safe_resolve(self, storage_key: str) -> pathlib.Path:
        """
        Sanitizes storage_key and verifies it does not escape the configured base directory.
        Protects against Directory Traversal attacks (e.g. ../../../etc/passwd).
        """
        # Strip leading slashes and extract pure name/relative path
        clean_key = os.path.normpath(storage_key).lstrip("\\/").replace("..", "")
        resolved = (self.base_path / clean_key).resolve()

        if not str(resolved).startswith(str(self.base_path)):
            raise ValueError(f"Path traversal detected for storage key: {storage_key}")

        return resolved

    def save(self, storage_key: str, data: bytes) -> str:
        target_path = self._safe_resolve(storage_key)
        target_path.parent.mkdir(parents=True, exist_ok=True)
        with open(target_path, "wb") as f:
            f.write(data)
        return str(target_path)

    def read(self, storage_key: str) -> bytes:
        target_path = self._safe_resolve(storage_key)
        if not target_path.is_file():
            raise FileNotFoundError(f"Stored encrypted file not found: {storage_key}")
        with open(target_path, "rb") as f:
            return f.read()

    def delete(self, storage_key: str) -> bool:
        target_path = self._safe_resolve(storage_key)
        if target_path.is_file():
            target_path.unlink()
            return True
        return False

    def exists(self, storage_key: str) -> bool:
        target_path = self._safe_resolve(storage_key)
        return target_path.is_file()
