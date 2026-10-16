import os
import base64
from typing import Tuple
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.exceptions import InvalidTag


def generate_aes_key() -> bytes:
    """Generate a cryptographically secure 256-bit (32 bytes) AES key."""
    return AESGCM.generate_key(bit_length=256)


def generate_nonce() -> bytes:
    """Generate a standard 96-bit (12 bytes) nonce for AES-256-GCM."""
    return os.urandom(12)


def encrypt_aes_gcm(plaintext: bytes, key: bytes, nonce: bytes, associated_data: bytes = None) -> Tuple[bytes, bytes]:
    """
    Encrypts plaintext using AES-256-GCM.
    Returns (ciphertext, tag).
    AESGCM in cryptography produces ciphertext + 16-byte tag.
    """
    aesgcm = AESGCM(key)
    ciphertext_and_tag = aesgcm.encrypt(nonce, plaintext, associated_data)
    ciphertext = ciphertext_and_tag[:-16]
    tag = ciphertext_and_tag[-16:]
    return ciphertext, tag


def decrypt_aes_gcm(ciphertext: bytes, tag: bytes, key: bytes, nonce: bytes, associated_data: bytes = None) -> bytes:
    """
    Decrypts and authenticates ciphertext using AES-256-GCM.
    Raises InvalidTag if ciphertext or tag was tampered with.
    """
    aesgcm = AESGCM(key)
    ciphertext_and_tag = ciphertext + tag
    try:
        return aesgcm.decrypt(nonce, ciphertext_and_tag, associated_data)
    except InvalidTag as e:
        raise ValueError("AES-GCM authentication failed: data or tag has been tampered with or key is invalid.") from e


def bytes_to_b64(data: bytes) -> str:
    return base64.b64encode(data).decode("utf-8")


def b64_to_bytes(data_b64: str) -> bytes:
    return base64.b64decode(data_b64.encode("utf-8"))
