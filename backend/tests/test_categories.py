import io
import pytest


def register_user(client, username):
    registration = client.post("/api/auth/register", json={
        "username": username,
        "email": f"{username}@example.com",
        "password": "SecureTestPassword123!"
    })
    assert registration.status_code == 201
    data = registration.json()
    token = client.post("/api/auth/login", json={
        "username": username,
        "password": "SecureTestPassword123!"
    }).json()["access_token"]
    return data, {"Authorization": f"Bearer {token}"}


def test_default_categories_and_custom_crud(client):
    user_data, headers = register_user(client, "cat_user1")

    # 1. Fetch categories -> starts empty, not created prior
    res = client.get("/api/files/categories", headers=headers)
    assert res.status_code == 200
    assert res.json() == []

    # 2. Create custom category
    create_res = client.post("/api/files/categories", json={"name": "Client Work"}, headers=headers)
    assert create_res.status_code == 201
    new_cat = create_res.json()
    assert new_cat["name"] == "Client Work"

    # Duplicate check
    dup_res = client.post("/api/files/categories", json={"name": "client work"}, headers=headers)
    assert dup_res.status_code == 400

    # 3. Rename custom category
    rename_res = client.patch(f"/api/files/categories/{new_cat['id']}", json={"name": "Client Archives"}, headers=headers)
    assert rename_res.status_code == 200
    assert rename_res.json()["name"] == "Client Archives"

    # 4. Upload file into category
    signing_key = user_data["generated_keypairs"]["signing_private_key"]
    upload_res = client.post(
        "/api/files/upload",
        data={
            "signing_private_key": signing_key,
            "category_id": str(new_cat["id"])
        },
        files={"file": ("contract.pdf", io.BytesIO(b"Confidential Contract"), "application/pdf")},
        headers=headers
    )
    assert upload_res.status_code == 201
    file_id = upload_res.json()["id"]
    assert upload_res.json()["category_id"] == new_cat["id"]
    assert upload_res.json()["category_name"] == "Client Archives"

    # Check category file count
    cats_after_upload = client.get("/api/files/categories", headers=headers).json()
    target_cat = next(c for c in cats_after_upload if c["id"] == new_cat["id"])
    assert target_cat["file_count"] == 1

    # Filter files by category
    filtered = client.get(f"/api/files/my-files?category_id={new_cat['id']}", headers=headers).json()
    assert len(filtered) == 1
    assert filtered[0]["id"] == file_id

    # 5. Move file to Uncategorized
    move_res = client.patch(f"/api/files/{file_id}/category", json={"category_id": None}, headers=headers)
    assert move_res.status_code == 200
    assert move_res.json()["category_id"] is None
    assert move_res.json()["category_name"] is None

    # Filter uncategorized
    uncat_files = client.get("/api/files/my-files?category_id=uncategorized", headers=headers).json()
    assert any(f["id"] == file_id for f in uncat_files)

    # Move back to category
    client.patch(f"/api/files/{file_id}/category", json={"category_id": new_cat["id"]}, headers=headers)

    # 6. Delete category -> files should safely become Uncategorized
    del_cat_res = client.delete(f"/api/files/categories/{new_cat['id']}", headers=headers)
    assert del_cat_res.status_code == 200

    # Verify file is not deleted, but moved to Uncategorized
    uncat_files_after_del = client.get("/api/files/my-files?category_id=uncategorized", headers=headers).json()
    assert any(f["id"] == file_id for f in uncat_files_after_del)


def test_category_security_and_isolation(client):
    user1_data, user1_headers = register_user(client, "iso_user1")
    user2_data, user2_headers = register_user(client, "iso_user2")

    # User 1 creates a category
    c1 = client.post("/api/files/categories", json={"name": "Confidential A"}, headers=user1_headers).json()

    # User 2 cannot rename User 1's category
    assert client.patch(f"/api/files/categories/{c1['id']}", json={"name": "Hacked"}, headers=user2_headers).status_code == 404

    # User 2 cannot delete User 1's category
    assert client.delete(f"/api/files/categories/{c1['id']}", headers=user2_headers).status_code == 404

    # User 2 cannot move their own file into User 1's category
    signing_key2 = user2_data["generated_keypairs"]["signing_private_key"]
    u2_file = client.post(
        "/api/files/upload",
        data={"signing_private_key": signing_key2},
        files={"file": ("u2.txt", io.BytesIO(b"Hello"), "text/plain")},
        headers=user2_headers
    ).json()

    assert client.patch(f"/api/files/{u2_file['id']}/category", json={"category_id": c1["id"]}, headers=user2_headers).status_code == 404
