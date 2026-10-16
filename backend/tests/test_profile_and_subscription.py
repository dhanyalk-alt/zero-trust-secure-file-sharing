import io
import datetime
import hmac
import hashlib
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from backend.app.config import settings
from backend.app.models.user import User
from backend.app.database import SessionLocal
from backend.app.crypto.signatures import sign_manifest_rsa_pss
from backend.app.crypto.hashing import compute_sha256, build_canonical_manifest


def register_user(client: TestClient, username: str, email: str, password: str = "SecurePass123!"):
    resp = client.post("/api/auth/register", json={
        "username": username,
        "email": email,
        "password": password
    })
    assert resp.status_code == 201, resp.text
    data = resp.json()
    keys = data["generated_keypairs"]
    return {
        "user": data["user"],
        "keys": keys,
        "token": None
    }


def login_user(client: TestClient, username: str, password: str = "SecurePass123!"):
    resp = client.post("/api/auth/login", json={"username": username, "password": password})
    assert resp.status_code == 200, resp.text
    token = resp.json()["access_token"]
    return token


def upload_test_file(client: TestClient, token: str, signing_priv_key: str, filename: str, content: bytes, org_id: int = None):
    headers = {"Authorization": f"Bearer {token}"}
    data = {"signing_private_key": signing_priv_key}
    if org_id is not None:
        data["organization_id"] = str(org_id)
    files = {"file": (filename, io.BytesIO(content), "text/plain")}
    return client.post("/api/files/upload", data=data, files=files, headers=headers)


def test_profile_picture_persistence(client: TestClient):
    """Test updating profile picture, persistent DB storage, and retrieval across sessions."""
    user_info = register_user(client, "alice_pic", "alice_pic@example.com")
    token = login_user(client, "alice_pic")
    headers = {"Authorization": f"Bearer {token}"}

    sample_pic = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="

    # 1. Update profile with picture
    patch_resp = client.patch("/api/auth/profile", json={"profile_pic": sample_pic}, headers=headers)
    assert patch_resp.status_code == 200
    assert patch_resp.json()["profile_pic"] == sample_pic

    # 2. Verify via /api/auth/me
    me_resp = client.get("/api/auth/me", headers=headers)
    assert me_resp.status_code == 200
    assert me_resp.json()["profile_pic"] == sample_pic

    # 3. Fresh login should still retain profile_pic
    login_resp = client.post("/api/auth/login", json={"username": "alice_pic", "password": "SecurePass123!"})
    assert login_resp.status_code == 200
    assert login_resp.json()["user"]["profile_pic"] == sample_pic


def test_profile_picture_in_user_search(client: TestClient):
    """Test that profile picture is displayed when searching members to share files."""
    user_a = register_user(client, "searcher", "searcher@example.com")
    user_b = register_user(client, "target_user", "target_user@example.com")

    token_b = login_user(client, "target_user")
    sample_pic = "data:image/png;base64,target_avatar_data"
    client.patch("/api/auth/profile", json={"profile_pic": sample_pic}, headers={"Authorization": f"Bearer {token_b}"})

    token_a = login_user(client, "searcher")
    search_resp = client.get("/api/users/search?q=target", headers={"Authorization": f"Bearer {token_a}"})
    assert search_resp.status_code == 200
    results = search_resp.json()
    assert len(results) >= 1

    target_result = next((u for u in results if u["username"] == "target_user"), None)
    assert target_result is not None
    assert target_result["profile_pic"] == sample_pic
    assert target_result["email"] == "target_user@example.com"


def test_personal_upload_limit_enforced_at_15(client: TestClient):
    """Free tier users can upload up to 15 personal files; 16th file is rejected with 403."""
    user_info = register_user(client, "quota_user", "quota_user@example.com")
    token = login_user(client, "quota_user")
    signing_key = user_info["keys"]["signing_private_key"]

    # Upload 15 personal files
    for i in range(1, 16):
        resp = upload_test_file(
            client, token, signing_key, f"doc_{i}.txt", f"Content for file {i}".encode()
        )
        assert resp.status_code == 201, f"Failed at file {i}: {resp.text}"

    # Verify status reports quota reached
    status_resp = client.get("/api/subscription/status", headers={"Authorization": f"Bearer {token}"})
    assert status_resp.status_code == 200
    status_data = status_resp.json()
    assert status_data["personal_files_count"] == 15
    assert status_data["is_limit_reached"] is True

    # 16th file must be rejected with 403 Forbidden
    resp16 = upload_test_file(
        client, token, signing_key, "doc_16.txt", b"Should be rejected"
    )
    assert resp16.status_code == 403
    assert "limit reached" in resp16.json()["detail"].lower()


