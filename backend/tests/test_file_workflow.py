import pytest
import io
from backend.app.models.file import EncryptedFile
from backend.app.storage import get_storage_provider
from backend.tests.conftest import TestingSessionLocal


def test_complete_two_user_file_lifecycle_and_tamper_detection(client):
    """
    Complete Zero Trust End-to-End Workflow:
    1. Alice registers (obtains encryption and signing RSA keypairs)
    2. Bob registers (obtains encryption and signing RSA keypairs)
    3. Alice uploads sensitive file with AES-256-GCM and RSA-PSS signature
    4. Bob attempts unauthorized access -> DENIED (Zero Trust)
    5. Alice shares file with Bob using Bob's public key
    6. Bob downloads and decrypts file -> SHA-256 verified, signature verified
    7. Tamper verification:
       - Alter ciphertext in storage -> download rejected with tamper alert
       - Alter signature in database -> download rejected with signature invalid
    """
    # 1. Register Alice
    resp_a = client.post("/api/auth/register", json={
        "username": "alice",
        "email": "alice@vault.org",
        "password": "AliceSecurePass123!"
    })
    assert resp_a.status_code == 201
    alice_data = resp_a.json()
    alice_enc_priv = alice_data["generated_keypairs"]["encryption_private_key"]
    alice_sig_priv = alice_data["generated_keypairs"]["signing_private_key"]

    login_a = client.post("/api/auth/login", json={"username": "alice", "password": "AliceSecurePass123!"})
    alice_token = login_a.json()["access_token"]
    alice_headers = {"Authorization": f"Bearer {alice_token}"}

    # 2. Register Bob
    resp_b = client.post("/api/auth/register", json={
        "username": "bob",
        "email": "bob@vault.org",
        "password": "BobSecurePass123!"
    })
    assert resp_b.status_code == 201
    bob_data = resp_b.json()
    bob_enc_priv = bob_data["generated_keypairs"]["encryption_private_key"]

    login_b = client.post("/api/auth/login", json={"username": "bob", "password": "BobSecurePass123!"})
    bob_token = login_b.json()["access_token"]
    bob_headers = {"Authorization": f"Bearer {bob_token}"}

    # 3. Alice uploads a confidential file
    file_bytes = b"TOP SECRET: Zero Trust Cloud Storage Master Specification"
    file_upload_data = {
        "signing_private_key": alice_sig_priv
    }
    files = {
        "file": ("spec.txt", io.BytesIO(file_bytes), "text/plain")
    }

    upload_resp = client.post("/api/files/upload", data=file_upload_data, files=files, headers=alice_headers)
    assert upload_resp.status_code == 201
    file_meta = upload_resp.json()
    file_id = file_meta["id"]

    assert file_meta["original_filename"] == "spec.txt"
    assert file_meta["file_size"] == len(file_bytes)
    assert file_meta["is_owner"] is True
    assert len(file_meta["file_sha256_hash"]) == 64

    # Alice verifies file integrity
    verify_resp = client.get(f"/api/files/{file_id}/verify", headers=alice_headers)
    assert verify_resp.status_code == 200
    assert verify_resp.json()["overall_status"] == "VERIFIED_AUTHENTIC"
    assert verify_resp.json()["signature_valid"] is True

    # 4. Bob attempts unauthorized access before being granted permission
    bob_meta_resp = client.get(f"/api/files/{file_id}/metadata", headers=bob_headers)
    assert bob_meta_resp.status_code == 403
    assert "access denied" in bob_meta_resp.json()["detail"].lower()

    bob_download_unauthorized = client.post(
        f"/api/files/{file_id}/download",
        data={"private_key_pem": bob_enc_priv},
        headers=bob_headers
    )
    assert bob_download_unauthorized.status_code == 403

    # 5. Alice shares file with Bob (dynamic key wrapping)
    share_resp = client.post(
        f"/api/files/{file_id}/share",
        json={
            "recipient_identifier": "bob",
            "can_read": True,
            "can_download": True,
            "can_share": False
        },
        headers={
            **alice_headers,
            "X-Owner-Private-Key": alice_enc_priv
        }
    )
    assert share_resp.status_code == 201
    perm_data = share_resp.json()
    assert perm_data["recipient_username"] == "bob"
    assert perm_data["can_download"] is True
    assert perm_data["is_revoked"] is False

    # Check Bob's "shared-with-me" endpoint
    bob_shared = client.get("/api/files/shared-with-me", headers=bob_headers)
    assert bob_shared.status_code == 200
    assert len(bob_shared.json()) == 1
    assert bob_shared.json()[0]["id"] == file_id

    # 6. Bob downloads and decrypts file successfully
    bob_download_resp = client.post(
        f"/api/files/{file_id}/download",
        data={"private_key_pem": bob_enc_priv},
        headers=bob_headers
    )
    assert bob_download_resp.status_code == 200
    assert bob_download_resp.content == file_bytes
    assert bob_download_resp.headers.get("X-ZeroTrust-Verified") == "true"

    # 7. Tamper Detection Test 1: Corrupt ciphertext in storage
    storage_provider = get_storage_provider()
    storage_key = f"{file_id}.enc"
    valid_ciphertext = storage_provider.read(storage_key)

    # Tamper with storage
    tampered_bytes = bytearray(valid_ciphertext)
    tampered_bytes[0] ^= 0xEE
    storage_provider.save(storage_key, bytes(tampered_bytes))

    # Bob attempts download on tampered storage
    tampered_download = client.post(
        f"/api/files/{file_id}/download",
        data={"private_key_pem": bob_enc_priv},
        headers=bob_headers
    )
    assert tampered_download.status_code == 400
    assert "tampered" in tampered_download.json()["detail"].lower()

    # Restore valid ciphertext
    storage_provider.save(storage_key, valid_ciphertext)

    # 8. Tamper Detection Test 2: Invalidate manifest signature in database
    db = TestingSessionLocal()
    db_file = db.query(EncryptedFile).filter(EncryptedFile.id == file_id).first()
    db_file.manifest_signature = "TAMPERED_INVALID_BASE64_SIGNATURE"
    db.commit()
    db.close()

    sig_tampered_download = client.post(
        f"/api/files/{file_id}/download",
        data={"private_key_pem": bob_enc_priv},
        headers=bob_headers
    )
    assert sig_tampered_download.status_code == 400
    assert "signature is invalid" in sig_tampered_download.json()["detail"].lower()


