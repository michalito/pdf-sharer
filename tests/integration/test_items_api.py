import io
import zipfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

from flask import Flask
from flask.testing import FlaskClient
from werkzeug.datastructures import MultiDict

from app import create_app, db
from app.domain.item import Item


def _assert_password_flags(payload: dict, *, protected: bool, unlocked: bool):
    assert payload["isPasswordProtected"] is protected
    assert payload["isPasswordUnlocked"] is unlocked


def test_health(client: FlaskClient):
    res = client.get("/api/health")
    assert res.status_code == 200
    data = res.get_json()
    assert data["ok"] is True
    assert data["version"] == "dev"


def test_health_returns_configured_version(temp_upload_dir):
    """Version from config propagates to /api/health response."""
    from app.config import Config

    cfg = Config(
        SECRET_KEY="test",
        DATABASE_URI="sqlite:///:memory:",
        UPLOAD_FOLDER=temp_upload_dir,
        MAX_CONTENT_LENGTH=2 * 1024 * 1024 * 1024,
        SESSION_COOKIE_SECURE=False,
        APP_VERSION="1.2.3",
    )
    flask_app = create_app(cfg)
    flask_app.config["TESTING"] = True
    with flask_app.app_context():
        db.create_all()
        client = flask_app.test_client()
        res = client.get("/api/health")
        assert res.get_json()["version"] == "1.2.3"
        db.drop_all()


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
    public_text = public.get_data(as_text=True)
    assert "Shared via saíta" in public_text
    assert "Open saíta home" in public_text
    assert "/static/public-pages.css" in public_text

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


def test_json_routes_reject_non_object_body(client: FlaskClient):
    for path in ["/api/items/link", "/api/items/note"]:
        res = client.post(path, json=[1, 2])
        assert res.status_code == 400, f"{path} accepted a JSON array"
        assert "JSON object" in res.get_json()["error"]

    res = client.post("/api/items/link", json="just a string")
    assert res.status_code == 400
    assert "JSON object" in res.get_json()["error"]


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
    locked_public_text = locked_public.get_data(as_text=True)
    assert "Password required" in locked_public_text
    assert "Shared via saíta" in locked_public_text
    assert "Open saíta home" in locked_public_text
    assert "/static/public-pages.css" in locked_public_text

    wrong = other_client.post(f"/d/{item_id}", data={"password": "wrongpass"})
    assert wrong.status_code == 401
    wrong_text = wrong.get_data(as_text=True)
    assert "Invalid password" in wrong_text
    assert "Shared via saíta" in wrong_text
    assert "Open saíta home" in wrong_text
    assert "/static/public-pages.css" in wrong_text

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


def test_public_error_page_uses_shared_brand_shell(client: FlaskClient):
    missing = client.get("/d/99999999")
    assert missing.status_code == 404
    page = missing.get_data(as_text=True)
    assert "Shared via saíta" in page
    assert "Open saíta home" in page
    assert "/static/public-pages.css" in page
    assert "404" in page


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


# ── Pinned items ──────────────────────────────────────────────


def test_pin_item(app: Flask, client: FlaskClient):
    """PATCH with pinned=true pins the item."""
    upload = client.post(
        "/api/items/files",
        data={"files": [(io.BytesIO(b"x"), "pinme.txt")]},
        content_type="multipart/form-data",
    )
    item_id = upload.get_json()[0]["id"]

    res = client.patch(f"/api/items/{item_id}", json={"pinned": True})
    assert res.status_code == 200
    assert res.get_json()["isPinned"] is True

    # Unpin
    res = client.patch(f"/api/items/{item_id}", json={"pinned": False})
    assert res.status_code == 200
    assert res.get_json()["isPinned"] is False


def test_pin_invalid_type_rejected(app: Flask, client: FlaskClient):
    """PATCH with non-boolean pinned value returns 400."""
    upload = client.post(
        "/api/items/files",
        data={"files": [(io.BytesIO(b"x"), "f.txt")]},
        content_type="multipart/form-data",
    )
    item_id = upload.get_json()[0]["id"]

    res = client.patch(f"/api/items/{item_id}", json={"pinned": "yes"})
    assert res.status_code == 400