def test_organization_files_exempt_from_limit(client: TestClient):
    """Organization files do NOT count toward the 15-file personal limit."""
    user_info = register_user(client, "org_limit_user", "org_limit_user@example.com")
    token = login_user(client, "org_limit_user")
    signing_key = user_info["keys"]["signing_private_key"]
    headers = {"Authorization": f"Bearer {token}"}

    # Upload 15 personal files to hit the limit
    for i in range(1, 16):
        resp = upload_test_file(
            client, token, signing_key, f"personal_{i}.txt", f"Personal content {i}".encode()
        )
        assert resp.status_code == 201

    # Personal upload is blocked
    blocked = upload_test_file(
        client, token, signing_key, "personal_16.txt", b"Blocked"
    )
    assert blocked.status_code == 403

    # Create an organization
    org_res = client.post("/api/organizations", json={"name": "Exempt Org Corp"}, headers=headers)
    assert org_res.status_code == 201
    org_id = org_res.json()["id"]

    # Upload file to organization -> MUST succeed because org files don't count toward personal limit
    org_upload_resp = upload_test_file(
        client, token, signing_key, "org_file_1.txt", b"Corporate confidential file", org_id=org_id
    )
    assert org_upload_resp.status_code == 201
    assert org_upload_resp.json()["original_filename"] == "org_file_1.txt"


def test_subscription_order_and_verification_flow(client: TestClient):
    """Test Razorpay order creation and HMAC-SHA256 signature verification."""
    user_info = register_user(client, "sub_buyer", "sub_buyer@example.com")
    token = login_user(client, "sub_buyer")
    headers = {"Authorization": f"Bearer {token}"}

    # Mock Razorpay credentials in settings
    with patch.object(settings, "RAZORPAY_KEY_ID", "rzp_test_key123"), \
         patch.object(settings, "RAZORPAY_KEY_SECRET", "super_secret_razorpay_key"):

        # Mock razorpay client
        with patch("razorpay.Client") as mock_rzp_client:
            mock_instance = MagicMock()
            mock_rzp_client.return_value = mock_instance
            mock_instance.order.create.return_value = {"id": "order_test_998877"}

            # Create order for MONTHLY plan (₹60)
            order_res = client.post("/api/subscription/create-order", json={"plan_type": "MONTHLY"}, headers=headers)
            assert order_res.status_code == 200
            order_data = order_res.json()
            assert order_data["order_id"] == "order_test_998877"
            assert order_data["amount"] == 6000  # ₹60 in paise
            assert order_data["plan_type"] == "MONTHLY"

            # 1. Attempt verification with forged signature -> Rejected
            fake_verify = client.post("/api/subscription/verify-payment", json={
                "razorpay_order_id": "order_test_998877",
                "razorpay_payment_id": "pay_test_111",
                "razorpay_signature": "invalid_fake_signature"
            }, headers=headers)
            assert fake_verify.status_code == 400
            assert "signature" in fake_verify.json()["detail"].lower()

            # 2. Compute authentic HMAC-SHA256 signature
            payment_id = "pay_test_valid_123"
            msg = f"order_test_998877|{payment_id}"
            valid_sig = hmac.new(
                "super_secret_razorpay_key".encode("utf-8"),
                msg.encode("utf-8"),
                hashlib.sha256
            ).hexdigest()

            # 3. Legitimate verification
            real_verify = client.post("/api/subscription/verify-payment", json={
                "razorpay_order_id": "order_test_998877",
                "razorpay_payment_id": payment_id,
                "razorpay_signature": valid_sig
            }, headers=headers)
            assert real_verify.status_code == 200
            verify_data = real_verify.json()
            assert verify_data["success"] is True
            assert verify_data["subscription_status"] == "ACTIVE"
            assert verify_data["subscription_plan"] == "Pro Monthly"

            # Check status endpoint reflects ACTIVE subscription
            stat = client.get("/api/subscription/status", headers=headers)
            assert stat.status_code == 200
            assert stat.json()["subscription_status"] == "ACTIVE"
            assert stat.json()["current_plan"] == "Pro Monthly"
            assert stat.json()["is_limit_reached"] is False


def test_subscription_expiry_returns_to_free_without_deleting_files(client: TestClient):
    """Test that when a subscription expires, files remain intact and limit returns to free tier."""
    user_info = register_user(client, "expired_user", "expired_user@example.com")
    token = login_user(client, "expired_user")
    signing_key = user_info["keys"]["signing_private_key"]
    headers = {"Authorization": f"Bearer {token}"}

    # Upload 15 files
    for i in range(1, 16):
        resp = upload_test_file(client, token, signing_key, f"exp_file_{i}.txt", f"data {i}".encode())
        assert resp.status_code == 201

    # Simulate an active subscription in the DB
    from backend.tests.conftest import TestingSessionLocal
    db = TestingSessionLocal()
    user = db.query(User).filter(User.username == "expired_user").first()
    assert user is not None
    user.subscription_status = "ACTIVE"
    user.subscription_plan = "Pro Monthly"
    # Set expiration to yesterday (past)
    user.subscription_expires_at = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=1)
    db.commit()
    db.close()

    # Query status -> should detect expired subscription
    status_resp = client.get("/api/subscription/status", headers=headers)
    assert status_resp.status_code == 200
    data = status_resp.json()
    assert data["subscription_status"] == "EXPIRED"
    assert data["personal_files_count"] == 15
    assert data["is_limit_reached"] is True

    # User's existing files must still be completely listed and accessible
    files_resp = client.get("/api/files/my-files", headers=headers)
    assert files_resp.status_code == 200
    assert len(files_resp.json()) == 15

    # New upload blocked due to return to free limit
    blocked = upload_test_file(client, token, signing_key, "blocked_after_expiry.txt", b"Forbidden")
    assert blocked.status_code == 403
