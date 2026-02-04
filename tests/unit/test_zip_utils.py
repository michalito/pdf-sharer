import pytest

from app.utils.zip_utils import dedupe_zip_path, sanitize_zip_path


def test_sanitize_converts_backslashes_and_strips_drive_letter():
    assert sanitize_zip_path(r"C:\Top\sub\file.txt") == "Top/sub/file.txt"


def test_sanitize_strips_leading_slashes():
    assert sanitize_zip_path("/Top/sub/file.txt") == "Top/sub/file.txt"


def test_sanitize_rejects_parent_traversal():
    with pytest.raises(ValueError):
        sanitize_zip_path("../secret.txt")

    with pytest.raises(ValueError):
        sanitize_zip_path("Top/../secret.txt")


def test_sanitize_rejects_empty_segments():
    with pytest.raises(ValueError):
        sanitize_zip_path("Top//file.txt")


def test_dedupe_suffixes_collisions():
    used: set[str] = set()
    first = dedupe_zip_path(sanitize_zip_path("Top/file.txt"), used)
    second = dedupe_zip_path(sanitize_zip_path("Top/file.txt"), used)
    third = dedupe_zip_path(sanitize_zip_path("Top/file.txt"), used)

    assert first == "Top/file.txt"
    assert second == "Top/file (1).txt"
    assert third == "Top/file (2).txt"