def test_pinned_items_sort_first(app: Flask, client: FlaskClient):
    """Pinned items appear before unpinned items regardless of creation order."""
    # Create two items — older first, newer second
    r1 = client.post(
        "/api/items/files",
        data={"files": [(io.BytesIO(b"a"), "older.txt")]},
        content_type="multipart/form-data",
    )
    older_id = r1.get_json()[0]["id"]

    r2 = client.post(
        "/api/items/files",
        data={"files": [(io.BytesIO(b"b"), "newer.txt")]},
        content_type="multipart/form-data",
    )
    newer_id = r2.get_json()[0]["id"]

    # Without pinning, newer comes first (created_at DESC)
    listing = client.get("/api/items").get_json()
    assert listing["items"][0]["id"] == newer_id
    assert listing["items"][1]["id"] == older_id

    # Pin the older item
    client.patch(f"/api/items/{older_id}", json={"pinned": True})

    listing = client.get("/api/items").get_json()
    assert listing["items"][0]["id"] == older_id
    assert listing["items"][0]["isPinned"] is True
    assert listing["items"][1]["id"] == newer_id


def test_pin_combined_with_state_update(app: Flask, client: FlaskClient):
    """PATCH can update pinned and state simultaneously."""
    upload = client.post(
        "/api/items/files",
        data={"files": [(io.BytesIO(b"x"), "combo.txt")]},
        content_type="multipart/form-data",
    )
    item_id = upload.get_json()[0]["id"]

    res = client.patch(f"/api/items/{item_id}", json={"pinned": True, "state": "done"})
    assert res.status_code == 200
    data = res.get_json()
    assert data["isPinned"] is True
    assert data["state"] == "done"


def test_new_items_are_not_pinned(app: Flask, client: FlaskClient):
    """Newly created items default to isPinned=false."""
    upload = client.post(
        "/api/items/files",
        data={"files": [(io.BytesIO(b"x"), "default.txt")]},
        content_type="multipart/form-data",
    )
    assert upload.get_json()[0]["isPinned"] is False

    link = client.post("/api/items/link", json={"url": "https://example.com"})
    assert link.get_json()["isPinned"] is False

    note = client.post("/api/items/note", json={"text": "hello world"})
    assert note.get_json()["isPinned"] is False


# --- TTL / Expiration Tests ---


def _parse_expires_at(iso: str) -> datetime:
    """Parse expiresAt ISO string, ensuring it is timezone-aware."""
    dt = datetime.fromisoformat(iso)
    assert dt.tzinfo is not None, "expiresAt must include timezone information"
    return dt


def test_upload_file_with_ttl(app: Flask, client: FlaskClient):
    """Upload a file with TTL and verify expiresAt is returned."""
    res = client.post(
        "/api/items/files",
        data={"files": [(io.BytesIO(b"data"), "expiring.txt")], "ttl": "1h"},
        content_type="multipart/form-data",
    )
    assert res.status_code == 201
    data = res.get_json()[0]
    assert data["expiresAt"] is not None
    expires = _parse_expires_at(data["expiresAt"])
    expected = datetime.now(timezone.utc) + timedelta(hours=1)
    assert abs((expires - expected).total_seconds()) < 5


def test_create_link_with_ttl(app: Flask, client: FlaskClient):
    """Create a link with TTL and verify expiresAt."""
    res = client.post("/api/items/link", json={"url": "https://example.com", "ttl": "24h"})
    assert res.status_code == 201
    data = res.get_json()
    assert data["expiresAt"] is not None
    expires = _parse_expires_at(data["expiresAt"])
    expected = datetime.now(timezone.utc) + timedelta(hours=24)
    assert abs((expires - expected).total_seconds()) < 5


def test_create_note_with_ttl(app: Flask, client: FlaskClient):
    """Create a note with TTL and verify expiresAt."""
    res = client.post("/api/items/note", json={"text": "temp note", "ttl": "3d"})
    assert res.status_code == 201
    data = res.get_json()
    assert data["expiresAt"] is not None
    expires = _parse_expires_at(data["expiresAt"])
    expected = datetime.now(timezone.utc) + timedelta(days=3)
    assert abs((expires - expected).total_seconds()) < 5


def test_no_ttl_means_no_expiration(app: Flask, client: FlaskClient):
    """Items without TTL have null expiresAt."""
    res = client.post(
        "/api/items/files",
        data={"files": [(io.BytesIO(b"data"), "permanent.txt")]},
        content_type="multipart/form-data",
    )
    assert res.get_json()[0]["expiresAt"] is None

    res = client.post("/api/items/link", json={"url": "https://example.com"})
    assert res.get_json()["expiresAt"] is None

    res = client.post("/api/items/note", json={"text": "forever note"})
    assert res.get_json()["expiresAt"] is None


