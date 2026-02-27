import io
import zipfile
from pathlib import Path

from flask import Flask
from flask.testing import FlaskClient
from werkzeug.datastructures import MultiDict

from app import db
from app.domain.item import Item


def _assert_password_flags(payload: dict, *, protected: bool, unlocked: bool):
    assert payload["isPasswordProtected"] is protected
    assert payload["isPasswordUnlocked"] is unlocked


def test_health(client: FlaskClient):
    res = client.get("/api/health")
    assert res.status_code == 200
    assert res.get_json() == {"ok": True}


def test_upload_files_list_download_and_delete(app: Flask, client: FlaskClient):
    data = {
        "files": [
            (io.BytesIO(b"hello"), "hello.txt"),
            (io.BytesIO(b"world"), "world.zip"),
        ]
    }

    res = client.post("/api/items/files", data=data, content_type="multipart/form-data")
    assert res.status_code == 201
    created = res.get_json()
    assert isinstance(created, list)
    assert len(created) == 2
    assert all(item["kind"] == "file" for item in created)
    assert all(item["state"] == "active" for item in created)
    assert all(item["isPasswordProtected"] is False for item in created)
    assert all(item["isPasswordUnlocked"] is True for item in created)

    list_res = client.get("/api/items")
    assert list_res.status_code == 200
    payload = list_res.get_json()
    assert payload["pagination"]["total"] == 2

    # Search
    search_res = client.get("/api/items?q=hello")
    assert search_res.status_code == 200
    assert search_res.get_json()["pagination"]["total"] == 1

    item_id = created[0]["id"]

    # Update state
    patch = client.patch(f"/api/items/{item_id}", json={"state": "done"})
    assert patch.status_code == 200
    assert patch.get_json()["state"] == "done"

    done_list = client.get("/api/items?state=done")
    assert done_list.status_code == 200
    assert done_list.get_json()["pagination"]["total"] == 1

    active_list = client.get("/api/items?state=active")
    assert active_list.status_code == 200
    assert active_list.get_json()["pagination"]["total"] == 1

    with app.app_context():
        item = db.session.get(Item, item_id)
        assert item is not None
        stored_path = Path(app.config["UPLOAD_FOLDER"]) / item.stored_name
        assert stored_path.exists()

    dl = client.get(f"/api/items/{item_id}/download")
    assert dl.status_code == 200
    assert dl.data == b"hello"
    assert "attachment" in dl.headers.get("Content-Disposition", "")
    assert "hello.txt" in dl.headers.get("Content-Disposition", "")

    public = client.get(f"/d/{item_id}")
    assert public.status_code == 200
    assert public.data == b"hello"

    not_ready_delete = client.delete(f"/api/items/{item_id}")
    assert not_ready_delete.status_code == 400
    assert stored_path.exists()

    patch_ready = client.patch(f"/api/items/{item_id}", json={"state": "ready_to_delete"})
    assert patch_ready.status_code == 200
    assert patch_ready.get_json()["state"] == "ready_to_delete"

    delete_res = client.delete(f"/api/items/{item_id}")
    assert delete_res.status_code == 204

    assert not stored_path.exists()

    missing = client.get(f"/api/items/{item_id}/download")
    assert missing.status_code == 404


def test_bulk_delete_ready_to_delete(app: Flask, client: FlaskClient):
    data = {
        "files": [
            (io.BytesIO(b"a"), "a.txt"),
            (io.BytesIO(b"b"), "b.txt"),
            (io.BytesIO(b"c"), "c.txt"),
        ]
    }

    res = client.post("/api/items/files", data=data, content_type="multipart/form-data")
    assert res.status_code == 201
    created = res.get_json()
    ids = [item["id"] for item in created]

    patch1 = client.patch(f"/api/items/{ids[0]}", json={"state": "ready_to_delete"})
    assert patch1.status_code == 200
    patch2 = client.patch(f"/api/items/{ids[2]}", json={"state": "ready_to_delete"})
    assert patch2.status_code == 200

    with app.app_context():
        items = [db.session.get(Item, i) for i in ids]
        assert all(it is not None for it in items)
        stored_paths = {it.id: Path(app.config["UPLOAD_FOLDER"]) / it.stored_name for it in items if it is not None}
        assert stored_paths[ids[0]].exists()
        assert stored_paths[ids[1]].exists()
        assert stored_paths[ids[2]].exists()

    ready_list = client.get("/api/items?state=ready_to_delete")
    assert ready_list.status_code == 200
    assert ready_list.get_json()["pagination"]["total"] == 2

    bulk = client.delete("/api/items/ready-to-delete")
    assert bulk.status_code == 200
    assert bulk.get_json()["deleted"] == 2

    ready_list_after = client.get("/api/items?state=ready_to_delete")
    assert ready_list_after.status_code == 200
    assert ready_list_after.get_json()["pagination"]["total"] == 0

    remaining = client.get("/api/items")
    assert remaining.status_code == 200
    assert remaining.get_json()["pagination"]["total"] == 1

    assert not stored_paths[ids[0]].exists()
    assert stored_paths[ids[1]].exists()
    assert not stored_paths[ids[2]].exists()


