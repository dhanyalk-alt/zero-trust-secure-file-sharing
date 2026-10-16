import base64
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives import hashes
from cryptography.exceptions import InvalidSignature
from backend.app.crypto.rsa_key import load_private_key, load_public_key


def sign_manifest_rsa_pss(manifest_bytes: bytes, private_key_pem: str) -> str:
    """
    Digitally sign canonical manifest bytes using RSA-PSS with SHA-256 and MGF1.
    Returns base64-encoded signature string.
    """
    private_key = load_private_key(private_key_pem)
    signature = private_key.sign(
        manifest_bytes,
        padding.PSS(
            mgf=padding.MGF1(hashes.SHA256()),
            salt_length=padding.PSS.MAX_LENGTH
        ),
        hashes.SHA256()
    )
    return base64.b64encode(signature).decode("utf-8")


def verify_manifest_rsa_pss(manifest_bytes: bytes, signature_b64: str, public_key_pem: str) -> bool:
    """
    Verifies the RSA-PSS digital signature of a manifest against the sender's public key.
    Returns True if valid, False if invalid or tampered.
    """
    try:
        public_key = load_public_key(public_key_pem)
        signature = base64.b64decode(signature_b64.encode("utf-8"))
        public_key.verify(
            signature,
            manifest_bytes,
            padding.PSS(
                mgf=padding.MGF1(hashes.SHA256()),
                salt_length=padding.PSS.MAX_LENGTH
            ),
            hashes.SHA256()
        )
        return True
    except (InvalidSignature, Exception):
        return False