def test_file_upload_policy_enforcement(client):
    # Register and login
    resp = client.post("/api/auth/register", json={
        "username": "charlie",
        "email": "charlie@vault.org",
        "password": "CharliePassword1!"
    })
    char_data = resp.json()
    char_sig_priv = char_data["generated_keypairs"]["signing_private_key"]
    login_resp = client.post("/api/auth/login", json={"username": "charlie", "password": "CharliePassword1!"})
    headers = {"Authorization": f"Bearer {login_resp.json()['access_token']}"}

    # Disallowed extension (e.g. .exe)
    disallowed_file = {
        "file": ("malware.exe", io.BytesIO(b"binary"), "application/x-msdownload")
    }
    resp_ext = client.post("/api/files/upload", data={"signing_private_key": char_sig_priv}, files=disallowed_file, headers=headers)
    assert resp_ext.status_code == 400
    assert "not permitted" in resp_ext.json()["detail"].lower()


def test_shared_recipient_can_decrypt_reshared_file_and_sees_sharer(client):
    def register_and_login(username):
        response = client.post("/api/auth/register", json={
            "username": username,
            "email": f"{username}@vault.org",
            "password": f"{username.title()}SecurePass123!"
        })
        assert response.status_code == 201
        generated_keys = response.json()["generated_keypairs"]
        login = client.post("/api/auth/login", json={
            "username": username,
            "password": f"{username.title()}SecurePass123!"
        })
        assert login.status_code == 200
        return {
            "headers": {"Authorization": f"******"},
            "encryption_private_key": generated_keys["encryption_private_key"],
            "signing_private_key": generated_keys["signing_private_key"]
        }

    owner = register_and_login("reshare_owner")
    gokul = register_and_login("gokul")
    kripa = register_and_login("kripa")
    for username, account in (
        ("reshare_owner", owner),
        ("gokul", gokul),
        ("kripa", kripa)
    ):
        login = client.post("/api/auth/login", json={
            "username": username,
            "password": f"{username.title()}SecurePass123!"
        })
        account["headers"] = {
            "Authorization": "Bearer " + login.json()["access_token"]
        }
    content = b"Encrypted file shared through an authorized recipient."
    upload = client.post(
        "/api/files/upload",
        data={"signing_private_key": owner["signing_private_key"]},
        files={"file": ("shared.txt", io.BytesIO(content), "text/plain")},
        headers=owner["headers"]
    )
    assert upload.status_code == 201, upload.text
    file_id = upload.json()["id"]

    first_share = client.post(
        f"/api/files/{file_id}/share",
        json={
            "recipient_identifier": "gokul",
            "can_read": True,
            "can_download": True,
            "can_share": True
        },
        headers={**owner["headers"], "X-Owner-Private-Key": owner["encryption_private_key"]}
    )
    assert first_share.status_code == 201

    second_share = client.post(
        f"/api/files/{file_id}/share",
        json={
            "recipient_identifier": "kripa",
            "can_read": True,
            "can_download": True,
            "can_share": False
        },
        headers={**gokul["headers"], "X-Owner-Private-Key": gokul["encryption_private_key"]}
    )
    assert second_share.status_code == 201

    kripa_shared_files = client.get("/api/files/shared-with-me", headers=kripa["headers"])
    assert kripa_shared_files.status_code == 200
    shared_file = next(item for item in kripa_shared_files.json() if item["id"] == file_id)
    assert shared_file["owner_username"] == "reshare_owner"
    assert shared_file["shared_by_username"] == "gokul"

    download = client.post(
        f"/api/files/{file_id}/download",
        data={"private_key_pem": kripa["encryption_private_key"]},
        headers=kripa["headers"]
    )
    assert download.status_code == 200
    assert download.content == content