def test_upload_folder_creates_zip(app: Flask, client: FlaskClient):
    data = MultiDict(
        [
            ("files", (io.BytesIO(b"A"), "a.txt")),
            ("paths", "MyFolder/a.txt"),
            ("files", (io.BytesIO(b"B"), "b.txt")),
            ("paths", "MyFolder/sub/b.txt"),
        ]
    )

    res = client.post("/api/items/folder", data=data, content_type="multipart/form-data")
    assert res.status_code == 201
    item = res.get_json()
    assert item["kind"] == "folder"
    assert item["name"] == "MyFolder"
    assert item["state"] == "active"

    dl = client.get(f"/api/items/{item['id']}/download")
    assert dl.status_code == 200
    assert "MyFolder.zip" in dl.headers.get("Content-Disposition", "")

    zf = zipfile.ZipFile(io.BytesIO(dl.data))
    names = set(zf.namelist())
    assert "MyFolder/a.txt" in names
    assert "MyFolder/sub/b.txt" in names
    assert zf.read("MyFolder/a.txt") == b"A"
    assert zf.read("MyFolder/sub/b.txt") == b"B"


def test_create_link_and_public_redirect(client: FlaskClient):
    payload = {"url": "https://example.com/docs/start", "name": "Docs"}
    create = client.post("/api/items/link", json=payload)
    assert create.status_code == 201

    item = create.get_json()
    assert item["kind"] == "link"
    assert item["name"] == "Docs"
    assert item["state"] == "active"
    assert item["linkUrl"] == payload["url"]
    assert item["noteText"] is None
    assert item["sizeBytes"] > 0
    _assert_password_flags(item, protected=False, unlocked=True)

    list_links = client.get("/api/items?kind=link")
    assert list_links.status_code == 200
    assert list_links.get_json()["pagination"]["total"] == 1

    download = client.get(f"/api/items/{item['id']}/download")
    assert download.status_code == 400
    assert "does not have downloadable file content" in download.get_json()["error"]

    public = client.get(f"/d/{item['id']}", follow_redirects=False)
    assert public.status_code == 302
    assert public.headers.get("Location") == payload["url"]

    patch_ready = client.patch(f"/api/items/{item['id']}", json={"state": "ready_to_delete"})
    assert patch_ready.status_code == 200

    delete = client.delete(f"/api/items/{item['id']}")
    assert delete.status_code == 204


def test_create_note_and_public_view(client: FlaskClient):
    payload = {"title": "Launch note", "text": "Deploy at 18:00 UTC.\nPing ops after checks."}
    create = client.post("/api/items/note", json=payload)
    assert create.status_code == 201

    item = create.get_json()
    assert item["kind"] == "note"
    assert item["name"] == payload["title"]
    assert item["noteText"] == payload["text"]
    assert item["linkUrl"] is None
    assert item["state"] == "active"
    _assert_password_flags(item, protected=False, unlocked=True)

    list_notes = client.get("/api/items?kind=note")
    assert list_notes.status_code == 200
    list_payload = list_notes.get_json()
    assert list_payload["pagination"]["total"] == 1
    listed_note = list_payload["items"][0]
    assert listed_note["noteText"] is None
    assert listed_note["noteExcerpt"] is not None
    assert "Deploy at 18:00 UTC." in listed_note["noteExcerpt"]

    detail = client.get(f"/api/items/{item['id']}")
    assert detail.status_code == 200
    assert detail.get_json()["noteText"] == payload["text"]
    _assert_password_flags(detail.get_json(), protected=False, unlocked=True)

    public = client.get(f"/d/{item['id']}")
    assert public.status_code == 200
    assert payload["title"].encode() in public.data
    assert b"Deploy at 18:00 UTC." in public.data

    download = client.get(f"/api/items/{item['id']}/download")
    assert download.status_code == 400
    assert "does not have downloadable file content" in download.get_json()["error"]

    patch_ready = client.patch(f"/api/items/{item['id']}", json={"state": "ready_to_delete"})
    assert patch_ready.status_code == 200

    bulk_delete = client.delete("/api/items/ready-to-delete?kind=note")
    assert bulk_delete.status_code == 200
    assert bulk_delete.get_json()["deleted"] == 1


