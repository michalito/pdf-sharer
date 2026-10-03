"""Regression coverage for storage lifecycle, query scaling, and validation."""

from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
from threading import Event
import sqlite3
import zipfile

import pytest
from sqlalchemy import event

from app import db
from app.domain.item import Item
from app.domain.space import Space
from app.repositories.item_repository import ItemRepository
from app.repositories.space_repository import SpaceRepository


@pytest.mark.parametrize("needle", ["%", "_", "\\"])
def test_search_and_bulk_delete_treat_wildcards_as_literal(client, needle):
    matches = []
    for text, title in [("body", f"name {needle}"), (f"body {needle}", "note"), ("unrelated", "other")]:
        response = client.post("/api/items/note", json={"text": text, "title": title})
        assert response.status_code == 201
        item_id = response.json["id"]
        client.patch(f"/api/items/{item_id}", json={"state": "ready_to_delete"})
        matches.append(item_id)
    found = client.get("/api/items", query_string={"q": needle})
    assert {item["id"] for item in found.json["items"]} == set(matches[:2])
    deleted = client.delete("/api/items/ready-to-delete", query_string={"q": needle})
    assert deleted.json == {"deleted": 2}
    assert client.get(f"/api/items/{matches[2]}").status_code == 200


def test_upload_limit_returns_413_json(app, client):
    app.config["MAX_CONTENT_LENGTH"] = 100
    response = client.post("/api/items/files", data={"files": (BytesIO(b"x" * 200), "large.txt")})
    assert response.status_code == 413
    assert response.is_json
    assert response.json["error"]
    assert response.headers["X-Request-ID"]


@pytest.mark.parametrize("url", ["https://[broken", "https://:80/path", "https://host:bad", "https://host:70000", "https://host/\x00path"])
def test_malformed_links_are_rejected(client, url):
    assert client.post("/api/items/link", json={"url": url}).status_code == 400
    assert client.get("/api/items").json["pagination"]["total"] == 0


@pytest.mark.parametrize("model,repository", [(Item, ItemRepository), (Space, SpaceRepository)])
def test_reordering_stays_within_sqlite_parameter_limit(app, model, repository):
    if model is Item:
        db.session.add_all([
            Item(stored_name=f"{i}.note", display_name=str(i), kind="note", position=i)
            for i in range(400)
        ])
    else:
        db.session.add_all([Space(name=str(i), normalized_name=str(i), position=i) for i in range(400)])
    db.session.commit()
    ids = [row[0] for row in db.session.query(model.id).order_by(model.id.desc()).all()]
    connection = db.session.connection().connection.driver_connection
    previous_limit = connection.setlimit(sqlite3.SQLITE_LIMIT_VARIABLE_NUMBER, 999)
    try:
        repository().reorder(ids)
        assert [row[0] for row in db.session.query(model.id).order_by(model.position).all()] == ids
    finally:
        connection.setlimit(sqlite3.SQLITE_LIMIT_VARIABLE_NUMBER, previous_limit)


def test_deleting_space_does_not_load_item_bodies(app, client):
    space_id = client.post("/api/spaces", json={"name": "Large"}).json["id"]
    item_id = client.post("/api/items/note", json={"text": "large body", "spaceId": space_id}).json["id"]
    statements = []
    def capture(_conn, _cursor, statement, _params, _context, _many):
        statements.append(statement)
    event.listen(db.engine, "before_cursor_execute", capture)
    try:
        assert client.delete(f"/api/spaces/{space_id}").json == {"unassigned": 1}
    finally:
        event.remove(db.engine, "before_cursor_execute", capture)
    assert not any(s.lstrip().upper().startswith("SELECT") and "items.meta_json" in s for s in statements)
    assert client.get(f"/api/items/{item_id}").json["spaceId"] is None


def test_pruning_waits_for_upload_commit(app, monkeypatch, temp_upload_dir):
    import app.services.item_service as service_module
    import app.utils.upload_lock as lock_module

    upload_saved = Event()
    release_upload = Event()
    pruning_started = Event()
    original_hash = service_module.hash_file
    original_flock = lock_module.fcntl.flock

    def paused_hash(path):
        upload_saved.set()
        assert release_upload.wait(5)
        return original_hash(path)

    def observed_flock(descriptor, operation):
        if operation == lock_module.fcntl.LOCK_EX:
            pruning_started.set()
        return original_flock(descriptor, operation)

    monkeypatch.setattr(service_module, "hash_file", paused_hash)
    monkeypatch.setattr(lock_module.fcntl, "flock", observed_flock)
    orphan = temp_upload_dir / "orphan.txt"
    orphan.write_text("orphan")

    def upload():
        with app.test_client() as client:
            return client.post("/api/items/files", data={"files": (BytesIO(b"keep me"), "file.txt")})

    with ThreadPoolExecutor(max_workers=2) as pool:
        upload_future = pool.submit(upload)
        try:
            assert upload_saved.wait(5)
            prune_future = pool.submit(app.test_cli_runner().invoke, args=["prune-orphans"])
            assert pruning_started.wait(5)
            assert not prune_future.done()
        finally:
            release_upload.set()
        response = upload_future.result(timeout=5)
        assert response.status_code == 201
        prune_result = prune_future.result(timeout=5)
        assert prune_result.exit_code == 0, prune_result.output
    assert not orphan.exists()
    with app.test_client() as client:
        download = client.get(f"/api/items/{response.json[0]['id']}/download")
        assert download.status_code == 200
        assert download.data == b"keep me"