def test_invalid_ttl_rejected(app: Flask, client: FlaskClient):
    """Invalid TTL preset returns 400."""
    res = client.post(
        "/api/items/files",
        data={"files": [(io.BytesIO(b"data"), "bad.txt")], "ttl": "2h"},
        content_type="multipart/form-data",
    )
    assert res.status_code == 400

    for invalid_ttl in ("forever", False, 0, [], {}):
        res = client.post("/api/items/link", json={"url": "https://example.com", "ttl": invalid_ttl})
        assert res.status_code == 400


def test_cleanup_expired_items_failure_does_not_poison_request_session(app: Flask, client: FlaskClient):
    """Cleanup errors should roll back DB session so request processing can continue."""
    from app.repositories.item_repository import ItemRepository
    from app.services.item_service import ItemService

    class FailingCleanupService(ItemService):
        def delete_expired_items(self, *, limit: int = 100) -> int:
            duplicate = "cleanup-duplicate.txt"
            db.session.add(
                Item(
                    stored_name=duplicate,
                    display_name="first",
                    kind="file",
                    state="active",
                    mime_type="text/plain",
                    size_bytes=1,
                )
            )
            db.session.add(
                Item(
                    stored_name=duplicate,
                    display_name="second",
                    kind="file",
                    state="active",
                    mime_type="text/plain",
                    size_bytes=1,
                )
            )
            db.session.commit()
            return 0

    app.config["ITEM_SERVICE_OVERRIDE"] = FailingCleanupService(ItemRepository())

    res = client.get("/api/items")
    assert res.status_code == 200
    assert res.get_json()["pagination"]["total"] == 0


def test_expired_item_hidden_from_list(app: Flask, client: FlaskClient):
    """Expired items do not appear in GET /api/items."""
    res = client.post("/api/items/note", json={"text": "will expire", "ttl": "1h"})
    item_id = res.get_json()["id"]

    # Manually expire the item
    with app.app_context():
        item = db.session.get(Item, item_id)
        item.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
        db.session.commit()

    listing = client.get("/api/items")
    ids = [i["id"] for i in listing.get_json()["items"]]
    assert item_id not in ids


def test_expired_item_returns_404(app: Flask, client: FlaskClient):
    """GET /api/items/<id> returns 404 for expired items."""
    res = client.post("/api/items/note", json={"text": "will expire", "ttl": "1h"})
    item_id = res.get_json()["id"]

    with app.app_context():
        item = db.session.get(Item, item_id)
        item.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
        db.session.commit()

    res = client.get(f"/api/items/{item_id}")
    assert res.status_code == 404


def test_delete_expired_item_returns_404(app: Flask, client: FlaskClient):
    """DELETE /api/items/<id> returns 404 for expired items."""
    res = client.post("/api/items/note", json={"text": "will expire", "ttl": "1h"})
    item_id = res.get_json()["id"]

    with app.app_context():
        item = db.session.get(Item, item_id)
        item.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
        db.session.commit()

    res = client.delete(f"/api/items/{item_id}")
    assert res.status_code == 404


def test_expired_item_share_link_returns_404(app: Flask, client: FlaskClient):
    """GET /d/<id> returns 404 for expired items."""
    res = client.post(
        "/api/items/files",
        data={"files": [(io.BytesIO(b"data"), "temp.txt")], "ttl": "1h"},
        content_type="multipart/form-data",
    )
    item_id = res.get_json()[0]["id"]

    with app.app_context():
        item = db.session.get(Item, item_id)
        item.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
        db.session.commit()

    res = client.get(f"/d/{item_id}")
    assert res.status_code == 404


def test_delete_expired_items(app: Flask, client: FlaskClient):
    """delete_expired_items removes items and files from disk."""
    from app.repositories.item_repository import ItemRepository
    from app.services.item_service import ItemService

    res = client.post(
        "/api/items/files",
        data={"files": [(io.BytesIO(b"data"), "expiring.txt")], "ttl": "1h"},
        content_type="multipart/form-data",
    )
    item_id = res.get_json()[0]["id"]

    with app.app_context():
        item = db.session.get(Item, item_id)
        stored_name = item.stored_name
        item.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
        db.session.commit()

        upload_folder = Path(app.config["UPLOAD_FOLDER"])
        assert (upload_folder / stored_name).exists()

        service = ItemService(ItemRepository())
        deleted = service.delete_expired_items()
        assert deleted == 1

        assert db.session.get(Item, item_id) is None
        assert not (upload_folder / stored_name).exists()


