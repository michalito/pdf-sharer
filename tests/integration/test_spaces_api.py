"""Integration tests for Spaces API."""

import io

from flask import Flask
from flask.testing import FlaskClient


def test_list_spaces_empty(client: FlaskClient):
    res = client.get("/api/spaces")
    assert res.status_code == 200
    assert res.get_json() == []


def test_create_space(client: FlaskClient):
    res = client.post("/api/spaces", json={"name": "My space"})
    assert res.status_code == 201
    data = res.get_json()
    assert data["name"] == "My space"
    assert data["itemCount"] == 0
    assert "id" in data
    assert "createdAt" in data


def test_create_space_validation(client: FlaskClient):
    res = client.post("/api/spaces", json={"name": ""})
    assert res.status_code == 400

    res = client.post("/api/spaces", json={})
    assert res.status_code == 400

    res = client.post("/api/spaces", json={"name": "  "})
    assert res.status_code == 400


def test_create_space_rejects_non_object_json(client: FlaskClient):
    res = client.post("/api/spaces", json=[1, 2, 3])
    assert res.status_code == 400
    assert "JSON object" in res.get_json()["error"]

    res = client.post("/api/spaces", json="just a string")
    assert res.status_code == 400
    assert "JSON object" in res.get_json()["error"]


def test_rename_space_rejects_non_object_json(client: FlaskClient):
    space = client.post("/api/spaces", json={"name": "Test"}).get_json()
    res = client.patch(f"/api/spaces/{space['id']}", json=[1])
    assert res.status_code == 400
    assert "JSON object" in res.get_json()["error"]


def test_create_space_duplicate(client: FlaskClient):
    client.post("/api/spaces", json={"name": "Alpha"})
    res = client.post("/api/spaces", json={"name": "alpha"})
    assert res.status_code == 400


def test_create_space_normalizes_whitespace(client: FlaskClient):
    res = client.post("/api/spaces", json={"name": "  Ops   Team  "})
    assert res.status_code == 201
    assert res.get_json()["name"] == "Ops Team"

    # Case-folded duplicate is rejected even with different whitespace
    dup = client.post("/api/spaces", json={"name": "ops team"})
    assert dup.status_code == 400


def test_list_spaces_with_item_counts(client: FlaskClient):
    space = client.post("/api/spaces", json={"name": "Docs"}).get_json()

    client.post(
        "/api/items/files",
        data={"files": (io.BytesIO(b"hello"), "hello.txt"), "space_id": str(space["id"])},
        content_type="multipart/form-data",
    )

    res = client.get("/api/spaces")
    spaces = res.get_json()
    assert len(spaces) == 1
    assert spaces[0]["name"] == "Docs"
    assert spaces[0]["itemCount"] == 1


def test_rename_space(client: FlaskClient):
    space = client.post("/api/spaces", json={"name": "Old name"}).get_json()
    res = client.patch(f"/api/spaces/{space['id']}", json={"name": "New name"})
    assert res.status_code == 200
    assert res.get_json()["name"] == "New name"


def test_rename_space_duplicate(client: FlaskClient):
    client.post("/api/spaces", json={"name": "Alpha"})
    space_b = client.post("/api/spaces", json={"name": "Beta"}).get_json()
    res = client.patch(f"/api/spaces/{space_b['id']}", json={"name": "Alpha"})
    assert res.status_code == 400


def test_delete_space(client: FlaskClient):
    space = client.post("/api/spaces", json={"name": "Temp"}).get_json()
    res = client.delete(f"/api/spaces/{space['id']}")
    assert res.status_code == 200
    assert res.get_json() == {"unassigned": 0}

    list_res = client.get("/api/spaces")
    assert list_res.get_json() == []