def test_create_link_and_note_validation(client: FlaskClient):
    bad_link = client.post("/api/items/link", json={"url": "ftp://example.com"})
    assert bad_link.status_code == 400
    assert "http:// or https://" in bad_link.get_json()["error"]

    missing_text = client.post("/api/items/note", json={"title": "No body"})
    assert missing_text.status_code == 400
    assert "Missing 'text'" in missing_text.get_json()["error"]


def test_search_matches_note_body_text(client: FlaskClient):
    note = client.post(
        "/api/items/note",
        json={
            "title": "Ops handoff",
            "text": "Database failover checklist includes Redis quorum verification.",
        },
    )
    assert note.status_code == 201

    unrelated = client.post(
        "/api/items/files",
        data={"files": [(io.BytesIO(b"hello"), "hello.txt")]},
        content_type="multipart/form-data",
    )
    assert unrelated.status_code == 201

    search = client.get("/api/items?q=QuOrUm")
    assert search.status_code == 200
    payload = search.get_json()
    assert payload["pagination"]["total"] == 1
    assert payload["items"][0]["kind"] == "note"
    assert payload["items"][0]["name"] == "Ops handoff"


def test_list_note_excerpt_length_respects_config(app: Flask, client: FlaskClient):
    app.config["NOTE_EXCERPT_LENGTH"] = 60

    text = " ".join(f"word{i}" for i in range(40))
    create = client.post("/api/items/note", json={"title": "Long note", "text": text})
    assert create.status_code == 201

    list_notes = client.get("/api/items?kind=note")
    assert list_notes.status_code == 200
    item = list_notes.get_json()["items"][0]
    excerpt = item["noteExcerpt"]
    assert isinstance(excerpt, str)
    assert len(excerpt) <= 60
    assert excerpt.endswith("...")

    detail = client.get(f"/api/items/{create.get_json()['id']}")
    assert detail.status_code == 200
    detail_excerpt = detail.get_json()["noteExcerpt"]
    assert isinstance(detail_excerpt, str)
    assert len(detail_excerpt) <= 60


def test_password_protected_file_unlock_flow(app: Flask, client: FlaskClient):
    create = client.post(
        "/api/items/files",
        data={
            "password": "supersecret",
            "files": [(io.BytesIO(b"private-data"), "private.txt")],
        },
        content_type="multipart/form-data",
    )
    assert create.status_code == 201
    item = create.get_json()[0]
    item_id = item["id"]
    _assert_password_flags(item, protected=True, unlocked=True)

    other_client = app.test_client()

    detail_locked = other_client.get(f"/api/items/{item_id}")
    assert detail_locked.status_code == 200
    _assert_password_flags(detail_locked.get_json(), protected=True, unlocked=False)

    blocked = other_client.get(f"/api/items/{item_id}/download")
    assert blocked.status_code == 401
    assert blocked.get_json()["error"] == "Password required for this item"

    wrong_unlock = other_client.post(f"/api/items/{item_id}/unlock", json={"password": "wrongpass"})
    assert wrong_unlock.status_code == 401
    assert wrong_unlock.get_json()["error"] == "Invalid password"

    unlock = other_client.post(f"/api/items/{item_id}/unlock", json={"password": "supersecret"})
    assert unlock.status_code == 204

    downloaded = other_client.get(f"/api/items/{item_id}/download")
    assert downloaded.status_code == 200
    assert downloaded.data == b"private-data"


