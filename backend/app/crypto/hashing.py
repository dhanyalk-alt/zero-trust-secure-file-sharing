import hashlib
import json
from typing import Dict, Any


def compute_sha256(data: bytes) -> str:
    """Computes SHA-256 hex digest of data."""
    return hashlib.sha256(data).hexdigest()


def build_canonical_manifest(
    file_sha256: str,
    original_filename: str,
    file_size: int,
    owner_id: int,
    created_at_iso: str,
    mime_type: str = "application/octet-stream"
) -> str:
    """
    Constructs a deterministic, sorted canonical JSON string representing the file manifest.
    Divergent ordering or formatting is eliminated using sort_keys=True and compact separators.
    """
    manifest_dict: Dict[str, Any] = {
        "created_at": created_at_iso,
        "file_sha256": file_sha256,
        "file_size": file_size,
        "mime_type": mime_type,
        "original_filename": original_filename,
        "owner_id": owner_id,
        "version": "1.0"
    }
    return json.dumps(manifest_dict, sort_keys=True, separators=(',', ':'))


def verify_file_hash(data: bytes, expected_hash: str) -> bool:
    """Verifies that the SHA-256 of data strictly matches expected_hash."""
    actual_hash = compute_sha256(data)
    # Using secrets-style constant-time comparison to protect against timing attacks
    import hmac
    return hmac.compare_digest(actual_hash.lower(), expected_hash.lower())
