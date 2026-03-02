import io
from datetime import datetime, timedelta, timezone

from flask import Flask
from flask.testing import FlaskClient

from app import db
from app.domain.item import Item


def test_storage_empty_db(client: FlaskClient):
    """Stats endpoint returns zeroes with no items."""
    res = client.get("/api/storage")
    assert res.status_code == 200
    data = res.get_json()

    assert data["items"]["totalCount"] == 0
    assert data["items"]["totalSizeBytes"] == 0
    assert data["items"]["countByKind"]["file"] == 0
    assert data["items"]["countByKind"]["folder"] == 0
    assert data["items"]["countByKind"]["link"] == 0
    assert data["items"]["countByKind"]["note"] == 0
    assert data["items"]["countByState"]["active"] == 0
    assert data["items"]["countByState"]["done"] == 0
    assert data["items"]["countByState"]["archived"] == 0
    assert data["items"]["countByState"]["ready_to_delete"] == 0
    assert data["items"]["sizeByState"]["active"] == 0
    assert data["items"]["sizeByState"]["done"] == 0
    assert data["items"]["sizeByState"]["archived"] == 0
    assert data["items"]["sizeByState"]["ready_to_delete"] == 0
    assert data["spaceStats"] == []
    assert data["largestItems"] == []

    # disk should be non-null since upload folder exists (temp dir in tests)
    assert data["disk"] is not None
    assert data["disk"]["totalBytes"] > 0
    assert data["disk"]["freeBytes"] > 0


def test_storage_with_mixed_items(client: FlaskClient):
    """Stats reflect uploaded files, links, and notes."""
    # Upload two files
    client.post(
        "/api/items/files",
        data={
            "files": [
                (io.BytesIO(b"a" * 1000), "big.bin"),
                (io.BytesIO(b"b" * 500), "small.bin"),
            ]
        },
        content_type="multipart/form-data",
    )

    # Create a link
    client.post("/api/items/link", json={"url": "https://example.com"})

    # Create a note
    client.post("/api/items/note", json={"text": "Hello world test note"})

    res = client.get("/api/storage")
    data = res.get_json()

    assert data["items"]["totalCount"] == 4
    assert data["items"]["countByKind"]["file"] == 2
    assert data["items"]["countByKind"]["link"] == 1
    assert data["items"]["countByKind"]["note"] == 1
    assert data["items"]["countByKind"]["folder"] == 0
    assert data["items"]["sizeByKind"]["file"] == 1500
    assert data["items"]["totalSizeBytes"] > 0

    # Only file/folder items appear in largestItems
    assert len(data["largestItems"]) == 2
    assert data["largestItems"][0]["sizeBytes"] >= data["largestItems"][1]["sizeBytes"]
    assert data["largestItems"][0]["name"] == "big.bin"


def test_storage_largest_items_have_space_name(app: Flask, client: FlaskClient):
    """Largest items include space name when assigned."""
    # Create a space
    res = client.post("/api/spaces", json={"name": "Test Space"})
    space_id = res.get_json()["id"]

    # Upload a file into the space
    client.post(
        "/api/items/files",
        data={
            "files": [(io.BytesIO(b"x" * 100), "test.txt")],
            "space_id": str(space_id),
        },
        content_type="multipart/form-data",
    )

    res = client.get("/api/storage")
    data = res.get_json()

    assert len(data["largestItems"]) == 1
    assert data["largestItems"][0]["spaceName"] == "Test Space"


def test_storage_excludes_expired_items(app: Flask, client: FlaskClient):
    """Expired items are hidden from storage stats immediately."""
    res = client.post(
        "/api/items/files",
        data={"files": [(io.BytesIO(b"x" * 100), "temp.txt")], "ttl": "1h"},
        content_type="multipart/form-data",
    )
    item_id = res.get_json()[0]["id"]

    with app.app_context():
        item = db.session.get(Item, item_id)
        item.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
        db.session.commit()

    stats = client.get("/api/storage").get_json()
    assert stats["items"]["totalCount"] == 0
    assert stats["items"]["countByKind"]["file"] == 0
    assert stats["largestItems"] == []


def test_storage_count_by_state(client: FlaskClient):
    """State breakdown reflects state transitions."""
    # Upload a file
    res = client.post(
        "/api/items/files",
        data={"files": [(io.BytesIO(b"x"), "test.txt")]},
        content_type="multipart/form-data",
    )
    item_id = res.get_json()[0]["id"]

    # Move to done
    client.patch(f"/api/items/{item_id}", json={"state": "done"})

    res = client.get("/api/storage")
    data = res.get_json()

    assert data["items"]["countByState"]["done"] == 1
    assert data["items"]["countByState"]["active"] == 0
    assert data["items"]["sizeByState"]["done"] > 0
    assert data["items"]["sizeByState"]["active"] == 0


def test_storage_disk_failure_graceful(app: Flask, client: FlaskClient):
    """When UPLOAD_FOLDER is invalid, disk is null but stats still return."""
    app.config["UPLOAD_FOLDER"] = "/nonexistent/path/that/will/fail"

    res = client.get("/api/storage")
    assert res.status_code == 200
    data = res.get_json()

    assert data["disk"] is None
    # Item stats should still work
    assert data["items"]["totalCount"] == 0


def test_storage_space_stats(client: FlaskClient):
    """Space stats show size breakdown per space including unspaced."""
    s1 = client.post("/api/spaces", json={"name": "Alpha"}).get_json()
    s2 = client.post("/api/spaces", json={"name": "Beta"}).get_json()

    # Upload files into different spaces and one unspaced
    client.post(
        "/api/items/files",
        data={
            "files": [(io.BytesIO(b"a" * 1000), "alpha.bin")],
            "space_id": str(s1["id"]),
        },
        content_type="multipart/form-data",
    )
    client.post(
        "/api/items/files",
        data={
            "files": [(io.BytesIO(b"b" * 2000), "beta.bin")],
            "space_id": str(s2["id"]),
        },
        content_type="multipart/form-data",
    )
    client.post(
        "/api/items/files",
        data={"files": [(io.BytesIO(b"c" * 500), "loose.bin")]},
        content_type="multipart/form-data",
    )

    res = client.get("/api/storage")
    data = res.get_json()

    space_stats = data["spaceStats"]
    assert len(space_stats) == 3

    # Sorted by size descending
    assert space_stats[0]["sizeBytes"] >= space_stats[1]["sizeBytes"]
    assert space_stats[1]["sizeBytes"] >= space_stats[2]["sizeBytes"]

    names = {ss["spaceName"] for ss in space_stats}
    assert names == {"Alpha", "Beta", "Unspaced"}


def test_storage_space_stats_empty_when_no_items(client: FlaskClient):
    """Space stats is empty when there are no items, even if spaces exist."""
    client.post("/api/spaces", json={"name": "Empty"})

    res = client.get("/api/storage")
    data = res.get_json()
    assert data["spaceStats"] == []
