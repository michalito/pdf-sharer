"""Item service for business logic operations."""

from __future__ import annotations

import json
import logging
import mimetypes
import shutil
import uuid
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse

from flask import current_app
from sqlalchemy.exc import SQLAlchemyError
from werkzeug.datastructures import FileStorage
from werkzeug.security import check_password_hash, generate_password_hash
from werkzeug.utils import secure_filename

from dataclasses import dataclass

from app.constants import ALLOWED_TTL_PRESETS, DEFAULT_PAGE, DEFAULT_PER_PAGE
from app.domain.item import Item, ItemKind, ItemState
from app.exceptions import DuplicateDetectedError, FileOperationError, ValidationError
from app.repositories.item_repository import ItemRepository, PaginatedResult, SortField, SortOrder, StorageStats
from app.utils.content_hash_lock import acquire_content_hash_locks
from app.utils.hashing import hash_file, hash_string
from app.utils.validation import validate_reorder_ids
from app.utils.zip_utils import dedupe_zip_path, sanitize_zip_path


logger = logging.getLogger(__name__)


SavedUploadFile = tuple[Path, str, str, str, int, str | None]


@dataclass
class DiskUsage:
    total_bytes: int
    used_bytes: int
    free_bytes: int


@dataclass
class StorageOverview:
    disk: DiskUsage | None
    stats: StorageStats