def test_delete_space_items_become_unspaced(app: Flask, client: FlaskClient):
    space = client.post("/api/spaces", json={"name": "Docs"}).get_json()

    item = client.post(
        "/api/items/files",
        data={"files": (io.BytesIO(b"hello"), "hello.txt"), "space_id": str(space["id"])},
        content_type="multipart/form-data",
    ).get_json()[0]
    assert item["spaceId"] == space["id"]

    res = client.delete(f"/api/spaces/{space['id']}")
    assert res.status_code == 200
    assert res.get_json() == {"unassigned": 1}

    item_after = client.get(f"/api/items/{item['id']}").get_json()
    assert item_after["spaceId"] is None
    assert item_after["spaceName"] is None


def test_delete_space_not_found(client: FlaskClient):
    res = client.delete("/api/spaces/999")
    assert res.status_code == 404


def test_assign_item_to_space_via_patch(client: FlaskClient):
    space = client.post("/api/spaces", json={"name": "Work"}).get_json()

    items = client.post(
        "/api/items/files",
        data={"files": (io.BytesIO(b"x"), "file.txt")},
        content_type="multipart/form-data",
    ).get_json()
    item_id = items[0]["id"]

    res = client.patch(f"/api/items/{item_id}", json={"spaceId": space["id"]})
    assert res.status_code == 200
    assert res.get_json()["spaceId"] == space["id"]


def test_unassign_item_from_space(client: FlaskClient):
    space = client.post("/api/spaces", json={"name": "Work"}).get_json()

    items = client.post(
        "/api/items/files",
        data={"files": (io.BytesIO(b"x"), "file.txt"), "space_id": str(space["id"])},
        content_type="multipart/form-data",
    ).get_json()
    item_id = items[0]["id"]

    res = client.patch(f"/api/items/{item_id}", json={"spaceId": None})
    assert res.status_code == 200
    assert res.get_json()["spaceId"] is None


def test_patch_item_state_and_space(client: FlaskClient):
    space = client.post("/api/spaces", json={"name": "Work"}).get_json()

    items = client.post(
        "/api/items/files",
        data={"files": (io.BytesIO(b"x"), "file.txt")},
        content_type="multipart/form-data",
    ).get_json()
    item_id = items[0]["id"]

    res = client.patch(f"/api/items/{item_id}", json={"state": "done", "spaceId": space["id"]})
    assert res.status_code == 200
    data = res.get_json()
    assert data["state"] == "done"
    assert data["spaceId"] == space["id"]


def test_filter_items_by_space(client: FlaskClient):
    space_a = client.post("/api/spaces", json={"name": "Alpha"}).get_json()
    space_b = client.post("/api/spaces", json={"name": "Beta"}).get_json()

    client.post(
        "/api/items/files",
        data={"files": (io.BytesIO(b"a"), "a.txt"), "space_id": str(space_a["id"])},
        content_type="multipart/form-data",
    )
    client.post(
        "/api/items/files",
        data={"files": (io.BytesIO(b"b"), "b.txt"), "space_id": str(space_b["id"])},
        content_type="multipart/form-data",
    )
    client.post(
        "/api/items/files",
        data={"files": (io.BytesIO(b"c"), "c.txt")},
        content_type="multipart/form-data",
    )

    all_res = client.get("/api/items")
    assert all_res.get_json()["pagination"]["total"] == 3

    a_res = client.get(f"/api/items?space={space_a['id']}")
    assert a_res.get_json()["pagination"]["total"] == 1

    b_res = client.get(f"/api/items?space={space_b['id']}")
    assert b_res.get_json()["pagination"]["total"] == 1

    none_res = client.get("/api/items?space=none")
    assert none_res.get_json()["pagination"]["total"] == 1


def test_upload_files_with_space(client: FlaskClient):
    space = client.post("/api/spaces", json={"name": "Uploads"}).get_json()

    res = client.post(
        "/api/items/files",
        data={"files": (io.BytesIO(b"x"), "file.txt"), "space_id": str(space["id"])},
        content_type="multipart/form-data",
    )
    assert res.status_code == 201
    assert res.get_json()[0]["spaceId"] == space["id"]


