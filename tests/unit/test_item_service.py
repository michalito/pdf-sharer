"""Unit tests for ItemService edge cases."""

from io import BytesIO
from pathlib import Path

import pytest
from flask import Flask
from sqlalchemy.exc import SQLAlchemyError
from werkzeug.datastructures import FileStorage

from app.exceptions import FileOperationError
from app.services.item_service import ItemService


class _RepoBase:
    """Common methods shared by all repository stubs."""

    def get_max_position(self) -> int:
        return -1


class _FailingCreateRepository(_RepoBase):
    """Repository stub that fails on the second create call."""

    def __init__(self) -> None:
        self.create_calls = 0

    def find_by_content_hash(self, content_hash: str) -> list[object]:
        _ = content_hash
        return []

    def create(self, *, commit: bool = True, **kwargs):
        self.create_calls += 1
        if self.create_calls == 2:
            raise SQLAlchemyError("simulated create failure")

        class _CreatedItem:
            id = 1

        _ = kwargs
        return _CreatedItem()

    def commit(self) -> None:
        pass

    def rollback(self) -> None:
        pass


class _FailOnCommitRepository(_RepoBase):
    """Repository stub where create succeeds but commit fails."""

    def find_by_content_hash(self, content_hash: str) -> list[object]:
        _ = content_hash
        return []

    def create(self, *, commit: bool = True, **kwargs):
        class _CreatedItem:
            id = 1

        _ = kwargs
        return _CreatedItem()

    def commit(self) -> None:
        raise SQLAlchemyError("simulated commit failure")

    def rollback(self) -> None:
        pass


class _FailingFindByHashRepository(_RepoBase):
    """Repository stub that fails while checking duplicate content."""

    def __init__(self) -> None:
        self.rollback_calls = 0

    def find_by_content_hash(self, content_hash: str) -> list[object]:
        _ = content_hash
        raise SQLAlchemyError("simulated duplicate lookup failure")

    def create(self, *, commit: bool = True, **kwargs):
        _ = kwargs
        raise AssertionError("create should not be called when duplicate lookup fails")

    def commit(self) -> None:
        pass

    def rollback(self) -> None:
        self.rollback_calls += 1


def test_upload_files_cleans_all_disk_files_on_db_failure(tmp_path: Path):
    app = Flask(__name__)
    app.config["UPLOAD_FOLDER"] = tmp_path

    service = ItemService(repository=_FailingCreateRepository())
    files = [
        FileStorage(stream=BytesIO(b"a"), filename="a.txt", content_type="text/plain"),
        FileStorage(stream=BytesIO(b"b"), filename="b.txt", content_type="text/plain"),
        FileStorage(stream=BytesIO(b"c"), filename="c.txt", content_type="text/plain"),
    ]

    with app.app_context():
        with pytest.raises(FileOperationError):
            service.upload_files(files, force=True)

    # Atomic batch: ALL disk files must be cleaned up when DB creation fails.
    assert len(list(tmp_path.iterdir())) == 0


def test_upload_files_cleans_all_disk_files_on_commit_failure(tmp_path: Path):
    """When all creates succeed but the final commit fails, all files are cleaned up."""
    app = Flask(__name__)
    app.config["UPLOAD_FOLDER"] = tmp_path

    service = ItemService(repository=_FailOnCommitRepository())
    files = [
        FileStorage(stream=BytesIO(b"a"), filename="a.txt", content_type="text/plain"),
        FileStorage(stream=BytesIO(b"b"), filename="b.txt", content_type="text/plain"),
    ]

    with app.app_context():
        with pytest.raises(FileOperationError):
            service.upload_files(files, force=True)

    assert len(list(tmp_path.iterdir())) == 0


def test_upload_folder_cleans_zip_on_duplicate_lookup_failure(tmp_path: Path):
    app = Flask(__name__)
    app.config["UPLOAD_FOLDER"] = tmp_path

    service = ItemService(repository=_FailingFindByHashRepository())
    files = [
        FileStorage(stream=BytesIO(b"a"), filename="a.txt", content_type="text/plain"),
    ]
    paths = ["folder/a.txt"]

    with app.app_context():
        with pytest.raises(FileOperationError, match="Failed to check duplicate content"):
            service.upload_folder(files, paths)

    assert list(tmp_path.iterdir()) == []


def test_upload_files_cleans_staged_files_on_duplicate_lookup_failure(tmp_path: Path):
    app = Flask(__name__)
    app.config["UPLOAD_FOLDER"] = tmp_path

    repo = _FailingFindByHashRepository()
    service = ItemService(repository=repo)
    files = [
        FileStorage(stream=BytesIO(b"a"), filename="a.txt", content_type="text/plain"),
        FileStorage(stream=BytesIO(b"b"), filename="b.txt", content_type="text/plain"),
    ]

    with app.app_context():
        with pytest.raises(FileOperationError, match="Failed to check duplicate content"):
            service.upload_files(files)

    assert list(tmp_path.iterdir()) == []
    assert repo.rollback_calls == 1


def test_create_link_wraps_duplicate_lookup_failure(tmp_path: Path):
    app = Flask(__name__)
    app.config["UPLOAD_FOLDER"] = tmp_path

    repo = _FailingFindByHashRepository()
    service = ItemService(repository=repo)

    with app.app_context():
        with pytest.raises(FileOperationError, match="Failed to check duplicate content"):
            service.create_link(url="https://example.com/failure")

    assert repo.rollback_calls == 1


def test_create_note_wraps_duplicate_lookup_failure(tmp_path: Path):
    app = Flask(__name__)
    app.config["UPLOAD_FOLDER"] = tmp_path
    app.config["MAX_NOTE_TEXT_LENGTH"] = 100000

    repo = _FailingFindByHashRepository()
    service = ItemService(repository=repo)

    with app.app_context():
        with pytest.raises(FileOperationError, match="Failed to check duplicate content"):
            service.create_note(text="failure note")

    assert repo.rollback_calls == 1


@pytest.mark.parametrize("kind", ["files", "folder"])
def test_upload_cleans_staged_content_when_hashing_fails(app, temp_upload_dir, monkeypatch, kind):
    def fail_hash(_path):
        raise OSError("simulated disk read failure")

    monkeypatch.setattr("app.services.item_service.hash_file", fail_hash)
    files = [FileStorage(stream=BytesIO(b"data"), filename="file.txt")]
    with pytest.raises(FileOperationError):
        if kind == "files":
            ItemService().upload_files(files)
        else:
            ItemService().upload_folder(files, ["folder/file.txt"])
    assert list(temp_upload_dir.iterdir()) == []


def test_upload_cleans_staged_content_when_position_query_fails(app, temp_upload_dir):
    repo = _FailOnCommitRepository()
    def fail_position():
        raise SQLAlchemyError("simulated position lookup failure")
    repo.get_max_position = fail_position
    with pytest.raises(FileOperationError):
        ItemService(repo).upload_files([FileStorage(stream=BytesIO(b"data"), filename="file.txt")])
    assert list(temp_upload_dir.iterdir()) == []
