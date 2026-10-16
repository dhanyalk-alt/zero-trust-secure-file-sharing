import io
import datetime
from backend.app.models.user import User
from backend.app.models.file import EncryptedFile
from backend.app.models.audit import AuditLog
from backend.tests.conftest import TestingSessionLocal


def test_blockchain_audit_chain_verification(client):
    """Test that audit log entries are cryptographically chained and verifiable."""
    # Register and login a user to generate audit records
    resp = client.post("/api/auth/register", json={
        "username": "chain_user",
        "email": "chain_user@vault.org",
        "password": "Password123!"
    })
    assert resp.status_code == 201

    login_resp = client.post("/api/auth/login", json={
        "username": "chain_user",
        "password": "Password123!"
    })
    token = login_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Verify chain
    verify_resp = client.get("/api/audit/chain-verify", headers=headers)
    assert verify_resp.status_code == 200
    data = verify_resp.json()
    assert "total" in data
    assert "verified" in data
    assert "chain_valid" in data
    assert data["chain_valid"] is True


def test_temporal_access_windows(client):
    """Test setting a temporal access window and enforcing UTC hour restrictions."""
    # Register owner Alice and recipient Bob
    resp_a = client.post("/api/auth/register", json={
        "username": "alice_temporal",
        "email": "alice_temp@vault.org",
        "password": "Password123!"
    })
    alice_data = resp_a.json()
    alice_sig = alice_data["generated_keypairs"]["signing_private_key"]
    alice_enc = alice_data["generated_keypairs"]["encryption_private_key"]

    resp_b = client.post("/api/auth/register", json={
        "username": "bob_temporal",
        "email": "bob_temp@vault.org",
        "password": "Password123!"
    })
    bob_data = resp_b.json()
    bob_enc = bob_data["generated_keypairs"]["encryption_private_key"]

    token_a = client.post("/api/auth/login", json={"username": "alice_temporal", "password": "Password123!"}).json()["access_token"]
    headers_a = {"Authorization": f"Bearer {token_a}"}

    token_b = client.post("/api/auth/login", json={"username": "bob_temporal", "password": "Password123!"}).json()["access_token"]
    headers_b = {"Authorization": f"Bearer {token_b}"}

    # Alice uploads a file
    up_resp = client.post(
        "/api/files/upload",
        data={"signing_private_key": alice_sig},
        files={"file": ("temporal_doc.txt", io.BytesIO(b"Confidential temporal file content"), "text/plain")},
        headers=headers_a
    )
    assert up_resp.status_code == 201
    file_id = up_resp.json()["id"]

    # Alice shares file with Bob
    share_resp = client.post(
        f"/api/files/{file_id}/share",
        json={"recipient_identifier": "bob_temporal", "can_read": True, "can_download": True},
        headers={**headers_a, "X-Owner-Private-Key": alice_enc}
    )
    assert share_resp.status_code == 201
    bob_id = share_resp.json()["recipient_id"]

    # Alice sets temporal window to a window that excludes the current hour
    current_utc_hour = datetime.datetime.now(datetime.timezone.utc).hour
    # Pick a non-overlapping 1-hour window far from current hour
    excluded_start = (current_utc_hour + 5) % 24
    excluded_end = (current_utc_hour + 6) % 24

    window_resp = client.patch(
        f"/api/files/{file_id}/permissions/{bob_id}/window",
        json={"access_start_hour": excluded_start, "access_end_hour": excluded_end, "access_days": "0,1,2,3,4,5,6"},
        headers=headers_a
    )
    assert window_resp.status_code == 200
    assert window_resp.json()["access_start_hour"] == excluded_start

    # Bob attempts to download outside his window -> 403 Forbidden
    dl_resp = client.post(
        f"/api/files/{file_id}/download",
        data={"private_key_pem": bob_enc},
        headers=headers_b
    )
    assert dl_resp.status_code == 403
    assert "time window" in dl_resp.json()["detail"].lower()

    # Alice clears the temporal window (24/7 access)
    clear_resp = client.patch(
        f"/api/files/{file_id}/permissions/{bob_id}/window",
        json={"access_start_hour": None, "access_end_hour": None, "access_days": None},
        headers=headers_a
    )
    assert clear_resp.status_code == 200
    assert clear_resp.json()["access_start_hour"] is None

    # Bob downloads successfully now
    dl_allowed = client.post(
        f"/api/files/{file_id}/download",
        data={"private_key_pem": bob_enc},
        headers=headers_b
    )
    assert dl_allowed.status_code == 200
    assert dl_allowed.content == b"Confidential temporal file content"