def test_upload_folder_with_space(client: FlaskClient):
    space = client.post("/api/spaces", json={"name": "Folders"}).get_json()

    res = client.post(
        "/api/items/folder",
        data={
            "files": (io.BytesIO(b"x"), "a.txt"),
            "paths": "mydir/a.txt",
            "space_id": str(space["id"]),
        },
        content_type="multipart/form-data",
    )
    assert res.status_code == 201
    assert res.get_json()["spaceId"] == space["id"]


def test_create_link_with_space(client: FlaskClient):
    space = client.post("/api/spaces", json={"name": "Links"}).get_json()

    res = client.post(
        "/api/items/link",
        json={"url": "https://example.com", "spaceId": space["id"]},
    )
    assert res.status_code == 201
    assert res.get_json()["spaceId"] == space["id"]


def test_create_note_with_space(client: FlaskClient):
    space = client.post("/api/spaces", json={"name": "Notes"}).get_json()

    res = client.post(
        "/api/items/note",
        json={"text": "Hello world", "spaceId": space["id"]},
    )
    assert res.status_code == 201
    assert res.get_json()["spaceId"] == space["id"]


def test_item_dto_includes_space_id_and_space_name(client: FlaskClient):
    # Unspaced item
    items = client.post(
        "/api/items/files",
        data={"files": (io.BytesIO(b"x"), "file.txt")},
        content_type="multipart/form-data",
    ).get_json()

    assert items[0]["spaceId"] is None
    assert items[0]["spaceName"] is None

    detail = client.get(f"/api/items/{items[0]['id']}").get_json()
    assert detail["spaceId"] is None
    assert detail["spaceName"] is None

    # Item with space
    space = client.post("/api/spaces", json={"name": "Docs"}).get_json()
    spaced_items = client.post(
        "/api/items/files",
        data={"files": (io.BytesIO(b"y"), "doc.txt"), "space_id": str(space["id"])},
        content_type="multipart/form-data",
    ).get_json()

    assert spaced_items[0]["spaceId"] == space["id"]
    assert spaced_items[0]["spaceName"] == "Docs"


def test_spaces_ordered_by_position(client: FlaskClient):
    """New spaces get ascending positions; list returns by position order."""
    client.post("/api/spaces", json={"name": "Zebra"})
    client.post("/api/spaces", json={"name": "alpha"})
    client.post("/api/spaces", json={"name": "Beta"})

    spaces = client.get("/api/spaces").get_json()
    names = [s["name"] for s in spaces]
    # Ordered by creation position (0, 1, 2), not alphabetically
    assert names == ["Zebra", "alpha", "Beta"]
    assert spaces[0]["position"] == 0
    assert spaces[1]["position"] == 1
    assert spaces[2]["position"] == 2


def test_reorder_spaces(client: FlaskClient):
    s1 = client.post("/api/spaces", json={"name": "First"}).get_json()
    s2 = client.post("/api/spaces", json={"name": "Second"}).get_json()
    s3 = client.post("/api/spaces", json={"name": "Third"}).get_json()

    # Reverse the order
    res = client.put(
        "/api/spaces/reorder",
        json={"orderedIds": [s3["id"], s2["id"], s1["id"]]},
    )
    assert res.status_code == 200

    spaces = client.get("/api/spaces").get_json()
    names = [s["name"] for s in spaces]
    assert names == ["Third", "Second", "First"]


def test_reorder_spaces_invalid_ids(client: FlaskClient):
    client.post("/api/spaces", json={"name": "Only"})

    res = client.put(
        "/api/spaces/reorder",
        json={"orderedIds": [999]},
    )
    assert res.status_code == 400
    assert "unknown IDs" in res.get_json()["error"]


def test_reorder_spaces_validation(client: FlaskClient):
    res = client.put("/api/spaces/reorder", json={"orderedIds": "bad"})
    assert res.status_code == 400

    res = client.put("/api/spaces/reorder", json={})
    assert res.status_code == 400