def test_password_protected_folder_requires_unlock(app: Flask, client: FlaskClient):
    data = MultiDict(
        [
            ("password", "folder-pass"),
            ("files", (io.BytesIO(b"A"), "a.txt")),
            ("paths", "MyFolder/a.txt"),
        ]
    )
    create = client.post("/api/items/folder", data=data, content_type="multipart/form-data")
    assert create.status_code == 201
    item = create.get_json()
    _assert_password_flags(item, protected=True, unlocked=True)

    other_client = app.test_client()
    locked = other_client.get(f"/api/items/{item['id']}/download")
    assert locked.status_code == 401

    unlock = other_client.post(f"/api/items/{item['id']}/unlock", json={"password": "folder-pass"})
    assert unlock.status_code == 204

    dl = other_client.get(f"/api/items/{item['id']}/download")
    assert dl.status_code == 200


def test_password_protected_link_hides_target_until_unlock(app: Flask, client: FlaskClient):
    create = client.post(
        "/api/items/link",
        json={
            "url": "https://example.com/secret",
            "name": "Secret doc",
            "password": "linksecret",
        },
    )
    assert create.status_code == 201
    item = create.get_json()
    item_id = item["id"]
    assert item["linkUrl"] == "https://example.com/secret"
    _assert_password_flags(item, protected=True, unlocked=True)

    other_client = app.test_client()
    locked_detail = other_client.get(f"/api/items/{item_id}")
    assert locked_detail.status_code == 200
    locked_payload = locked_detail.get_json()
    assert locked_payload["linkUrl"] is None
    _assert_password_flags(locked_payload, protected=True, unlocked=False)

    locked_public = other_client.get(f"/d/{item_id}")
    assert locked_public.status_code == 200
    assert b"Password required" in locked_public.data

    wrong = other_client.post(f"/d/{item_id}", data={"password": "wrongpass"})
    assert wrong.status_code == 401
    assert b"Invalid password" in wrong.data

    unlocked = other_client.post(f"/d/{item_id}", data={"password": "linksecret"}, follow_redirects=False)
    assert unlocked.status_code == 302
    assert unlocked.headers["Location"].endswith(f"/d/{item_id}")

    after_unlock = other_client.get(f"/d/{item_id}", follow_redirects=False)
    assert after_unlock.status_code == 302
    assert after_unlock.headers["Location"] == "https://example.com/secret"


def test_password_protected_note_hides_text_and_excerpt_until_unlock(app: Flask, client: FlaskClient):
    create = client.post(
        "/api/items/note",
        json={
            "title": "Runbook",
            "text": "Rotate tokens before deployment window.",
            "password": "note-secret",
        },
    )
    assert create.status_code == 201
    created = create.get_json()
    note_id = created["id"]
    assert created["noteText"] == "Rotate tokens before deployment window."
    assert created["noteExcerpt"] is not None
    _assert_password_flags(created, protected=True, unlocked=True)

    other_client = app.test_client()
    list_locked = other_client.get("/api/items?kind=note")
    assert list_locked.status_code == 200
    listed = list_locked.get_json()["items"][0]
    assert listed["noteText"] is None
    assert listed["noteExcerpt"] is None
    _assert_password_flags(listed, protected=True, unlocked=False)

    detail_locked = other_client.get(f"/api/items/{note_id}")
    assert detail_locked.status_code == 200
    detail_payload = detail_locked.get_json()
    assert detail_payload["noteText"] is None
    assert detail_payload["noteExcerpt"] is None
    _assert_password_flags(detail_payload, protected=True, unlocked=False)

    unlock = other_client.post(f"/api/items/{note_id}/unlock", json={"password": "note-secret"})
    assert unlock.status_code == 204

    detail_unlocked = other_client.get(f"/api/items/{note_id}")
    assert detail_unlocked.status_code == 200
    unlocked_payload = detail_unlocked.get_json()
    assert unlocked_payload["noteText"] == "Rotate tokens before deployment window."
    assert unlocked_payload["noteExcerpt"] is not None
    _assert_password_flags(unlocked_payload, protected=True, unlocked=True)


