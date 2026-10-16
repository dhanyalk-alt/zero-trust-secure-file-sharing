import io

from backend.app.models.audit import AuditLog
from backend.app.models.organization import OrganizationFile, OrganizationMembership
from backend.app.models.permission import FilePermission
from backend.tests.conftest import TestingSessionLocal


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


def upload_organization_file(client, headers, signing_key, organization_id, filename, content):
    response = client.post(
        "/api/files/upload",
        data={
            "signing_private_key": signing_key,
            "organization_id": str(organization_id)
        },
        files={"file": (filename, io.BytesIO(content), "text/plain")},
        headers=headers
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_organization_membership_file_grants_and_revocation(client):
    owner_data, owner_headers = register_user(client, "org_owner")
    member_data, member_headers = register_user(client, "org_member")
    outsider_data, outsider_headers = register_user(client, "org_outsider")
    owner_private_key = owner_data["generated_keypairs"]["encryption_private_key"]
    owner_signing_key = owner_data["generated_keypairs"]["signing_private_key"]
    member_private_key = member_data["generated_keypairs"]["encryption_private_key"]
    outsider_private_key = outsider_data["generated_keypairs"]["encryption_private_key"]

    created = client.post("/api/organizations", json={
        "name": "Secure Workspace",
        "description": "Files for the project team"
    }, headers=owner_headers)
    assert created.status_code == 201
    organization = created.json()
    organization_id = organization["id"]
    assert organization["role"] == "owner"

    assert client.get("/api/organizations", headers=outsider_headers).json() == []
    assert client.get(f"/api/organizations/{organization_id}", headers=outsider_headers).status_code == 404

    added_member = client.post(
        f"/api/organizations/{organization_id}/members",
        json={"user_identifier": member_data["user"]["email"], "can_upload": True},
        headers=owner_headers
    )
    assert added_member.status_code == 201
    assert added_member.json()["can_upload"] is True
    assert client.get(f"/api/organizations/{organization_id}", headers=member_headers).json()["role"] == "member"
    assert client.post(
        f"/api/organizations/{organization_id}/members",
        json={"user_identifier": "org_member"},
        headers=owner_headers
    ).status_code == 409
    assert client.post(
        f"/api/organizations/{organization_id}/members",
        json={"user_identifier": "missing@example.test"},
        headers=owner_headers
    ).status_code == 404
    assert client.post(
        f"/api/organizations/{organization_id}/members",
        json={"user_identifier": "org_outsider"},
        headers=member_headers
    ).status_code == 403

    first_file = upload_organization_file(
        client, owner_headers, owner_signing_key, organization_id, "read-only.txt", b"Read-only file"
    )
    second_file = upload_organization_file(
        client, owner_headers, owner_signing_key, organization_id, "download-only.txt", b"Download-only file"
    )
    # NEW BEHAVIOR: org members can see all org files (implicit access granted at upload time)
    initial_file_list = client.get(f"/api/organizations/{organization_id}/files", headers=member_headers).json()
    assert len(initial_file_list) == 2, f"Expected 2 files, got {len(initial_file_list)}"

    first_share = client.post(
        f"/api/files/{first_file['id']}/share",
        json={
            "recipient_identifier": "org_member",
            "can_read": True,
            "can_download": False,
            "can_share": True
        },
        headers={**owner_headers, "X-Owner-Private-Key": owner_private_key}
    )
    assert first_share.status_code == 201

    second_share = client.post(
        f"/api/files/{second_file['id']}/share",
        json={
            "recipient_identifier": "org_member",
            "can_read": False,
            "can_download": True,
            "can_share": False
        },
        headers={**owner_headers, "X-Owner-Private-Key": owner_private_key}
    )
    assert second_share.status_code == 201

    assert client.get(
        f"/api/files/{first_file['id']}/metadata", headers=member_headers
    ).json()["can_download"] is False
    assert client.post(
        f"/api/files/{first_file['id']}/download",
        data={"private_key_pem": member_private_key},
        headers=member_headers
    ).status_code == 403
    assert client.get(f"/api/files/{second_file['id']}/metadata", headers=member_headers).status_code == 403
    download_only = client.post(
        f"/api/files/{second_file['id']}/download",
        data={"private_key_pem": member_private_key},
        headers=member_headers
    )
    assert download_only.status_code == 200
    assert download_only.content == b"Download-only file"

    member_file_list = client.get(f"/api/organizations/{organization_id}/files", headers=member_headers)
    assert member_file_list.status_code == 200
    # Both files visible: first has can_read=True (explicit), second has can_read=False (explicit) but still shows
    assert len(member_file_list.json()) == 2

    outside_share = client.post(
        f"/api/files/{first_file['id']}/share",
        json={"recipient_identifier": "org_outsider"},
        headers={**owner_headers, "X-Owner-Private-Key": owner_private_key}
    )
    assert outside_share.status_code == 403
    assert client.get(
        f"/api/organizations/{organization_id}/files", headers=outsider_headers
    ).status_code == 404
    assert client.post(
        f"/api/organizations/{organization_id}/members",
        json={"user_identifier": "org_outsider"},
        headers=owner_headers
    ).status_code == 201
    reshared = client.post(
        f"/api/files/{first_file['id']}/share",
        json={
            "recipient_identifier": "org_outsider",
            "can_read": True,
            "can_download": True,
            "can_share": False
        },
        headers={**member_headers, "X-Owner-Private-Key": member_private_key}
    )
    assert reshared.status_code == 201
    outsider_download = client.post(
        f"/api/files/{first_file['id']}/download",
        data={"private_key_pem": outsider_private_key},
        headers=outsider_headers
    )
    assert outsider_download.status_code == 200
    assert outsider_download.content == b"Read-only file"

    removed = client.delete(
        f"/api/organizations/{organization_id}/members/{member_data['user']['id']}",
        headers=owner_headers
    )
    assert removed.status_code == 200
    for file_id in (first_file["id"], second_file["id"]):
        assert client.get(f"/api/files/{file_id}/metadata", headers=member_headers).status_code == 403
        assert client.post(
            f"/api/files/{file_id}/download",
            data={"private_key_pem": member_private_key},
            headers=member_headers
        ).status_code == 403

    db = TestingSessionLocal()
    try:
        membership = db.query(OrganizationMembership).filter(
            OrganizationMembership.organization_id == organization_id,
            OrganizationMembership.user_id == member_data["user"]["id"]
        ).first()
        assert membership is None
        grants = db.query(FilePermission).filter(
            FilePermission.recipient_id == member_data["user"]["id"]
        ).all()
        assert len(grants) == 2
        assert all(grant.is_revoked and grant.encrypted_aes_key == "" for grant in grants)
        assert db.query(OrganizationFile).filter(
            OrganizationFile.organization_id == organization_id
        ).count() == 2
        audit_actions = {
            row.action for row in db.query(AuditLog).filter(
                AuditLog.resource_id.in_([str(organization_id), first_file["id"], second_file["id"]])
            ).all()
        }
        assert "ORGANIZATION_CREATED" in audit_actions
        assert "ORGANIZATION_MEMBER_ADDED" in audit_actions
        assert "ORGANIZATION_MEMBER_REMOVED" in audit_actions
        assert "ORGANIZATION_FILE_ACCESS_REVOKED" in audit_actions
        assert "ORGANIZATION_FILES_VIEWED" in audit_actions
    finally:
        db.close()


def test_organization_upload_requires_upload_permission(client):
    owner_data, owner_headers = register_user(client, "org_uploader_owner")
    member_data, member_headers = register_user(client, "org_no_upload")
    organization = client.post(
        "/api/organizations",
        json={"name": "Uploads Restricted"},
        headers=owner_headers
    ).json()
    organization_id = organization["id"]
    added = client.post(
        f"/api/organizations/{organization_id}/members",
        json={"user_identifier": member_data["user"]["username"], "can_upload": False},
        headers=owner_headers
    )
    assert added.status_code == 201

    response = client.post(
        "/api/files/upload",
        data={
            "organization_id": str(organization_id),
            "signing_private_key": member_data["generated_keypairs"]["signing_private_key"]
        },
        files={"file": ("forbidden.txt", io.BytesIO(b"not allowed"), "text/plain")},
        headers=member_headers
    )
    assert response.status_code == 403
    assert client.post(
        "/api/files/upload",
        data={
            "organization_id": "999999",
            "signing_private_key": owner_data["generated_keypairs"]["signing_private_key"]
        },
        files={"file": ("missing-org.txt", io.BytesIO(b"not allowed"), "text/plain")},
        headers=owner_headers
    ).status_code == 404


def test_organization_name_validation(client):
    _, headers = register_user(client, "org_validation_user")
    assert client.post("/api/organizations", json={"name": "  "}, headers=headers).status_code == 422
    assert client.post("/api/organizations", json={"name": "A"}, headers=headers).status_code == 422


def test_organizations_route_is_registered(client):
    assert client.get("/api/organizations").status_code == 401
    spec = client.get("/openapi.json")
    assert spec.status_code == 200
    assert "/api/organizations" in spec.json()["paths"]


def test_delete_organization_and_file(client):
    owner_data, owner_headers = register_user(client, "del_org_owner")
    member_data, member_headers = register_user(client, "del_org_member")
    owner_signing_key = owner_data["generated_keypairs"]["signing_private_key"]

    org_res = client.post(
        "/api/organizations",
        json={"name": "Org To Delete", "description": "Will be deleted"},
        headers=owner_headers
    )
    assert org_res.status_code == 201
    org = org_res.json()
    org_id = org["id"]
    assert org["member_count"] == 1
    assert org["file_count"] == 0

    # Add member
    add_res = client.post(
        f"/api/organizations/{org_id}/members",
        json={"user_identifier": "del_org_member", "can_upload": True},
        headers=owner_headers
    )
    assert add_res.status_code == 201

    # Upload file
    uploaded_file = upload_organization_file(
        client, owner_headers, owner_signing_key, org_id, "delete_me.txt", b"Content to delete"
    )
    file_id = uploaded_file["id"]

    # Verify counts
    org_detail = client.get(f"/api/organizations/{org_id}", headers=owner_headers).json()
    assert org_detail["member_count"] == 2
    assert org_detail["file_count"] == 1

    # Member cannot delete owner's file
    del_file_forbidden = client.delete(f"/api/organizations/{org_id}/files/{file_id}", headers=member_headers)
    assert del_file_forbidden.status_code == 403

    # Member cannot delete the organization
    del_org_forbidden = client.delete(f"/api/organizations/{org_id}", headers=member_headers)
    assert del_org_forbidden.status_code == 403

    # Owner deletes the file
    del_file_ok = client.delete(f"/api/organizations/{org_id}/files/{file_id}", headers=owner_headers)
    assert del_file_ok.status_code == 200

    # Org file count updated
    org_detail_after_file = client.get(f"/api/organizations/{org_id}", headers=owner_headers).json()
    assert org_detail_after_file["file_count"] == 0

    # Owner deletes the organization
    del_org_ok = client.delete(f"/api/organizations/{org_id}", headers=owner_headers)
    assert del_org_ok.status_code == 200

    # Organization is now gone
    assert client.get(f"/api/organizations/{org_id}", headers=owner_headers).status_code == 404