def test_reorder_rejects_booleans(client: FlaskClient):
    """bool is a subclass of int in Python; ensure booleans are rejected."""
    res = client.put("/api/spaces/reorder", json={"orderedIds": [True, False]})
    assert res.status_code == 400


def test_reorder_rejects_partial_ids(client: FlaskClient):
    """orderedIds must include ALL space IDs, not a subset."""
    s1 = client.post("/api/spaces", json={"name": "A"}).get_json()
    client.post("/api/spaces", json={"name": "B"})

    res = client.put("/api/spaces/reorder", json={"orderedIds": [s1["id"]]})
    assert res.status_code == 400
    assert "missing IDs" in res.get_json()["error"]


def test_reorder_rejects_duplicate_ids(client: FlaskClient):
    s1 = client.post("/api/spaces", json={"name": "A"}).get_json()
    client.post("/api/spaces", json={"name": "B"})

    res = client.put(
        "/api/spaces/reorder",
        json={"orderedIds": [s1["id"], s1["id"]]},
    )
    assert res.status_code == 400
    assert "duplicates" in res.get_json()["error"]


def test_new_space_appended_to_end(client: FlaskClient):
    s1 = client.post("/api/spaces", json={"name": "First"}).get_json()
    s2 = client.post("/api/spaces", json={"name": "Second"}).get_json()

    # Reorder: swap them
    client.put(
        "/api/spaces/reorder",
        json={"orderedIds": [s2["id"], s1["id"]]},
    )

    # Create a new space — should appear at the end
    client.post("/api/spaces", json={"name": "Third"})

    spaces = client.get("/api/spaces").get_json()
    names = [s["name"] for s in spaces]
    assert names == ["Second", "First", "Third"]


# --- Regression tests: atomic PATCH, space validation, boolean rejection ---


def test_patch_state_and_invalid_space_is_atomic(client: FlaskClient):
    """PATCH with valid state + nonexistent spaceId must not persist the state change."""
    items = client.post(
        "/api/items/files",
        data={"files": (io.BytesIO(b"x"), "file.txt")},
        content_type="multipart/form-data",
    ).get_json()
    item_id = items[0]["id"]

    res = client.patch(
        f"/api/items/{item_id}",
        json={"state": "done", "spaceId": 999},
    )
    assert res.status_code == 404

    # State must still be "active" — the write should have been rolled back
    item = client.get(f"/api/items/{item_id}").get_json()
    assert item["state"] == "active"


def test_upload_files_with_nonexistent_space(client: FlaskClient):
    res = client.post(
        "/api/items/files",
        data={"files": (io.BytesIO(b"x"), "file.txt"), "space_id": "999"},
        content_type="multipart/form-data",
    )
    assert res.status_code == 404


def test_upload_folder_with_nonexistent_space(client: FlaskClient):
    res = client.post(
        "/api/items/folder",
        data={
            "files": (io.BytesIO(b"x"), "a.txt"),
            "paths": "mydir/a.txt",
            "space_id": "999",
        },
        content_type="multipart/form-data",
    )
    assert res.status_code == 404


def test_create_link_with_nonexistent_space(client: FlaskClient):
    res = client.post(
        "/api/items/link",
        json={"url": "https://example.com", "spaceId": 999},
    )
    assert res.status_code == 404


def test_create_note_with_nonexistent_space(client: FlaskClient):
    res = client.post(
        "/api/items/note",
        json={"text": "Hello world", "spaceId": 999},
    )
    assert res.status_code == 404


def test_patch_space_id_rejects_boolean(client: FlaskClient):
    items = client.post(
        "/api/items/files",
        data={"files": (io.BytesIO(b"x"), "file.txt")},
        content_type="multipart/form-data",
    ).get_json()
    item_id = items[0]["id"]

    res = client.patch(f"/api/items/{item_id}", json={"spaceId": True})
    assert res.status_code == 400

    res = client.patch(f"/api/items/{item_id}", json={"spaceId": False})
    assert res.status_code == 400