class ItemService:
    """Service for Item operations."""

    MAX_DISPLAY_NAME_LENGTH = 255
    MAX_LINK_URL_LENGTH = 2048
    MAX_NOTE_TITLE_LENGTH = 120
    MAX_NOTE_TEXT_LENGTH = 4000
    MIN_ITEM_PASSWORD_LENGTH = 8
    MAX_ITEM_PASSWORD_LENGTH = 128

    def __init__(self, repository: Optional[ItemRepository] = None):
        self.repository = repository or ItemRepository()

    def list_items(
        self,
        *,
        q: Optional[str] = None,
        kind: Optional[ItemKind] = None,
        state: Optional[ItemState] = None,
        protected: Optional[bool] = None,
        space_id: Optional[int] = None,
        unspaced: Optional[bool] = None,
        page: int = DEFAULT_PAGE,
        per_page: int = DEFAULT_PER_PAGE,
        sort: SortField = "created",
        order: SortOrder = "desc",
    ) -> PaginatedResult[Item]:
        return self.repository.get_all(
            q=q,
            kind=kind,
            state=state,
            protected=protected,
            space_id=space_id,
            unspaced=unspaced,
            page=page,
            per_page=per_page,
            sort=sort,
            order=order,
        )

    def get_item(self, item_id: int) -> Item:
        return self.repository.get_by_id_or_raise(item_id)

    def get_storage_overview(self) -> StorageOverview:
        """Gather storage statistics from DB and optional disk usage."""
        stats = self.repository.get_storage_stats()

        disk: DiskUsage | None = None
        try:
            upload_folder = Path(current_app.config["UPLOAD_FOLDER"])
            usage = shutil.disk_usage(upload_folder)
            disk = DiskUsage(
                total_bytes=usage.total,
                used_bytes=usage.used,
                free_bytes=usage.free,
            )
        except OSError:
            logger.warning(
                "Could not read disk usage for upload folder",
                exc_info=True,
            )

        return StorageOverview(disk=disk, stats=stats)

    def get_item_path(self, item: Item) -> Path:
        if not self._item_has_stored_file(item):
            raise ValidationError(f"Item kind '{item.kind}' does not have downloadable file content")

        upload_folder = Path(current_app.config["UPLOAD_FOLDER"])
        file_path = upload_folder / item.stored_name

        if not file_path.exists():
            logger.error("Item file missing on disk: %s (item_id=%s)", file_path, item.id)
            raise FileOperationError("Requested file not found on server")

        return file_path

    def upload_files(
        self,
        files: list[FileStorage],
        password: Optional[str] = None,
        space_id: Optional[int] = None,
        ttl: Optional[str] = None,
        force: bool = False,
    ) -> list[Item]:
        if not files:
            raise ValidationError("No files provided")

        normalized_password = self.normalize_item_password(password)
        expires_at = self._resolve_expires_at(ttl)
        skip_dedup = force or expires_at is not None

        upload_folder = Path(current_app.config["UPLOAD_FOLDER"])
        upload_folder.mkdir(parents=True, exist_ok=True)

        # Phase 1: save all files to disk and compute hashes.
        saved: list[SavedUploadFile] = []
        try:
            for file in files:
                if not file or not file.filename:
                    raise ValidationError("File is missing a filename")

                raw_name = file.filename.strip() or "unnamed"
                original_name = Path(raw_name).name or "unnamed"
                ext = Path(original_name).suffix
                stored_name = f"{uuid.uuid4().hex}{ext}"
                file_path = upload_folder / stored_name

                try:
                    file.save(str(file_path))
                    size_bytes = file_path.stat().st_size
                    content_hash = hash_file(file_path)
                except OSError as e:
                    file_path.unlink(missing_ok=True)
                    logger.error("Failed to save file: %s", e, exc_info=True)
                    raise FileOperationError("Failed to save file")

                mime_type = file.mimetype or mimetypes.guess_type(original_name)[0]
                saved.append((file_path, stored_name, original_name, content_hash, size_bytes, mime_type))

            # Phase 2 + 3: check duplicates and create DB records while holding
            # per-hash locks to serialize concurrent writers for the same content.
            content_hashes = [content_hash for _, _, _, content_hash, _, _ in saved]
            with acquire_content_hash_locks(content_hashes):
                if not skip_dedup:
                    try:
                        grouped_dupes = self._collect_upload_file_duplicates(saved)
                    except SQLAlchemyError as e:
                        logger.error("Database error checking file duplicates: %s", e, exc_info=True)
                        raise FileOperationError("Failed to check duplicate content")
                    if grouped_dupes:
                        raise DuplicateDetectedError("Duplicate content detected", duplicates=grouped_dupes)

                password_hash = self._make_password_hash(normalized_password)
                created: list[Item] = []
                next_position = self.repository.get_max_position() + 1
                try:
                    for idx, (file_path, stored_name, original_name, content_hash, size_bytes, mime_type) in enumerate(saved):
                        item = self.repository.create(
                            stored_name=stored_name,
                            display_name=original_name,
                            kind=ItemKind.FILE,
                            mime_type=mime_type,
                            size_bytes=size_bytes,
                            password_hash=password_hash,
                            space_id=space_id,
                            expires_at=expires_at,
                            content_hash=content_hash,
                            position=next_position + idx,
                            commit=False,
                        )
                        created.append(item)
                    self.repository.commit()
                except SQLAlchemyError as e:
                    self.repository.rollback()
                    logger.error("Database error creating item: %s", e, exc_info=True)
                    raise FileOperationError("Failed to create item record")
                return created

        except (DuplicateDetectedError, ValidationError, FileOperationError):
            for file_path, *_ in saved:
                file_path.unlink(missing_ok=True)
            raise

    def upload_folder(
        self,
        files: list[FileStorage],
        paths: list[str],
        password: Optional[str] = None,
        space_id: Optional[int] = None,
        ttl: Optional[str] = None,
        force: bool = False,
    ) -> Item:
        if not files:
            raise ValidationError("No files provided")
        if not paths:
            raise ValidationError("No paths provided")
        if len(files) != len(paths):
            raise ValidationError("Files and paths counts do not match")

        normalized_password = self.normalize_item_password(password)
        expires_at = self._resolve_expires_at(ttl)
        skip_dedup = force or expires_at is not None
        folder_name = self._infer_folder_name(paths)
        stored_name = f"{uuid.uuid4().hex}.zip"

        upload_folder = Path(current_app.config["UPLOAD_FOLDER"])
        upload_folder.mkdir(parents=True, exist_ok=True)
        zip_path = upload_folder / stored_name

        used_paths: set[str] = set()
        zip_entries: list[tuple[str, FileStorage]] = []
        for file, rel_path in zip(files, paths, strict=True):
            if not file or not file.filename:
                raise ValidationError("A folder file is missing a filename")
            zip_entries.append((sanitize_zip_path(rel_path), file))

        # Keep folder archive byte layout deterministic for the same logical input,
        # regardless of browser-provided multipart ordering.
        zip_entries.sort(key=lambda entry: (entry[0], (entry[1].filename or "").lower()))

        try:
            with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
                for safe_rel, file in zip_entries:
                    safe_rel = dedupe_zip_path(safe_rel, used_paths)

                    # Stream into the zip without buffering the full file in memory.
                    file.stream.seek(0)
                    with zf.open(safe_rel, "w") as dest:
                        shutil.copyfileobj(file.stream, dest, length=64 * 1024)
        except (OSError, zipfile.BadZipFile) as e:
            zip_path.unlink(missing_ok=True)
            logger.error("Failed to create zip: %s", e, exc_info=True)
            raise FileOperationError("Failed to create folder zip")

        content_hash = hash_file(zip_path)
        persisted = False
        try:
            with acquire_content_hash_locks([content_hash]):
                if not skip_dedup:
                    try:
                        existing = self.repository.find_by_content_hash(content_hash)
                    except SQLAlchemyError as e:
                        logger.error("Database error checking folder duplicates: %s", e, exc_info=True)
                        raise FileOperationError("Failed to check duplicate content")

                    if existing:
                        raise DuplicateDetectedError(
                            "Duplicate content detected",
                            duplicates=[self._format_duplicate_info(item) for item in existing],
                        )

                size_bytes = zip_path.stat().st_size
                meta_json = json.dumps(
                    {"file_count": len(files), "top_level_dir": folder_name},
                    separators=(",", ":"),
                )
                password_hash = self._make_password_hash(normalized_password)

                next_position = self.repository.get_max_position() + 1
                try:
                    item = self.repository.create(
                        stored_name=stored_name,
                        display_name=folder_name,
                        kind=ItemKind.FOLDER,
                        state=ItemState.ACTIVE,
                        mime_type="application/zip",
                        size_bytes=size_bytes,
                        meta_json=meta_json,
                        password_hash=password_hash,
                        space_id=space_id,
                        expires_at=expires_at,
                        content_hash=content_hash,
                        position=next_position,
                    )
                    persisted = True
                    return item
                except SQLAlchemyError as e:
                    logger.error("Database error creating folder item: %s", e, exc_info=True)
                    raise FileOperationError("Failed to create item record")
        finally:
            if not persisted:
                zip_path.unlink(missing_ok=True)

    def create_link(
        self,
        *,
        url: str,
        name: Optional[str] = None,
        password: Optional[str] = None,
        space_id: Optional[int] = None,
        ttl: Optional[str] = None,
        force: bool = False,
    ) -> Item:
        normalized_url = self._normalize_link_url(url)
        normalized_password = self.normalize_item_password(password)
        expires_at = self._resolve_expires_at(ttl)
        skip_dedup = force or expires_at is not None
        content_hash = hash_string(normalized_url)

        display_name = self._normalize_display_name(name) or self._derive_link_display_name(normalized_url)
        stored_name = self._synthetic_stored_name("link")
        meta_json = json.dumps({"url": normalized_url}, separators=(",", ":"))
        password_hash = self._make_password_hash(normalized_password)

        with acquire_content_hash_locks([content_hash]):
            if not skip_dedup:
                existing = self.repository.find_by_content_hash(content_hash)
                if existing:
                    raise DuplicateDetectedError(
                        "Duplicate content detected",
                        duplicates=[self._format_duplicate_info(item) for item in existing],
                    )
            next_position = self.repository.get_max_position() + 1
            try:
                return self.repository.create(
                    stored_name=stored_name,
                    display_name=display_name,
                    kind=ItemKind.LINK,
                    state=ItemState.ACTIVE,
                    mime_type="text/uri-list",
                    size_bytes=len(normalized_url.encode("utf-8")),
                    meta_json=meta_json,
                    password_hash=password_hash,
                    space_id=space_id,
                    expires_at=expires_at,
                    content_hash=content_hash,
                    position=next_position,
                )
            except SQLAlchemyError as e:
                logger.error("Database error creating link item: %s", e, exc_info=True)
                raise FileOperationError("Failed to create item record")

    def create_note(
        self,
        *,
        text: str,
        title: Optional[str] = None,
        password: Optional[str] = None,
        space_id: Optional[int] = None,
        ttl: Optional[str] = None,
        force: bool = False,
    ) -> Item:
        normalized_text = self._normalize_note_text(text)
        normalized_password = self.normalize_item_password(password)
        expires_at = self._resolve_expires_at(ttl)
        skip_dedup = force or expires_at is not None
        content_hash = hash_string(normalized_text)

        display_name = self._normalize_note_title(title) or self._derive_note_title(normalized_text)
        stored_name = self._synthetic_stored_name("note")
        meta_json = json.dumps({"text": normalized_text}, separators=(",", ":"))
        password_hash = self._make_password_hash(normalized_password)

        with acquire_content_hash_locks([content_hash]):
            if not skip_dedup:
                existing = self.repository.find_by_content_hash(content_hash)
                if existing:
                    raise DuplicateDetectedError(
                        "Duplicate content detected",
                        duplicates=[self._format_duplicate_info(item) for item in existing],
                    )
            next_position = self.repository.get_max_position() + 1
            try:
                return self.repository.create(
                    stored_name=stored_name,
                    display_name=display_name,
                    kind=ItemKind.NOTE,
                    state=ItemState.ACTIVE,
                    mime_type="text/plain",
                    size_bytes=len(normalized_text.encode("utf-8")),
                    meta_json=meta_json,
                    password_hash=password_hash,
                    space_id=space_id,
                    expires_at=expires_at,
                    content_hash=content_hash,
                    position=next_position,
                )
            except SQLAlchemyError as e:
                logger.error("Database error creating note item: %s", e, exc_info=True)
                raise FileOperationError("Failed to create item record")

    def get_link_url(self, item: Item) -> str:
        if item.kind != ItemKind.LINK.value:
            raise ValidationError(f"Item kind '{item.kind}' is not a link")
        return self._meta_string(item, "url", label="link URL")

    def get_note_text(self, item: Item) -> str:
        if item.kind != ItemKind.NOTE.value:
            raise ValidationError(f"Item kind '{item.kind}' is not a note")
        return self._meta_string(item, "text", label="note text")

    def delete_item(self, item_id: int) -> None:
        item = self.repository.get_by_id_or_raise(item_id)

        if item.state != ItemState.READY_TO_DELETE.value:
            raise ValidationError("Item must be marked 'ready_to_delete' before deletion")

        file_path: Optional[Path] = None
        if self._item_has_stored_file(item):
            upload_folder = Path(current_app.config["UPLOAD_FOLDER"])
            file_path = upload_folder / item.stored_name

        try:
            self.repository.delete(item)
        except SQLAlchemyError as e:
            logger.error("Failed to delete item record %s: %s", item_id, e, exc_info=True)
            raise FileOperationError("Failed to delete item record")

        if file_path is not None:
            try:
                file_path.unlink(missing_ok=True)
            except OSError as e:
                # Best-effort deletion: the DB record is already gone. Log and rely on
                # `flask prune-orphans` for cleanup if needed.
                logger.error("Failed to delete file %s: %s", file_path, e, exc_info=True)

    def delete_ready_to_delete(
        self,
        *,
        q: Optional[str] = None,
        kind: Optional[ItemKind] = None,
        protected: Optional[bool] = None,
        space_id: Optional[int] = None,
        unspaced: Optional[bool] = None,
    ) -> int:
        items = self.repository.find_all(
            q=q,
            kind=kind,
            state=ItemState.READY_TO_DELETE,
            protected=protected,
            space_id=space_id,
            unspaced=unspaced,
        )
        return self._bulk_delete_items(items, label="bulk delete")

    def delete_expired_items(self, *, limit: int = 100) -> int:
        expired = self.repository.find_expired(limit=limit)
        return self._bulk_delete_items(expired, label="delete expired")

    def update_item(
        self,
        item_id: int,
        *,
        new_state: Optional[ItemState] = None,
        new_space_id: Optional[int] = None,
        update_space: bool = False,
        pinned: Optional[bool] = None,
    ) -> Item:
        """Apply state, space, and/or pinned changes atomically.

        Caller must validate that new_space_id refers to an existing space.
        """
        item = self.repository.get_by_id_or_raise(item_id)
        try:
            return self.repository.update_item_fields(
                item, new_state=new_state, new_space_id=new_space_id,
                update_space=update_space, pinned=pinned,
            )
        except SQLAlchemyError as e:
            logger.error("Failed to update item %s: %s", item_id, e, exc_info=True)
            raise FileOperationError("Failed to update item")

    def get_item_order(
        self,
        *,
        space_id: Optional[int] = None,
        unspaced: Optional[bool] = None,
    ) -> list[int]:
        """Return all active item IDs in their current manual sort order."""
        return self.repository.get_all_active_ids(
            space_id=space_id, unspaced=unspaced,
        )

    def reorder_items(self, ordered_ids: list[int]) -> None:
        """Reorder items by setting positions based on the given ID order.

        ordered_ids must be an exact permutation of all active (non-expired) item IDs.
        """
        existing_ids = set(self.repository.get_all_active_ids())
        validate_reorder_ids(ordered_ids, existing_ids, "active item IDs")

        try:
            self.repository.reorder(ordered_ids)
        except SQLAlchemyError as e:
            logger.error("Failed to reorder items: %s", e, exc_info=True)
            raise FileOperationError("Failed to reorder items")

    def get_download_name(self, item: Item) -> str:
        if not self._item_has_stored_file(item):
            raise ValidationError(f"Item kind '{item.kind}' does not have downloadable file content")

        if item.kind == ItemKind.FOLDER.value:
            name = item.display_name
            return name if name.lower().endswith(".zip") else f"{name}.zip"
        return item.display_name

    def item_requires_password(self, item: Item) -> bool:
        return bool(item.password_hash)

    def normalize_item_password(self, raw: Optional[str]) -> Optional[str]:
        if raw is None:
            return None
        if not isinstance(raw, str):
            raise ValidationError("Password must be a string")

        value = raw.strip()
        if not value:
            return None
        if len(value) < self.MIN_ITEM_PASSWORD_LENGTH:
            raise ValidationError(
                f"Password must be at least {self.MIN_ITEM_PASSWORD_LENGTH} characters"
            )
        if len(value) > self.MAX_ITEM_PASSWORD_LENGTH:
            raise ValidationError(
                f"Password must be at most {self.MAX_ITEM_PASSWORD_LENGTH} characters"
            )
        return value

    def hash_item_password(self, password: str) -> str:
        return generate_password_hash(password)

    def _make_password_hash(self, normalized_password: Optional[str]) -> Optional[str]:
        if normalized_password is None:
            return None
        return self.hash_item_password(normalized_password)

    def verify_item_password(self, item: Item, raw_password: Optional[str]) -> bool:
        if not self.item_requires_password(item):
            return True

        normalized = self.normalize_item_password(raw_password)
        if normalized is None or not item.password_hash:
            return False

        return check_password_hash(item.password_hash, normalized)

    def _resolve_expires_at(self, ttl: object | None) -> Optional[datetime]:
        if ttl is None:
            return None
        if not isinstance(ttl, str) or ttl not in ALLOWED_TTL_PRESETS:
            valid = ", ".join(ALLOWED_TTL_PRESETS.keys())
            raise ValidationError(f"Invalid TTL '{ttl}'. Valid values: {valid}")
        return datetime.now(timezone.utc) + ALLOWED_TTL_PRESETS[ttl]

    def _infer_folder_name(self, paths: list[str]) -> str:
        first = sanitize_zip_path(paths[0])
        root = first.split("/", 1)[0]
        root = root.strip() or "folder"
        root = secure_filename(root) or root
        return root

    def _format_duplicate_info(self, item: Item) -> dict:
        """Format an existing item's info for duplicate detection responses."""
        created = item.created_at
        if created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        return {
            "id": item.id,
            "name": item.display_name,
            "kind": item.kind,
            "state": item.state,
            "spaceId": item.space_id,
            "spaceName": item.space.name if item.space else None,
            "createdAt": created.astimezone(timezone.utc).isoformat(),
        }

    def _collect_upload_file_duplicates(self, saved: list[SavedUploadFile]) -> list[dict]:
        """Collect duplicate details for file uploads.

        Detects:
        1. Existing DB duplicates by content hash.
        2. Duplicate files inside the same upload request.
        """
        grouped_dupes: list[dict] = []
        existing_by_hash: dict[str, list[Item]] = {}
        first_seen_by_hash: dict[str, tuple[int, str]] = {}
        batch_created_at = datetime.now(timezone.utc).isoformat()

        for idx, (_, _, display_name, content_hash, _, _) in enumerate(saved):
            existing = existing_by_hash.get(content_hash)
            if existing is None:
                existing = self.repository.find_by_content_hash(content_hash)
                existing_by_hash[content_hash] = existing

            first_seen = first_seen_by_hash.get(content_hash)
            if first_seen is None:
                first_seen_by_hash[content_hash] = (idx, display_name)

            existing_items = [self._format_duplicate_info(item) for item in existing]
            if first_seen is not None:
                first_idx, first_name = first_seen
                existing_items = [
                    self._format_in_batch_duplicate_info(first_idx, first_name, created_at=batch_created_at),
                    *existing_items,
                ]

            if existing_items:
                grouped_dupes.append({
                    "fileIndex": idx,
                    "fileName": display_name,
                    "existingItems": existing_items,
                })

        return grouped_dupes

    def _format_in_batch_duplicate_info(self, file_index: int, file_name: str, *, created_at: str) -> dict:
        """Represent an earlier file in the same request as an existing duplicate."""
        return {
            "id": -(file_index + 1),
            "name": f"{file_name} (same upload)",
            "kind": ItemKind.FILE.value,
            "state": ItemState.ACTIVE.value,
            "spaceId": None,
            "spaceName": None,
            "createdAt": created_at,
        }

    def _bulk_delete_items(self, items: list[Item], *, label: str) -> int:
        """Delete items from DB and remove their files from disk.

        Returns the number of items deleted.
        """
        if not items:
            return 0

        upload_folder = Path(current_app.config["UPLOAD_FOLDER"])
        stored_names = [item.stored_name for item in items if self._item_has_stored_file(item)]

        try:
            self.repository.delete_many(items)
        except SQLAlchemyError as e:
            logger.error("Failed to %s item records: %s", label, e, exc_info=True)
            raise FileOperationError(f"Failed to {label} item records")

        failures = 0
        for stored_name in stored_names:
            try:
                (upload_folder / stored_name).unlink(missing_ok=True)
            except OSError as e:
                failures += 1
                logger.error(
                    "Failed to %s file %s: %s",
                    label, upload_folder / stored_name, e, exc_info=True,
                )

        if failures:
            logger.warning("%s completed with %s file deletion failure(s)", label.capitalize(), failures)

        return len(items)

    def _item_has_stored_file(self, item: Item) -> bool:
        return item.kind in {ItemKind.FILE.value, ItemKind.FOLDER.value}

    def _synthetic_stored_name(self, suffix: str) -> str:
        return f"{uuid.uuid4().hex}.{suffix}"

    def _normalize_display_name(self, raw: Optional[str]) -> Optional[str]:
        if raw is None:
            return None

        value = raw.strip()
        if not value:
            return None
        if len(value) > self.MAX_DISPLAY_NAME_LENGTH:
            raise ValidationError(
                f"Name is too long (max {self.MAX_DISPLAY_NAME_LENGTH} characters)"
            )
        return value

    def _normalize_note_title(self, raw: Optional[str]) -> Optional[str]:
        if raw is None:
            return None

        value = raw.strip()
        if not value:
            return None
        if len(value) > self.MAX_NOTE_TITLE_LENGTH:
            raise ValidationError(
                f"Note title is too long (max {self.MAX_NOTE_TITLE_LENGTH} characters)"
            )
        return value

    def _normalize_link_url(self, raw_url: str) -> str:
        url = (raw_url or "").strip()
        if not url:
            raise ValidationError("Missing 'url' field in request body")
        if len(url) > self.MAX_LINK_URL_LENGTH:
            raise ValidationError(
                f"URL is too long (max {self.MAX_LINK_URL_LENGTH} characters)"
            )
        if any(ch.isspace() for ch in url):
            raise ValidationError("URL must not contain spaces")

        parsed = urlparse(url)
        if parsed.scheme.lower() not in {"http", "https"}:
            raise ValidationError("URL must start with http:// or https://")
        if not parsed.netloc:
            raise ValidationError("URL must include a host")

        return url

    def _normalize_note_text(self, raw_text: str) -> str:
        text = (raw_text or "").strip()
        if not text:
            raise ValidationError("Missing 'text' field in request body")
        if len(text) > self.MAX_NOTE_TEXT_LENGTH:
            raise ValidationError(
                f"Note is too long (max {self.MAX_NOTE_TEXT_LENGTH} characters)"
            )
        return text

    def _derive_link_display_name(self, normalized_url: str) -> str:
        parsed = urlparse(normalized_url)
        host = parsed.netloc or "link"
        leaf = Path(parsed.path).name if parsed.path else ""

        if leaf:
            derived = f"{leaf} ({host})"
        else:
            derived = host

        return derived[: self.MAX_DISPLAY_NAME_LENGTH]

    def _derive_note_title(self, note_text: str) -> str:
        first_line = note_text.splitlines()[0].strip()
        if not first_line:
            return "Note"
        if len(first_line) <= self.MAX_NOTE_TITLE_LENGTH:
            return first_line
        return f"{first_line[: self.MAX_NOTE_TITLE_LENGTH - 3]}..."

    def _meta_string(self, item: Item, key: str, *, label: str) -> str:
        try:
            meta = json.loads(item.meta_json) if item.meta_json else {}
        except json.JSONDecodeError:
            meta = {}

        value = meta.get(key) if isinstance(meta, dict) else None
        if isinstance(value, str) and value:
            return value

        raise ValidationError(f"Item metadata is missing {label}")
