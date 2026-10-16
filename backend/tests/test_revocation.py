import pytest
import io
from backend.app.models.permission import FilePermission
from backend.tests.conftest import TestingSessionLocal


def test_immediate_revocation_and_granular_permissions(client):
    """
    Test Zero Trust Immediate Revocation:
    - Grant access to Bob
    - Verify Bob can download
    - Revoke Bob's access
    - Verify key is erased from DB and subsequent access is immediately denied (403)
    - Verify audit log contains revocation and denied attempt
    """
    # 1. Register Alice & Bob
    resp_a = client.post("/api/auth/register", json={
        "username": "owner_alice",
        "email": "owner@vault.org",
        "password": "Password123!"
    })
    alice_data = resp_a.json()
    alice_enc_priv = alice_data["generated_keypairs"]["encryption_private_key"]
    alice_sig_priv = alice_data["generated_keypairs"]["signing_private_key"]

    resp_b = client.post("/api/auth/register", json={
        "username": "recipient_bob",
        "email": "recipient@vault.org",
        "password": "Password123!"
    })
    bob_data = resp_b.json()
    bob_id = bob_data["user"]["id"]
    bob_enc_priv = bob_data["generated_keypairs"]["encryption_private_key"]

    token_a = client.post("/api/auth/login", json={"username": "owner_alice", "password": "Password123!"}).json()["access_token"]
    headers_a = {"Authorization": f"Bearer {token_a}"}

    token_b = client.post("/api/auth/login", json={"username": "recipient_bob", "password": "Password123!"}).json()["access_token"]
    headers_b = {"Authorization": f"Bearer {token_b}"}

    # 2. Upload file
    upload_resp = client.post(
        "/api/files/upload",
        data={"signing_private_key": alice_sig_priv},
        files={"file": ("project_plan.pdf", io.BytesIO(b"Confidential Project Plan"), "application/pdf")},
        headers=headers_a
    )
    file_id = upload_resp.json()["id"]

    # 3. Share with Bob
    share_resp = client.post(
        f"/api/files/{file_id}/share",
        json={"recipient_identifier": "recipient_bob", "can_read": True, "can_download": True, "can_share": False},
        headers={**headers_a, "X-Owner-Private-Key": alice_enc_priv}
    )
    assert share_resp.status_code == 201

    # 4. Verify Bob can download before revocation
    bob_dl_before = client.post(
        f"/api/files/{file_id}/download",
        data={"private_key_pem": bob_enc_priv},
        headers=headers_b
    )
    assert bob_dl_before.status_code == 200
    assert bob_dl_before.content == b"Confidential Project Plan"

    # 5. Alice REVOKES Bob's access
    revoke_resp = client.post(f"/api/files/{file_id}/permissions/{bob_id}/revoke", headers=headers_a)
    assert revoke_resp.status_code == 200

    # Verify in DB: key is zeroed/cleared and is_revoked is True
    db = TestingSessionLocal()
    perm = db.query(FilePermission).filter(FilePermission.file_id == file_id, FilePermission.recipient_id == bob_id).first()
    assert perm.is_revoked is True
    assert perm.encrypted_aes_key == ""
    db.close()

    # 6. Bob tries to download IMMEDIATELY after revocation -> Must be 403 Forbidden
    bob_dl_after = client.post(
        f"/api/files/{file_id}/download",
        data={"private_key_pem": bob_enc_priv},
        headers=headers_b
    )
    assert bob_dl_after.status_code == 403
    assert "revoked" in bob_dl_after.json()["detail"].lower()

    # Bob tries to read metadata -> Must also be 403 Forbidden
    bob_meta_after = client.get(f"/api/files/{file_id}/metadata", headers=headers_b)
    assert bob_meta_after.status_code == 403
    assert "revoked" in bob_meta_after.json()["detail"].lower()

    # 7. Check Audit Logs: Should have recorded ACCESS_REVOKED and REVOKED_ACCESS_ATTEMPT
    audit_resp = client.get("/api/audit/logs", headers=headers_a)
    assert audit_resp.status_code == 200
    actions = [log["action"] for log in audit_resp.json()]
    assert "ACCESS_REVOKED" in actions
    assert "REVOKED_ACCESS_ATTEMPT" in actions


def test_permission_modification_deny_download_preserve_read(client):
    """Test modifying permissions: retain read rights while revoking download rights."""
    # Register Alice & Bob
    resp_a = client.post("/api/auth/register", json={"username": "alice_perm", "email": "a_perm@v.org", "password": "Password123!"})
    alice_enc_priv = resp_a.json()["generated_keypairs"]["encryption_private_key"]
    alice_sig_priv = resp_a.json()["generated_keypairs"]["signing_private_key"]

    resp_b = client.post("/api/auth/register", json={"username": "bob_perm", "email": "b_perm@v.org", "password": "Password123!"})
    bob_id = resp_b.json()["user"]["id"]
    bob_enc_priv = resp_b.json()["generated_keypairs"]["encryption_private_key"]

    token_a = client.post("/api/auth/login", json={"username": "alice_perm", "password": "Password123!"}).json()["access_token"]
    headers_a = {"Authorization": f"Bearer {token_a}"}

    token_b = client.post("/api/auth/login", json={"username": "bob_perm", "password": "Password123!"}).json()["access_token"]
    headers_b = {"Authorization": f"Bearer {token_b}"}

    # Upload & share
    upload_resp = client.post(
        "/api/files/upload",
        data={"signing_private_key": alice_sig_priv},
        files={"file": ("memo.txt", io.BytesIO(b"Company Memo"), "text/plain")},
        headers=headers_a
    )
    file_id = upload_resp.json()["id"]

    client.post(
        f"/api/files/{file_id}/share",
        json={"recipient_identifier": "bob_perm", "can_read": True, "can_download": True, "can_share": False},
        headers={**headers_a, "X-Owner-Private-Key": alice_enc_priv}
    )

    # Modify permissions: Disable download
    patch_resp = client.patch(
        f"/api/files/{file_id}/permissions/{bob_id}",
        json={"can_read": True, "can_download": False, "can_share": False},
        headers=headers_a
    )
    assert patch_resp.status_code == 200
    assert patch_resp.json()["can_download"] is False
    assert patch_resp.json()["can_read"] is True

    # Bob should still be able to read metadata
    meta = client.get(f"/api/files/{file_id}/metadata", headers=headers_b)
    assert meta.status_code == 200
    assert meta.json()["can_download"] is False

    # But Bob downloading should be rejected
    dl_resp = client.post(
        f"/api/files/{file_id}/download",
        data={"private_key_pem": bob_enc_priv},
        headers=headers_b
    )
    assert dl_resp.status_code == 403
    assert "download" in dl_resp.json()["detail"].lower()
