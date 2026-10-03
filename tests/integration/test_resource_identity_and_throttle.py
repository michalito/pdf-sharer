"""Regression checks for stable identities and concurrent unlock admission."""

from concurrent.futures import ThreadPoolExecutor
import multiprocessing
from pathlib import Path
from threading import Barrier, Event
import time

from flask_migrate import downgrade, upgrade
from sqlalchemy import inspect, text

from app import create_app, db
from app.config import Config
from app.domain.unlock_attempt import UnlockAttempt
from app.services.item_service import ItemService
from app.services.unlock_throttle import UnlockThrottle


def _file_app(tmp_path):
    app = create_app(Config(
        SECRET_KEY="regression-secret", DATABASE_URI=f"sqlite:///{tmp_path / 'test.db'}",
        UPLOAD_FOLDER=tmp_path / "uploads", MAX_CONTENT_LENGTH=2 * 1024 * 1024,
    ))
    app.config["TESTING"] = True
    return app


def test_deleted_share_links_never_point_to_new_items(client):
    old_id = client.post("/api/items/note", json={"text": "original"}).json["id"]
    client.patch(f"/api/items/{old_id}", json={"state": "ready_to_delete"})
    assert client.delete(f"/api/items/{old_id}").status_code == 204
    new_id = client.post("/api/items/note", json={"text": "unrelated"}).json["id"]
    assert new_id > old_id
    assert client.get(f"/d/{old_id}").status_code == 404


def test_deleted_space_ids_never_reassign_stale_filters(client):
    old_id = client.post("/api/spaces", json={"name": "Original"}).json["id"]
    assert client.delete(f"/api/spaces/{old_id}").status_code == 200
    new_id = client.post("/api/spaces", json={"name": "Unrelated"}).json["id"]
    assert new_id > old_id
    assert client.post("/api/items/note", json={"text": "note", "spaceId": old_id}).status_code == 404


def test_identity_migration_preserves_children_and_repairs_old_references(tmp_path):
    app = _file_app(tmp_path)
    directory = str(Path(__file__).resolve().parents[2] / "migrations")
    with app.app_context():
        upgrade(directory=directory, revision="0011_add_unlock_attempts")
        # Simulate a historical database created without FK enforcement.
        db.session.execute(text("PRAGMA foreign_keys=OFF"))
        db.session.execute(text(
            "INSERT INTO spaces(id, name, normalized_name, position) VALUES (4, 'Keep', 'keep', 0)"
        ))
        db.session.execute(text(
            "INSERT INTO items(id, stored_name, display_name, kind, created_at, space_id) "
            "VALUES (7, 'keep.note', 'Keep', 'note', CURRENT_TIMESTAMP, 4), "
            "(9, 'orphan.note', 'Orphan', 'note', CURRENT_TIMESTAMP, 88)"
        ))
        db.session.execute(text(
            "INSERT INTO unlock_attempts(client_ip, item_id) VALUES ('valid', 7), ('orphan', 88)"
        ))
        db.session.commit()
        before_indexes = {row["name"] for row in inspect(db.engine).get_indexes("items")}
        upgrade(directory=directory)
        db.session.remove()
        assert db.session.execute(text("PRAGMA foreign_keys")).scalar() == 1
        assert db.session.execute(text("PRAGMA foreign_key_check")).all() == []
        assert db.session.execute(text("SELECT item_id FROM unlock_attempts")).scalars().all() == [7]
        assert db.session.execute(text("SELECT space_id FROM items WHERE id=9")).scalar() is None
        assert {row["name"] for row in inspect(db.engine).get_indexes("items")} == before_indexes
        for table in ("items", "spaces"):
            assert "AUTOINCREMENT" in db.session.execute(
                text("SELECT sql FROM sqlite_master WHERE name=:table"), {"table": table},
            ).scalar()
        db.session.execute(text("DELETE FROM items WHERE id=9"))
        db.session.commit()
        assert ItemService().create_note(text="after migrated deletion").id > 9
        db.session.remove()
        downgrade(directory=directory, revision="0011_add_unlock_attempts")
        db.session.remove()
        assert db.session.execute(text("PRAGMA foreign_key_check")).all() == []
        assert db.session.execute(text("SELECT item_id FROM unlock_attempts")).scalars().all() == [7]
        assert db.session.execute(text("SELECT count(*) FROM items")).scalar() == 2
        for table in ("items", "spaces"):
            assert "AUTOINCREMENT" not in db.session.execute(
                text("SELECT sql FROM sqlite_master WHERE name=:table"), {"table": table},
            ).scalar()


