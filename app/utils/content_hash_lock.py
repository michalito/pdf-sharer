"""Per-content-hash lock utilities.

These locks coordinate duplicate-check-and-create sections so concurrent
requests with the same hash are serialized.
"""

from __future__ import annotations

import os
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

import fcntl


def _lock_root() -> Path:
    root = os.getenv("SAITA_CONTENT_HASH_LOCK_DIR", "/tmp/saita-content-hash-locks")
    path = Path(root)
    path.mkdir(parents=True, exist_ok=True)
    return path


@contextmanager
def acquire_content_hash_locks(content_hashes: list[str]) -> Iterator[None]:
    """Acquire exclusive locks for a set of content hashes.

    Locks are taken in sorted order to avoid deadlocks when multiple hashes
    are locked by one request.
    """
    unique_hashes = sorted({ch for ch in content_hashes if ch})
    if not unique_hashes:
        yield
        return

    handles = []
    try:
        for content_hash in unique_hashes:
            lock_path = _lock_root() / f"{content_hash}.lock"
            handle = lock_path.open("a+b")
            fcntl.flock(handle.fileno(), fcntl.LOCK_EX)
            handles.append(handle)
        yield
    finally:
        for handle in reversed(handles):
            try:
                fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
            finally:
                handle.close()
