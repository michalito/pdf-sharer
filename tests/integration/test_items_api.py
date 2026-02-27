import io
import zipfile
from pathlib import Path

from flask import Flask
from flask.testing import FlaskClient
from werkzeug.datastructures import MultiDict

from app import db
from app.domain.item import Item


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