def test_file_analytics(client):
    """Test file analytics summary and detailed telemetry endpoints."""
    # Register and upload
    resp = client.post("/api/auth/register", json={
        "username": "analytics_user",
        "email": "analytics@vault.org",
        "password": "Password123!"
    })
    user_data = resp.json()
    user_sig = user_data["generated_keypairs"]["signing_private_key"]

    token = client.post("/api/auth/login", json={"username": "analytics_user", "password": "Password123!"}).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    up_resp = client.post(
        "/api/files/upload",
        data={"signing_private_key": user_sig},
        files={"file": ("analytics_target.txt", io.BytesIO(b"Data for telemetry analysis"), "text/plain")},
        headers=headers
    )
    file_id = up_resp.json()["id"]

    # Test summary endpoint
    summary_resp = client.get("/api/files/analytics/summary", headers=headers)
    assert summary_resp.status_code == 200
    summary = summary_resp.json()
    assert summary["total_files"] >= 1
    assert any(f["file_id"] == file_id for f in summary["files"])

    # Test per-file analytics endpoint
    detail_resp = client.get(f"/api/files/{file_id}/analytics", headers=headers)
    assert detail_resp.status_code == 200
    detail = detail_resp.json()
    assert detail["file_id"] == file_id
    assert "by_action" in detail
    assert "daily_activity" in detail
    assert "top_accessors" in detail


def test_rsa_pss_document_signatures(client):
    """Test creating, listing, and verifying an RSA-PSS document digital signature."""
    resp = client.post("/api/auth/register", json={
        "username": "signer_user",
        "email": "signer@vault.org",
        "password": "Password123!"
    })
    user_data = resp.json()
    user_sig = user_data["generated_keypairs"]["signing_private_key"]

    token = client.post("/api/auth/login", json={"username": "signer_user", "password": "Password123!"}).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Upload file
    up_resp = client.post(
        "/api/files/upload",
        data={"signing_private_key": user_sig},
        files={"file": ("contract.pdf", io.BytesIO(b"Legally binding agreement text"), "application/pdf")},
        headers=headers
    )
    file_id = up_resp.json()["id"]

    # Sign file
    sign_resp = client.post(
        f"/api/files/{file_id}/sign",
        json={"signing_private_key": user_sig},
        headers=headers
    )
    assert sign_resp.status_code == 201
    sig_data = sign_resp.json()
    assert sig_data["signer_username"] == "signer_user"
    assert sig_data["algorithm"] == "RSA-PSS-SHA256"
    sig_id = sig_data["id"]

    # List signatures
    list_resp = client.get(f"/api/files/{file_id}/signatures", headers=headers)
    assert list_resp.status_code == 200
    sigs = list_resp.json()
    assert len(sigs) >= 1
    assert sigs[0]["id"] == sig_id

    # Verify signature
    verify_resp = client.get(f"/api/files/{file_id}/signatures/{sig_id}/verify", headers=headers)
    assert verify_resp.status_code == 200
    verify_data = verify_resp.json()
    assert verify_data["valid"] is True
    assert "authentic and valid" in verify_data["message"]


def test_shareable_secure_link(client):
    """Test generating a secure public share link and downloading file without authentication."""
    resp = client.post("/api/auth/register", json={
        "username": "link_owner",
        "email": "link_owner@vault.org",
        "password": "Password123!"
    })
    user_data = resp.json()
    user_sig = user_data["generated_keypairs"]["signing_private_key"]
    user_enc = user_data["generated_keypairs"]["encryption_private_key"]

    token = client.post("/api/auth/login", json={"username": "link_owner", "password": "Password123!"}).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Upload file
    original_text = b"Publicly accessible payload via Zero Trust share link."
    up_resp = client.post(
        "/api/files/upload",
        data={"signing_private_key": user_sig},
        files={"file": ("shared_release.txt", io.BytesIO(original_text), "text/plain")},
        headers=headers
    )
    file_id = up_resp.json()["id"]

    # Create share link
    create_link_resp = client.post(
        f"/api/files/{file_id}/share-links",
        json={
            "owner_private_key": user_enc,
            "expires_hours": 48,
            "max_uses": 5,
            "label": "Review Link"
        },
        headers=headers
    )
    assert create_link_resp.status_code == 201
    link_data = create_link_resp.json()
    share_token = link_data["token"]
    link_id = link_data["id"]

    # Public endpoint: get share info (NO Authorization header)
    info_resp = client.get(f"/api/share/{share_token}")
    assert info_resp.status_code == 200
    info = info_resp.json()
    assert info["filename"] == "shared_release.txt"
    assert info["owner_username"] == "link_owner"
    assert info["uses_remaining"] == 5

    # Public endpoint: download via token (NO Authorization header)
    public_dl_resp = client.get(f"/api/share/{share_token}/download")
    assert public_dl_resp.status_code == 200
    assert public_dl_resp.content == original_text

    # Verify download count incremented
    info_resp2 = client.get(f"/api/share/{share_token}")
    assert info_resp2.json()["uses_remaining"] == 4

    # Revoke link
    revoke_resp = client.delete(f"/api/files/{file_id}/share-links/{link_id}", headers=headers)
    assert revoke_resp.status_code == 200

    # Verify download rejected after revocation
    after_revoke = client.get(f"/api/share/{share_token}")
    assert after_revoke.status_code == 404