def test_protected_note_body_search_is_disabled(client: FlaskClient):
    protected = client.post(
        "/api/items/note",
        json={
            "title": "Protected checklist",
            "text": "quorum phrase should stay private",
            "password": "search-secret",
        },
    )
    assert protected.status_code == 201

    search_body = client.get("/api/items?q=quorum")
    assert search_body.status_code == 200
    assert search_body.get_json()["pagination"]["total"] == 0

    search_title = client.get("/api/items?q=Protected checklist")
    assert search_title.status_code == 200
    assert search_title.get_json()["pagination"]["total"] == 1


def test_unlock_endpoint_validation_and_idempotency(app: Flask, client: FlaskClient):
    created = client.post(
        "/api/items/link",
        json={
            "url": "https://example.com/internal",
            "password": "unlock-pass",
        },
    )
    assert created.status_code == 201
    item_id = created.get_json()["id"]

    other_client = app.test_client()
    missing = other_client.post(f"/api/items/{item_id}/unlock", json={})
    assert missing.status_code == 400
    assert "Missing 'password'" in missing.get_json()["error"]

    invalid_shape = other_client.post(f"/api/items/{item_id}/unlock", json={"password": 123})
    assert invalid_shape.status_code == 400

    unlocked = other_client.post(f"/api/items/{item_id}/unlock", json={"password": "unlock-pass"})
    assert unlocked.status_code == 204

    repeat_unlock = other_client.post(f"/api/items/{item_id}/unlock", json={"password": "unlock-pass"})
    assert repeat_unlock.status_code == 204

    unprotected = client.post("/api/items/link", json={"url": "https://example.com/plain"})
    assert unprotected.status_code == 201
    unprotected_id = unprotected.get_json()["id"]

    unprotected_unlock = other_client.post(f"/api/items/{unprotected_id}/unlock", json={"password": "anything"})
    assert unprotected_unlock.status_code == 204


def test_list_items_can_filter_by_protected_flag(client: FlaskClient):
    protected = client.post(
        "/api/items/note",
        json={"title": "Protected", "text": "secret", "password": "secretpass"},
    )
    assert protected.status_code == 201
    protected_id = protected.get_json()["id"]

    unprotected = client.post(
        "/api/items/note",
        json={"title": "Public", "text": "public"},
    )
    assert unprotected.status_code == 201
    unprotected_id = unprotected.get_json()["id"]

    only_protected = client.get("/api/items?protected=true")
    assert only_protected.status_code == 200
    protected_payload = only_protected.get_json()
    assert protected_payload["pagination"]["total"] == 1
    assert protected_payload["items"][0]["id"] == protected_id

    only_unprotected = client.get("/api/items?protected=false")
    assert only_unprotected.status_code == 200
    unprotected_payload = only_unprotected.get_json()
    assert unprotected_payload["pagination"]["total"] == 1
    assert unprotected_payload["items"][0]["id"] == unprotected_id


def test_bulk_delete_ready_to_delete_can_filter_by_protected(app: Flask, client: FlaskClient):
    protected = client.post(
        "/api/items/files",
        data={
            "password": "secretpass",
            "files": [(io.BytesIO(b"a"), "a.txt")],
        },
        content_type="multipart/form-data",
    )
    assert protected.status_code == 201
    protected_id = protected.get_json()[0]["id"]

    unprotected = client.post(
        "/api/items/files",
        data={"files": [(io.BytesIO(b"b"), "b.txt")]},
        content_type="multipart/form-data",
    )
    assert unprotected.status_code == 201
    unprotected_id = unprotected.get_json()[0]["id"]

    patch_protected = client.patch(f"/api/items/{protected_id}", json={"state": "ready_to_delete"})
    assert patch_protected.status_code == 200
    patch_unprotected = client.patch(f"/api/items/{unprotected_id}", json={"state": "ready_to_delete"})
    assert patch_unprotected.status_code == 200

    deleted_protected = client.delete("/api/items/ready-to-delete?protected=true")
    assert deleted_protected.status_code == 200
    assert deleted_protected.get_json()["deleted"] == 1

    remaining = client.get("/api/items?state=ready_to_delete")
    assert remaining.status_code == 200
    payload = remaining.get_json()
    assert payload["pagination"]["total"] == 1
    assert payload["items"][0]["id"] == unprotected_id
