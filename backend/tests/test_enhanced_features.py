import io
import datetime
from backend.app.models.user import User
from backend.app.models.file import EncryptedFile
from backend.app.models.audit import AuditLog
from backend.tests.conftest import TestingSessionLocal


def test_file_search_and_sorting(client):
    """
    Test dynamic search and sorting on both /my-files and /shared-with-me endpoints.
    """
    # 1. Register Alice and Bob
    resp_a = client.post("/api/auth/register", json={
        "username": "alice_searcher",
        "email": "alice_search@vault.org",
        "password": "Password123!"
    })
    alice_data = resp_a.json()
    alice_sig = alice_data["generated_keypairs"]["signing_private_key"]
    alice_enc = alice_data["generated_keypairs"]["encryption_private_key"]

    resp_b = client.post("/api/auth/register", json={
        "username": "bob_searcher",
        "email": "bob_search@vault.org",
        "password": "Password123!"
    })

    token_a = client.post("/api/auth/login", json={"username": "alice_searcher", "password": "Password123!"}).json()["access_token"]
    headers_a = {"Authorization": f"Bearer {token_a}"}

    token_b = client.post("/api/auth/login", json={"username": "bob_searcher", "password": "Password123!"}).json()["access_token"]
    headers_b = {"Authorization": f"Bearer {token_b}"}

    # Upload files of varying names and sizes
    files_to_upload = [
        ("report_alpha.txt", b"A" * 100),
        ("report_beta.txt", b"B" * 500),
        ("financial_summary.pdf", b"C" * 1000),
    ]

    file_ids = []
    for filename, content in files_to_upload:
        up_resp = client.post(
            "/api/files/upload",
            data={"signing_private_key": alice_sig},
            files={"file": (filename, io.BytesIO(content), "text/plain")},
            headers=headers_a
        )
        assert up_resp.status_code == 201
        file_ids.append(up_resp.json()["id"])

    # Test search on /my-files
    res_search = client.get("/api/files/my-files?search=alpha", headers=headers_a)
    assert res_search.status_code == 200
    search_files = res_search.json()
    assert len(search_files) == 1
    assert search_files[0]["original_filename"] == "report_alpha.txt"

    # Test search for "report" -> should return 2 files
    res_search_rep = client.get("/api/files/my-files?search=report", headers=headers_a)
    assert res_search_rep.status_code == 200
    assert len(res_search_rep.json()) == 2

    # Test sort by size (descending)
    res_sort_size = client.get("/api/files/my-files?sort_by=size", headers=headers_a)
    assert res_sort_size.status_code == 200
    sizes = [f["file_size"] for f in res_sort_size.json()]
    assert sizes == sorted(sizes, reverse=True)

    # Share financial_summary.pdf with Bob
    fin_file_id = file_ids[2]
    share_resp = client.post(
        f"/api/files/{fin_file_id}/share",
        json={"recipient_identifier": "bob_searcher", "can_read": True, "can_download": True, "can_share": False},
        headers={**headers_a, "X-Owner-Private-Key": alice_enc}
    )
    assert share_resp.status_code == 201

    # Bob searches in /shared-with-me
    bob_shared = client.get("/api/files/shared-with-me?search=financial", headers=headers_b)
    assert bob_shared.status_code == 200
    assert len(bob_shared.json()) == 1
    assert bob_shared.json()[0]["original_filename"] == "financial_summary.pdf"

    # Bob search with mismatch
    bob_nomatch = client.get("/api/files/shared-with-me?search=nonexistent", headers=headers_b)
    assert bob_nomatch.status_code == 200
    assert len(bob_nomatch.json()) == 0