def test_read_only_recipient_can_preview_but_cannot_download(client):
    def create_account(username, email, password):
        registered = client.post("/api/auth/register", json={
            "username": username, "email": email, "password": password
        })
        assert registered.status_code == 201, registered.text
        login = client.post("/api/auth/login", json={"username": username, "password": password})
        assert login.status_code == 200, login.text
        return {
            "headers": {"Authorization": f"Bearer {login.json()['access_token']}"},
            **registered.json()["generated_keypairs"],
        }

    owner = create_account("preview_owner", "preview_owner@example.com", "OwnerPassword123!")
    recipient = create_account("preview_recipient", "preview_recipient@example.com", "RecipientPassword123!")
    content = b"read-only preview payload"
    upload = client.post("/api/files/upload", data={
        "signing_private_key": owner["signing_private_key"]
    }, files={"file": ("preview.txt", io.BytesIO(content), "text/plain")}, headers=owner["headers"])
    assert upload.status_code == 201, upload.text
    file_id = upload.json()["id"]

    unauthorized = client.post(f"/api/files/{file_id}/preview", data={
        "private_key_pem": recipient["encryption_private_key"]
    }, headers=recipient["headers"])
    assert unauthorized.status_code == 403

    share = client.post(f"/api/files/{file_id}/share", json={
        "recipient_identifier": "preview_recipient", "can_read": True, "can_download": False, "can_share": False
    }, headers={**owner["headers"], "X-Owner-Private-Key": owner["encryption_private_key"]})
    assert share.status_code == 201, share.text

    preview = client.post(f"/api/files/{file_id}/preview", data={
        "private_key_pem": recipient["encryption_private_key"]
    }, headers=recipient["headers"])
    assert preview.status_code == 200
    assert preview.content == content

    download = client.post(f"/api/files/{file_id}/download", data={
        "private_key_pem": recipient["encryption_private_key"]
    }, headers=recipient["headers"])
    assert download.status_code == 403

    wrong_key = client.post(f"/api/files/{file_id}/preview", data={
        "private_key_pem": owner["encryption_private_key"]
    }, headers=recipient["headers"])
    assert wrong_key.status_code == 403
    assert "original matching private key backup" in wrong_key.json()["detail"].lower()
