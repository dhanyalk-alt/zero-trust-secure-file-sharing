import pytest
import base64
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives import hashes
from backend.app.crypto.rsa_key import generate_rsa_keypair, load_private_key


def test_user_registration_and_keypair_provisioning(client):
    """Test user registration automatically provisions RSA dual keypairs if not supplied."""
    payload = {
        "username": "alice",
        "email": "alice@zerotrust.com",
        "password": "Password123!"
    }
    resp = client.post("/api/auth/register", json=payload)
    assert resp.status_code == 201
    data = resp.json()

    assert data["user"]["username"] == "alice"
    assert data["user"]["email"] == "alice@zerotrust.com"
    assert data["user"]["has_encryption_key"] is True
    assert data["user"]["has_signing_key"] is True
    assert "generated_keypairs" in data
    assert "encryption_private_key" in data["generated_keypairs"]
    assert "signing_private_key" in data["generated_keypairs"]


def test_duplicate_registration_fails(client):
    payload = {
        "username": "alice",
        "email": "alice@zerotrust.com",
        "password": "Password123!"
    }
    resp1 = client.post("/api/auth/register", json=payload)
    assert resp1.status_code == 201

    resp2 = client.post("/api/auth/register", json=payload)
    assert resp2.status_code == 400
    assert "already registered" in resp2.json()["detail"]


def test_login_and_logout_blacklisting(client):
    # Register
    reg_payload = {"username": "bob", "email": "bob@zerotrust.com", "password": "SecurePassword99!"}
    client.post("/api/auth/register", json=reg_payload)

    # Login
    login_resp = client.post("/api/auth/login", json={"username": "bob", "password": "SecurePassword99!"})
    assert login_resp.status_code == 200
    token = login_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Access protected route
    me_resp = client.get("/api/auth/me", headers=headers)
    assert me_resp.status_code == 200
    assert me_resp.json()["username"] == "bob"

    # Logout
    logout_resp = client.post("/api/auth/logout", headers=headers)
    assert logout_resp.status_code == 200

    # Subsequent access with same token must be rejected (Blacklist enforcement)
    me_after_logout = client.get("/api/auth/me", headers=headers)
    assert me_after_logout.status_code == 401
    assert "revoked" in me_after_logout.json()["detail"].lower()


def test_brute_force_lockout_enforcement(client):
    reg_payload = {"username": "target_user", "email": "target@zerotrust.com", "password": "CorrectPassword123!"}
    reg_resp = client.post("/api/auth/register", json=reg_payload)
    assert reg_resp.status_code == 201

    # Attempt 5 incorrect logins
    for attempt in range(5):
        resp = client.post("/api/auth/login", json={"username": "target_user", "password": "WrongPassword!"})
        if attempt < 4:
            assert resp.status_code == 401
        else:
            # 5th attempt triggers lockout
            assert resp.status_code == 403
            assert "locked" in resp.json()["detail"].lower()

    # Even correct password is now blocked by lockout
    correct_attempt = client.post("/api/auth/login", json={"username": "target_user", "password": "CorrectPassword123!"})
    assert correct_attempt.status_code == 403
    assert "locked" in correct_attempt.json()["detail"].lower()


def test_encryption_key_challenge_accepts_matching_key_and_rejects_invalid_key(client):
    registered = client.post("/api/auth/register", json={
        "username": "keyproof_user", "email": "keyproof@example.com", "password": "SecurePassword123!"
    }).json()
    login = client.post("/api/auth/login", json={"username": "keyproof_user", "password": "SecurePassword123!"})
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    challenge = client.post("/api/auth/keys/encryption-challenge", headers=headers)
    assert challenge.status_code == 200

    private_key = load_private_key(registered["generated_keypairs"]["encryption_private_key"])
    encrypted_challenge = base64.b64decode(challenge.json()["encrypted_challenge_b64"])
    nonce = private_key.decrypt(encrypted_challenge, padding.OAEP(
        mgf=padding.MGF1(algorithm=hashes.SHA256()), algorithm=hashes.SHA256(), label=None
    ))
    verified = client.post("/api/auth/keys/verify-encryption", headers=headers, json={
        "challenge_token": challenge.json()["challenge_token"],
        "decrypted_challenge_b64": base64.b64encode(nonce).decode("ascii"),
    })
    assert verified.status_code == 200

    invalid = client.post("/api/auth/keys/verify-encryption", headers=headers, json={
        "challenge_token": challenge.json()["challenge_token"],
        "decrypted_challenge_b64": base64.b64encode(b"wrong private key").decode("ascii"),
    })
    assert invalid.status_code == 403


def test_registered_encryption_key_cannot_be_replaced_silently(client):
    created = client.post("/api/auth/register", json={
        "username": "immutable_key_user", "email": "immutable@example.com", "password": "SecurePassword123!"
    }).json()
    login = client.post("/api/auth/login", json={"username": "immutable_key_user", "password": "SecurePassword123!"})
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    _, replacement_encryption_public = generate_rsa_keypair()
    _, replacement_signing_public = generate_rsa_keypair()
    response = client.post("/api/auth/keys", headers=headers, json={
        "encryption_public_key": replacement_encryption_public,
        "signing_public_key": replacement_signing_public,
    })
    assert response.status_code == 409
    assert "existing files" in response.json()["detail"].lower()

    proof = client.post("/api/auth/keys/encryption-challenge", headers=headers).json()
    private_key = load_private_key(created["generated_keypairs"]["encryption_private_key"])
    nonce = private_key.decrypt(base64.b64decode(proof["encrypted_challenge_b64"]), padding.OAEP(
        mgf=padding.MGF1(algorithm=hashes.SHA256()), algorithm=hashes.SHA256(), label=None
    ))
    assert client.post("/api/auth/keys/verify-encryption", headers=headers, json={
        "challenge_token": proof["challenge_token"],
        "decrypted_challenge_b64": base64.b64encode(nonce).decode("ascii"),
    }).status_code == 200
