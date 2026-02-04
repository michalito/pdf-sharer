"""ZIP path sanitization helpers.

These helpers ensure that user-provided relative paths (e.g. from
`webkitRelativePath`) are safe to include in a ZIP file.
"""

from __future__ import annotations

import re
from pathlib import PurePosixPath


_DRIVE_LETTER_RE = re.compile(r"^[A-Za-z]:")
DEFAULT_MAX_ZIP_PATH_LEN = 240


def sanitize_zip_path(relative_path: str, *, max_length: int = DEFAULT_MAX_ZIP_PATH_LEN) -> str:
    """Sanitize a relative path for use inside a ZIP archive.

    Rules:
    - Convert backslashes to forward slashes
    - Strip leading slashes and drive letters
    - Reject empty segments, "." segments, and ".." segments
    - Enforce a maximum total path length (truncating the basename if needed)
    """
    if relative_path is None:
        raise ValueError("Path is required")

    path = str(relative_path).replace("\\", "/").strip()
    path = _DRIVE_LETTER_RE.sub("", path)
    path = path.lstrip("/")

    if not path:
        raise ValueError("Path is empty")

    # Normalize duplicate slashes via PurePosixPath, but still reject empty segments
    raw_parts = path.split("/")
    if any(part == "" for part in raw_parts):
        raise ValueError("Path contains empty segments")

    parts: list[str] = []
    for part in raw_parts:
        if part in (".", ".."):
            raise ValueError("Path contains invalid segments")
        parts.append(part)

    safe_path = str(PurePosixPath(*parts))

    if "\x00" in safe_path:
        raise ValueError("Path contains invalid characters")

    if len(safe_path) <= max_length:
        return safe_path

    # Truncate only the basename to fit.
    parent, _, name = safe_path.rpartition("/")
    if not name:
        raise ValueError("Invalid path")

    if parent:
        prefix_len = len(parent) + 1
    else:
        prefix_len = 0

    available = max_length - prefix_len
    if available <= 0:
        raise ValueError("Path is too long")

    # Try to preserve extension.
    stem, dot, ext = name.partition(".")
    ext = f"{dot}{ext}" if dot else ""
    if not ext:
        truncated = name[:available]
    else:
        if len(ext) >= available:
            # Extension alone doesn't fit; fall back to a raw truncate.
            truncated = name[:available]
        else:
            stem_max = available - len(ext)
            truncated = f"{stem[:stem_max]}{ext}"

    return f"{parent}/{truncated}" if parent else truncated


def dedupe_zip_path(
    safe_path: str,
    used_paths: set[str],
    *,
    max_length: int = DEFAULT_MAX_ZIP_PATH_LEN,
) -> str:
    """Deduplicate a *sanitized* zip path by suffixing the basename.

    Example: `a/b.txt` -> `a/b (1).txt`, `a/b (2).txt`, ...
    """
    if safe_path not in used_paths:
        used_paths.add(safe_path)
        return safe_path

    parent, _, name = safe_path.rpartition("/")
    stem, dot, ext = name.partition(".")
    ext = f"{dot}{ext}" if dot else ""

    prefix_len = (len(parent) + 1) if parent else 0

    for i in range(1, 10_000):
        suffix = f" ({i})"
        available = max_length - prefix_len
        if available <= 0:
            raise ValueError("Path is too long")

        # Make sure the basename fits after suffixing.
        base_max = available - len(ext) - len(suffix)
        if base_max <= 0:
            candidate_name = (f"{stem}{suffix}{ext}")[:available]
        else:
            candidate_name = f"{stem[:base_max]}{suffix}{ext}"

        candidate_path = f"{parent}/{candidate_name}" if parent else candidate_name
        candidate_path = sanitize_zip_path(candidate_path, max_length=max_length)

        if candidate_path not in used_paths:
            used_paths.add(candidate_path)
            return candidate_path

    raise ValueError("Too many duplicate paths")

