import pytest
from backend.app.crypto.aes_gcm import (
    generate_aes_key,
    generate_nonce,
    encrypt_aes_gcm,
    decrypt_aes_gcm
)
from backend.app.crypto.rsa_key import (
    generate_rsa_keypair,
    wrap_aes_key_oaep,
    unwrap_aes_key_oaep
)
from backend.app.crypto.signatures import (
    sign_manifest_rsa_pss,
    verify_manifest_rsa_pss
)
from backend.app.crypto.hashing import (
    compute_sha256,
    build_canonical_manifest,
    verify_file_hash
)


def test_aes_gcm_encrypt_decrypt_valid():
    """Verify AES-256-GCM encryption and decryption roundtrip."""
    key = generate_aes_key()
    nonce = generate_nonce()
    plaintext = b"Sensitive Zero-Trust Cloud Document Content 123456"

    ciphertext, tag = encrypt_aes_gcm(plaintext, key, nonce)

    assert ciphertext != plaintext
    assert len(tag) == 16
    assert len(nonce) == 12

    recovered = decrypt_aes_gcm(ciphertext, tag, key, nonce)
    assert recovered == plaintext


def test_aes_gcm_ciphertext_tamper_fails():
    """Verify that any modification to ciphertext causes AES-GCM authentication failure."""
    key = generate_aes_key()
    nonce = generate_nonce()
    plaintext = b"Sensitive Zero-Trust Cloud Document Content 123456"

    ciphertext, tag = encrypt_aes_gcm(plaintext, key, nonce)

    # Tamper with single byte of ciphertext
    tampered_ciphertext = bytearray(ciphertext)
    tampered_ciphertext[0] ^= 0xFF

    with pytest.raises(ValueError, match="AES-GCM authentication failed"):
        decrypt_aes_gcm(bytes(tampered_ciphertext), tag, key, nonce)


def test_aes_gcm_tag_tamper_fails():
    """Verify that any modification to the GCM authentication tag causes failure."""
    key = generate_aes_key()
    nonce = generate_nonce()
    plaintext = b"Important document"

    ciphertext, tag = encrypt_aes_gcm(plaintext, key, nonce)

    # Tamper with tag
    tampered_tag = bytearray(tag)
    tampered_tag[0] ^= 0x01

    with pytest.raises(ValueError, match="AES-GCM authentication failed"):
        decrypt_aes_gcm(ciphertext, bytes(tampered_tag), key, nonce)


def test_rsa_oaep_key_wrapping():
    """Verify RSA-OAEP key wrapping and unwrapping."""
    priv_pem, pub_pem = generate_rsa_keypair(key_size=2048)
    aes_key = generate_aes_key()

    wrapped_key = wrap_aes_key_oaep(aes_key, pub_pem)
    assert wrapped_key != aes_key

    unwrapped_key = unwrap_aes_key_oaep(wrapped_key, priv_pem)
    assert unwrapped_key == aes_key


def test_rsa_oaep_wrong_private_key_fails():
    """Verify unwrapping with an unauthorized/different private key fails."""
    _, pub_pem_alice = generate_rsa_keypair(key_size=2048)
    priv_pem_eve, _ = generate_rsa_keypair(key_size=2048)
    aes_key = generate_aes_key()

    wrapped_key = wrap_aes_key_oaep(aes_key, pub_pem_alice)

    with pytest.raises(ValueError, match="Failed to unwrap AES key"):
        unwrap_aes_key_oaep(wrapped_key, priv_pem_eve)


def test_rsa_pss_digital_signatures():
    """Verify RSA-PSS signature creation and verification."""
    priv_pem, pub_pem = generate_rsa_keypair(key_size=2048)
    manifest = b'{"file_sha256":"abc123","filename":"report.pdf"}'

    sig_b64 = sign_manifest_rsa_pss(manifest, priv_pem)
    assert sig_b64 is not None

    # Valid verification
    assert verify_manifest_rsa_pss(manifest, sig_b64, pub_pem) is True

    # Tampered manifest should fail verification
    tampered_manifest = b'{"file_sha256":"abc123","filename":"tampered.pdf"}'
    assert verify_manifest_rsa_pss(tampered_manifest, sig_b64, pub_pem) is False


def test_sha256_canonical_manifest_and_hashing():
    """Verify deterministic canonical manifest representation and SHA-256 verification."""
    data = b"Hello, Zero Trust!"
    expected_hash = compute_sha256(data)

    assert len(expected_hash) == 64
    assert verify_file_hash(data, expected_hash) is True
    assert verify_file_hash(data + b"tamper", expected_hash) is False

    manifest_str = build_canonical_manifest(
        file_sha256=expected_hash,
        original_filename="secret.txt",
        file_size=len(data),
        owner_id=1,
        created_at_iso="2026-10-15T12:00:00Z"
    )
    # Ensure keys are strictly sorted in JSON
    import json
    loaded = json.loads(manifest_str)
    assert list(loaded.keys()) == sorted(list(loaded.keys()))