# ── Pagination edge cases ────────────────────────────────────


def _seed_items(client: FlaskClient, count: int) -> list[int]:
    """Create ``count`` file items and return their IDs."""
    ids = []
    for i in range(count):
        res = client.post(
            "/api/items/files",
            data={"files": [(io.BytesIO(f"item{i}".encode()), f"item{i}.txt")]},
            content_type="multipart/form-data",
        )
        assert res.status_code == 201
        ids.extend(item["id"] for item in res.get_json())
    return ids


def test_pagination_metadata_fields(client: FlaskClient):
    """Verify page, pages, hasNext, hasPrev are correct across pages."""
    _seed_items(client, 3)

    # All 3 items on one page (per_page=50 default)
    res = client.get("/api/items")
    p = res.get_json()["pagination"]
    assert p["total"] == 3
    assert p["page"] == 1
    assert p["pages"] == 1
    assert p["hasNext"] is False
    assert p["hasPrev"] is False

    # Split across pages
    res = client.get("/api/items?per_page=2")
    p = res.get_json()["pagination"]
    assert p["total"] == 3
    assert p["page"] == 1
    assert p["perPage"] == 2
    assert p["pages"] == 2
    assert p["hasNext"] is True
    assert p["hasPrev"] is False

    # Second page
    res = client.get("/api/items?per_page=2&page=2")
    p = res.get_json()["pagination"]
    assert p["page"] == 2
    assert p["pages"] == 2
    assert p["hasNext"] is False
    assert p["hasPrev"] is True
    assert len(res.get_json()["items"]) == 1


def test_pagination_page_beyond_total_clamps(client: FlaskClient):
    """Requesting a page beyond total pages is clamped to the last page."""
    _seed_items(client, 2)

    res = client.get("/api/items?per_page=1&page=999")
    assert res.status_code == 200
    p = res.get_json()["pagination"]
    assert p["page"] == 2  # clamped to last page
    assert p["pages"] == 2
    assert len(res.get_json()["items"]) == 1


def test_pagination_empty_result_set(client: FlaskClient):
    """Empty DB returns page 1 of 1 with no items."""
    res = client.get("/api/items")
    assert res.status_code == 200
    p = res.get_json()["pagination"]
    assert p["total"] == 0
    assert p["page"] == 1
    assert p["pages"] == 1
    assert p["hasNext"] is False
    assert p["hasPrev"] is False
    assert res.get_json()["items"] == []


def test_pagination_rejects_negative_page(client: FlaskClient):
    """Negative page values return 400."""
    res = client.get("/api/items?page=-1")
    assert res.status_code == 400
    assert "page" in res.get_json()["error"].lower()


def test_pagination_rejects_zero_page(client: FlaskClient):
    """page=0 returns 400."""
    res = client.get("/api/items?page=0")
    assert res.status_code == 400


def test_pagination_rejects_zero_per_page(client: FlaskClient):
    """per_page=0 returns 400."""
    res = client.get("/api/items?per_page=0")
    assert res.status_code == 400


def test_pagination_rejects_negative_per_page(client: FlaskClient):
    """per_page=-5 returns 400."""
    res = client.get("/api/items?per_page=-5")
    assert res.status_code == 400
    assert "per_page" in res.get_json()["error"].lower()


def test_pagination_rejects_excessive_per_page(client: FlaskClient):
    """per_page exceeding MAX_PER_PAGE returns 400."""
    res = client.get("/api/items?per_page=201")
    assert res.status_code == 400
    assert "per_page" in res.get_json()["error"].lower()


def test_pagination_rejects_non_numeric_values(client: FlaskClient):
    """Non-numeric page/per_page values return 400."""
    res = client.get("/api/items?page=abc")
    assert res.status_code == 400

    res = client.get("/api/items?per_page=xyz")
    assert res.status_code == 400


def test_pagination_per_page_boundary(client: FlaskClient):
    """per_page=200 (MAX_PER_PAGE) is accepted, 201 is not."""
    res = client.get("/api/items?per_page=200")
    assert res.status_code == 200
    assert res.get_json()["pagination"]["perPage"] == 200

    res = client.get("/api/items?per_page=201")
    assert res.status_code == 400
