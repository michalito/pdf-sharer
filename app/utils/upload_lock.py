"""Coordinate upload publication and orphan cleanup across worker processes."""

from contextlib import contextmanager
import fcntl
import os
from pathlib import Path

from flask import current_app


@contextmanager
def lock_upload_directory(*, exclusive: bool = False):
    """Let uploads run together, but keep pruning out until they have committed.

    Lock the directory inode itself so all processes sharing the upload volume
    use the same lock without introducing a file that cleanup could remove.
    """
    directory = Path(current_app.config["UPLOAD_FOLDER"])
    directory.mkdir(parents=True, exist_ok=True)
    descriptor = os.open(directory, os.O_RDONLY)
    try:
        fcntl.flock(descriptor, fcntl.LOCK_EX if exclusive else fcntl.LOCK_SH)
        yield
    finally:
        os.close(descriptor)
