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
