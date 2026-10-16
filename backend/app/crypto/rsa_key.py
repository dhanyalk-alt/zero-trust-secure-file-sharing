from typing import Tuple, Optional
from cryptography.hazmat.primitives.asymmetric import rsa, padding
from cryptography.hazmat.primitives import hashes, serialization


def generate_rsa_keypair(key_size: int = 2048) -> Tuple[str, str]:
    """
    Generate an RSA key pair (default 2048-bit).
    Returns (private_key_pem, public_key_pem) as strings.
    """
    private_key = rsa.generate_private_key(
        public_exponent=65537,
        key_size=key_size
    )

    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption()
    ).decode("utf-8")

    public_pem = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo
    ).decode("utf-8")

    return private_pem, public_pem


def load_public_key(public_pem: str):
    return serialization.load_pem_public_key(public_pem.encode("utf-8"))


def load_private_key(private_pem: str, password: Optional[str] = None):
    pwd_bytes = password.encode("utf-8") if password else None
    return serialization.load_pem_private_key(private_pem.encode("utf-8"), password=pwd_bytes)


def wrap_aes_key_oaep(aes_key: bytes, public_key_pem: str) -> bytes:
    """
    Wrap AES-256 key using recipient's RSA public key with OAEP padding and SHA-256.
    """
    public_key = load_public_key(public_key_pem)
    wrapped = public_key.encrypt(
        aes_key,
        padding.OAEP(
            mgf=padding.MGF1(algorithm=hashes.SHA256()),
            algorithm=hashes.SHA256(),
            label=None
        )
    )
    return wrapped


def unwrap_aes_key_oaep(wrapped_key: bytes, private_key_pem: str, password: Optional[str] = None) -> bytes:
    """
    Unwrap AES-256 key using recipient's RSA private key with OAEP padding and SHA-256.
    """
    private_key = load_private_key(private_key_pem, password)
    try:
        aes_key = private_key.decrypt(
            wrapped_key,
            padding.OAEP(
                mgf=padding.MGF1(algorithm=hashes.SHA256()),
                algorithm=hashes.SHA256(),
                label=None
            )
        )
        return aes_key
    except Exception as e:
        raise ValueError("Failed to unwrap AES key: recipient private key does not match or ciphertext corrupted.") from e
