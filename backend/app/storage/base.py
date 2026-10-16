from abc import ABC, abstractmethod


class StorageProvider(ABC):
    """Abstract Base Class for Encrypted Object Storage Providers."""

    @abstractmethod
    def save(self, storage_key: str, data: bytes) -> str:
        """Saves encrypted byte payload to storage. Returns canonical storage path/URI."""
        pass

    @abstractmethod
    def read(self, storage_key: str) -> bytes:
        """Reads encrypted byte payload from storage."""
        pass

    @abstractmethod
    def delete(self, storage_key: str) -> bool:
        """Deletes encrypted byte payload from storage."""
        pass

    @abstractmethod
    def exists(self, storage_key: str) -> bool:
        """Checks if encrypted file exists in storage."""
        pass
