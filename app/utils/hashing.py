"""Content hashing utilities for duplicate detection."""

import hashlib
from pathlib import Path

_CHUNK_SIZE = 64 * 1024  # 64 KB


def hash_file(file_path: Path) -> str:
    """Compute SHA-256 hex digest of a file on disk."""
    h = hashlib.sha256()
    with open(file_path, "rb") as f:
        while chunk := f.read(_CHUNK_SIZE):
            h.update(chunk)
    return h.hexdigest()


def hash_string(text: str) -> str:
    """Compute SHA-256 hex digest of a UTF-8 string."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()