def test_folder_upload_supports_zip64_without_buffering(app, client, monkeypatch):
    monkeypatch.setattr(zipfile, "ZIP64_LIMIT", 100)
    response = client.post("/api/items/folder", data={
        "files": (BytesIO(b"data" * 100), "large.txt"),
        "paths": "folder/large.txt",
    })
    assert response.status_code == 201
    download = client.get(f"/api/items/{response.json['id']}/download")
    with zipfile.ZipFile(BytesIO(download.data)) as archive:
        assert archive.read("folder/large.txt") == b"data" * 100


@pytest.mark.parametrize("kind", ["note", "files", "patch"])
def test_space_deleted_after_validation_cannot_leave_dangling_items(app, client, monkeypatch, temp_upload_dir, kind):
    import app.api.routes as routes
    space_id = client.post("/api/spaces", json={"name": "Temporary"}).json["id"]
    item_id = client.post("/api/items/note", json={"text": "existing"}).json["id"]
    validate = routes._validate_space_id

    def delete_after_validation(value):
        validate(value)
        SpaceRepository().delete(db.session.get(Space, value))

    monkeypatch.setattr(routes, "_validate_space_id", delete_after_validation)
    if kind == "files":
        response = client.post("/api/items/files", data={"files": (BytesIO(b"data"), "file.txt"), "space_id": str(space_id)})
    elif kind == "note":
        response = client.post("/api/items/note", json={"text": "new", "spaceId": space_id})
    else:
        response = client.patch(f"/api/items/{item_id}", json={"spaceId": space_id})
    assert response.status_code == 409
    assert client.get(f"/api/items/{item_id}").json["spaceId"] is None
    assert client.get("/api/items").json["pagination"]["total"] == 1
    assert list(temp_upload_dir.iterdir()) == []


def test_bulk_delete_does_not_fetch_note_bodies(app, client):
    item = client.post("/api/items/note", json={"text": "body"}).json
    client.patch(f"/api/items/{item['id']}", json={"state": "ready_to_delete"})
    statements = []
    def capture(_conn, _cursor, statement, _params, _context, _many):
        statements.append(statement)
    event.listen(db.engine, "before_cursor_execute", capture)
    try:
        assert client.delete("/api/items/ready-to-delete").json == {"deleted": 1}
    finally:
        event.remove(db.engine, "before_cursor_execute", capture)
    assert not any(s.lstrip().upper().startswith("SELECT") and "items.meta_json" in s for s in statements)


@pytest.mark.parametrize("bulk", [False, True])
def test_deletion_rechecks_state_after_concurrent_restore(app, client, monkeypatch, bulk):
    item = client.post("/api/items/files", data={"files": (BytesIO(b"keep"), "file.txt")}).json[0]
    item_id = item["id"]
    client.patch(f"/api/items/{item_id}", json={"state": "ready_to_delete"})
    method = "delete_many" if bulk else "delete"
    original = getattr(ItemRepository, method)

    def restore_then_delete(repository, selected):
        db.session.query(Item).filter(Item.id == item_id).update({"state": "active"}, synchronize_session=False)
        db.session.commit()
        return original(repository, selected)

    monkeypatch.setattr(ItemRepository, method, restore_then_delete)
    response = client.delete("/api/items/ready-to-delete" if bulk else f"/api/items/{item_id}")
    if bulk:
        assert response.json == {"deleted": 0}
    else:
        assert response.status_code == 400
    assert client.get(f"/api/items/{item_id}").json["state"] == "active"
    assert client.get(f"/api/items/{item_id}/download").data == b"keep"


def test_bulk_deletion_stays_within_sqlite_parameter_limit(app):
    db.session.add_all([
        Item(stored_name=f"{i}.note", display_name=str(i), kind="note", state="ready_to_delete")
        for i in range(1200)
    ])
    db.session.commit()
    items = Item.query.all()
    connection = db.session.connection().connection.driver_connection
    previous_limit = connection.setlimit(sqlite3.SQLITE_LIMIT_VARIABLE_NUMBER, 999)
    try:
        assert len(ItemRepository().delete_many(items)) == 1200
        assert Item.query.count() == 0
    finally:
        connection.setlimit(sqlite3.SQLITE_LIMIT_VARIABLE_NUMBER, previous_limit)