def test_file_expiry_ttl_enforcement(client):
    """
    Test Zero Trust enforcement of File Expiry / TTL:
    - File owner sets future expiry
    - File owner clears expiry
    - When file is expired, Zero Trust returns 410 GONE on download/access
    - Audit log records EXPIRED_FILE_ACCESS_ATTEMPT with status DENIED
    """
    resp_a = client.post("/api/auth/register", json={
        "username": "alice_exp",
        "email": "alice_exp@vault.org",
        "password": "Password123!"
    })
    alice_data = resp_a.json()
    alice_sig = alice_data["generated_keypairs"]["signing_private_key"]
    alice_enc = alice_data["generated_keypairs"]["encryption_private_key"]

    token_a = client.post("/api/auth/login", json={"username": "alice_exp", "password": "Password123!"}).json()["access_token"]
    headers_a = {"Authorization": f"Bearer {token_a}"}

    # Upload file
    up_resp = client.post(
        "/api/files/upload",
        data={"signing_private_key": alice_sig},
        files={"file": ("ephemeral.txt", io.BytesIO(b"Secret temporary note"), "text/plain")},
        headers=headers_a
    )
    file_id = up_resp.json()["id"]

    # 1. Set future expiry
    future_time = (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=2)).isoformat()
    exp_resp = client.patch(f"/api/files/{file_id}/expiry", json={"expires_at": future_time}, headers=headers_a)
    assert exp_resp.status_code == 200
    assert exp_resp.json()["expires_at"] is not None

    # Verify metadata reflects expiry
    meta_resp = client.get("/api/files/my-files", headers=headers_a)
    assert meta_resp.json()[0]["expires_at"] is not None
    assert meta_resp.json()[0]["is_expired"] is False

    # 2. Clear expiry
    clr_resp = client.patch(f"/api/files/{file_id}/expiry", json={"clear_expiry": True}, headers=headers_a)
    assert clr_resp.status_code == 200
    assert clr_resp.json()["expires_at"] is None

    # 3. Simulate expired file in DB
    past_time = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=1)
    db = TestingSessionLocal()
    db_file = db.query(EncryptedFile).filter(EncryptedFile.id == file_id).first()
    db_file.expires_at = past_time
    db.commit()
    db.close()

    # 4. Zero Trust verification must deny access to expired file
    # Trying to download:
    dl_resp = client.post(
        f"/api/files/{file_id}/download",
        data={"private_key_pem": alice_enc},
        headers=headers_a
    )
    assert dl_resp.status_code == 410
    assert "expired" in dl_resp.json()["detail"].lower()

    # 5. Check audit logs
    db = TestingSessionLocal()
    audit_entry = db.query(AuditLog).filter(
        AuditLog.resource_id == file_id,
        AuditLog.action == "EXPIRED_FILE_ACCESS_ATTEMPT"
    ).first()
    assert audit_entry is not None
    assert audit_entry.status == "DENIED"
    db.close()


def test_admin_access_control_and_management(client):
    """
    Test Admin API capabilities & Zero Trust role-based enforcement:
    - Normal user receives 403 Forbidden on all /api/admin endpoints
    - Admin user can view system-wide stats, list users, update status, and view all audit logs
    """
    # 1. Register regular user Charlie and Admin user Root
    client.post("/api/auth/register", json={
        "username": "charlie_normal",
        "email": "charlie@vault.org",
        "password": "Password123!"
    })
    client.post("/api/auth/register", json={
        "username": "admin_root",
        "email": "admin@vault.org",
        "password": "Password123!"
    })

    # Promote admin_root in DB
    db = TestingSessionLocal()
    admin_user = db.query(User).filter(User.username == "admin_root").first()
    admin_user.role = "ADMIN"
    db.commit()
    db.close()

    token_c = client.post("/api/auth/login", json={"username": "charlie_normal", "password": "Password123!"}).json()["access_token"]
    headers_c = {"Authorization": f"Bearer {token_c}"}

    token_admin = client.post("/api/auth/login", json={"username": "admin_root", "password": "Password123!"}).json()["access_token"]
    headers_admin = {"Authorization": f"Bearer {token_admin}"}

    # 2. Charlie (regular user) must be blocked
    resp_blocked = client.get("/api/admin/system-stats", headers=headers_c)
    assert resp_blocked.status_code == 403

    resp_users_blocked = client.get("/api/admin/users", headers=headers_c)
    assert resp_users_blocked.status_code == 403

    # 3. Admin successfully accesses system stats
    resp_stats = client.get("/api/admin/system-stats", headers=headers_admin)
    assert resp_stats.status_code == 200
    stats_data = resp_stats.json()
    assert stats_data["total_users"] >= 2
    assert stats_data["active_users"] >= 2

    # 4. Admin lists users with search
    resp_users = client.get("/api/admin/users?search=charlie", headers=headers_admin)
    assert resp_users.status_code == 200
    users_list = resp_users.json()
    assert len(users_list) == 1
    assert users_list[0]["username"] == "charlie_normal"
    charlie_id = users_list[0]["id"]

    # 5. Admin deactivates Charlie
    resp_update = client.patch(
        f"/api/admin/users/{charlie_id}",
        json={"is_active": False},
        headers=headers_admin
    )
    assert resp_update.status_code == 200
    assert resp_update.json()["is_active"] is False

    # 6. Verify Charlie cannot log in when deactivated
    resp_charlie_login = client.post("/api/auth/login", json={"username": "charlie_normal", "password": "Password123!"})
    assert resp_charlie_login.status_code == 403