def test_create_link_space_id_rejects_boolean(client: FlaskClient):
    res = client.post(
        "/api/items/link",
        json={"url": "https://example.com", "spaceId": True},
    )
    assert res.status_code == 400


def test_create_note_space_id_rejects_boolean(client: FlaskClient):
    res = client.post(
        "/api/items/note",
        json={"text": "Hello world", "spaceId": True},
    )
    assert res.status_code == 400


def test_patch_space_id_rejects_float(client: FlaskClient):
    items = client.post(
        "/api/items/files",
        data={"files": (io.BytesIO(b"x"), "file.txt")},
        content_type="multipart/form-data",
    ).get_json()
    item_id = items[0]["id"]

    res = client.patch(f"/api/items/{item_id}", json={"spaceId": 1.1})
    assert res.status_code == 400


def test_create_link_space_id_rejects_float(client: FlaskClient):
    res = client.post(
        "/api/items/link",
        json={"url": "https://example.com", "spaceId": 1.1},
    )
    assert res.status_code == 400


def test_create_note_space_id_rejects_float(client: FlaskClient):
    res = client.post(
        "/api/items/note",
        json={"text": "Hello world", "spaceId": 1.1},
    )
    assert res.status_code == 400


# --- Positive integer validation ---


def test_filter_items_rejects_negative_space(client: FlaskClient):
    res = client.get("/api/items?space=-1")
    assert res.status_code == 400

    res = client.get("/api/items?space=0")
    assert res.status_code == 400


def test_patch_item_rejects_negative_space_id(client: FlaskClient):
    items = client.post(
        "/api/items/files",
        data={"files": (io.BytesIO(b"x"), "file.txt")},
        content_type="multipart/form-data",
    ).get_json()

    res = client.patch(f"/api/items/{items[0]['id']}", json={"spaceId": -1})
    assert res.status_code == 400

    res = client.patch(f"/api/items/{items[0]['id']}", json={"spaceId": 0})
    assert res.status_code == 400


def test_upload_files_rejects_zero_space_id(client: FlaskClient):
    res = client.post(
        "/api/items/files",
        data={"files": (io.BytesIO(b"x"), "file.txt"), "space_id": "0"},
        content_type="multipart/form-data",
    )
    assert res.status_code == 400


# --- Bulk delete filtering by space ---


def test_bulk_delete_filters_by_space(client: FlaskClient):
    space_a = client.post("/api/spaces", json={"name": "Alpha"}).get_json()
    space_b = client.post("/api/spaces", json={"name": "Beta"}).get_json()

    # Create items in different spaces and mark them ready_to_delete
    item_a = client.post(
        "/api/items/files",
        data={"files": (io.BytesIO(b"a"), "a.txt"), "space_id": str(space_a["id"])},
        content_type="multipart/form-data",
    ).get_json()[0]
    item_b = client.post(
        "/api/items/files",
        data={"files": (io.BytesIO(b"b"), "b.txt"), "space_id": str(space_b["id"])},
        content_type="multipart/form-data",
    ).get_json()[0]
    item_none = client.post(
        "/api/items/files",
        data={"files": (io.BytesIO(b"c"), "c.txt")},
        content_type="multipart/form-data",
    ).get_json()[0]

    for item in [item_a, item_b, item_none]:
        client.patch(f"/api/items/{item['id']}", json={"state": "ready_to_delete"})

    # Bulk delete only space A
    res = client.delete(f"/api/items/ready-to-delete?space={space_a['id']}")
    assert res.status_code == 200
    assert res.get_json()["deleted"] == 1

    # Space B and unspaced items remain
    remaining = client.get("/api/items?state=ready_to_delete")
    assert remaining.get_json()["pagination"]["total"] == 2

    # Bulk delete unspaced items
    res = client.delete("/api/items/ready-to-delete?space=none")
    assert res.status_code == 200
    assert res.get_json()["deleted"] == 1

    # Only space B remains
    remaining = client.get("/api/items?state=ready_to_delete")
    assert remaining.get_json()["pagination"]["total"] == 1