def test_concurrent_api_and_public_unlocks_share_one_attempt_budget(tmp_path, monkeypatch):
    app = _file_app(tmp_path)
    with app.app_context():
        db.create_all()
        item_id = ItemService().create_note(text="protected", password="password").id
    original_verify = ItemService.verify_item_password

    def slow_verify(self, *args):
        time.sleep(0.03)
        return original_verify(self, *args)

    monkeypatch.setattr(ItemService, "verify_item_password", slow_verify)
    barrier = Barrier(8)

    def attempt(index):
        with app.test_client() as client:
            barrier.wait(timeout=5)
            if index % 2:
                return client.post(f"/d/{item_id}", data={"password": "wrongpassword"}).status_code
            return client.post(f"/api/items/{item_id}/unlock", json={"password": "wrongpassword"}).status_code

    with ThreadPoolExecutor(max_workers=8) as pool:
        statuses = list(pool.map(attempt, range(8)))
    assert statuses.count(401) == 5
    assert statuses.count(429) == 3
    with app.app_context():
        assert UnlockAttempt.query.count() == 1


def _process_unlock(tmp_path, item_id, barrier, statuses):
    app = _file_app(tmp_path)
    app.config["UNLOCK_THROTTLE"] = UnlockThrottle(max_attempts=2)
    with app.test_client() as client:
        barrier.wait(timeout=5)
        response = client.post(
            f"/api/items/{item_id}/unlock", json={"password": "wrongpassword"},
        )
        statuses.put(response.status_code)


def test_independent_worker_processes_share_the_unlock_budget(tmp_path):
    app = _file_app(tmp_path)
    with app.app_context():
        db.create_all()
        item_id = ItemService().create_note(text="cross-worker", password="password").id
    context = multiprocessing.get_context("spawn")
    barrier = context.Barrier(4)
    statuses = context.Queue()
    processes = [
        context.Process(target=_process_unlock, args=(tmp_path, item_id, barrier, statuses))
        for _ in range(4)
    ]
    try:
        for process in processes:
            process.start()
        results = [statuses.get(timeout=6) for _ in processes]
        for process in processes:
            process.join(timeout=2)
            assert process.exitcode == 0
        assert results.count(401) == 2
        assert results.count(429) == 2
    finally:
        for process in processes:
            if process.is_alive():
                process.terminate()
                process.join(timeout=2)
        statuses.close()


def test_serialized_attempt_reclaims_stale_rows_in_bounded_batches(app):
    now = [100.0]
    throttle = UnlockThrottle(time_func=lambda: now[0])
    with app.app_context():
        item_id = ItemService().create_note(text="stale").id
        db.session.add_all([
            UnlockAttempt(client_ip=str(index), item_id=item_id, updated_at=0.0)
            for index in range(510)
        ])
        db.session.commit()
        with throttle.serialized_attempt("current", item_id):
            pass
        assert throttle.entry_count == 10
        with throttle.serialized_attempt("current", item_id):
            pass
        assert throttle.entry_count == 10
        now[0] += 61
        with throttle.serialized_attempt("current", item_id):
            pass
        assert throttle.entry_count == 0


def test_cleanup_waits_for_an_in_progress_attempt(tmp_path):
    app = _file_app(tmp_path)
    clock = lambda: 100.0
    throttle = UnlockThrottle(time_func=clock)
    throttle._next_cleanup_at = 200.0
    with app.app_context():
        db.create_all()
        item_id = ItemService().create_note(text="cleanup race").id
        db.session.add(UnlockAttempt(client_ip="client", item_id=item_id, updated_at=0.0))
        db.session.commit()
    in_attempt, allow_failure, cleanup_started = Event(), Event(), Event()

    def attempt():
        with app.app_context(), throttle.serialized_attempt("client", item_id):
            assert throttle.check("client", item_id)[0]
            in_attempt.set()
            assert allow_failure.wait(timeout=5)
            throttle.record_failure("client", item_id)

    def cleanup():
        assert in_attempt.wait(timeout=5)
        cleanup_started.set()
        with app.app_context():
            return throttle.cleanup()

    with ThreadPoolExecutor(max_workers=2) as pool:
        attempt_future = pool.submit(attempt)
        cleanup_future = pool.submit(cleanup)
        assert cleanup_started.wait(timeout=5)
        try:
            time.sleep(0.03)
            assert not cleanup_future.done()
        finally:
            allow_failure.set()
        attempt_future.result(timeout=5)
        assert cleanup_future.result(timeout=5) == 0
    with app.app_context():
        assert throttle.entry_count == 1
