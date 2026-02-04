"""Item service for business logic operations."""

from __future__ import annotations

import json
import logging
import mimetypes
import shutil
import uuid
import zipfile
from pathlib import Path
from typing import Optional

from flask import current_app
from sqlalchemy.exc import SQLAlchemyError
from werkzeug.datastructures import FileStorage
from werkzeug.utils import secure_filename

from app.domain.item import Item, ItemKind, ItemState
from app.exceptions import FileOperationError, NotFoundError, ValidationError
from app.repositories.item_repository import ItemRepository, PaginatedResult
from app.utils.zip_utils import dedupe_zip_path, sanitize_zip_path


logger = logging.getLogger(__name__)


class ItemService:
    """Service for Item operations."""

    def __init__(self, repository: Optional[ItemRepository] = None):
        self.repository = repository or ItemRepository()

    def list_items(
        self,
        *,
        q: Optional[str] = None,
        kind: Optional[ItemKind] = None,
        state: Optional[ItemState] = None,
        page: int = 1,
        per_page: int = 50,
    ) -> PaginatedResult[Item]:
        return self.repository.get_all(q=q, kind=kind, state=state, page=page, per_page=per_page)

    def get_item(self, item_id: int) -> Item:
        return self.repository.get_by_id_or_raise(item_id)

    def get_item_path(self, item: Item) -> Path:
        upload_folder = Path(current_app.config["UPLOAD_FOLDER"])
        file_path = upload_folder / item.stored_name

        if not file_path.exists():
            logger.error("Item file missing on disk: %s (item_id=%s)", file_path, item.id)
            raise FileOperationError("Requested file not found on server")

        return file_path

    def upload_files(self, files: list[FileStorage]) -> list[Item]:
        if not files:
            raise ValidationError("No files provided")

        created: list[Item] = []
        for file in files:
            created.append(self._upload_single_file(file))
        return created

    def _upload_single_file(self, file: FileStorage) -> Item:
        if not file or not file.filename:
            raise ValidationError("File is missing a filename")

        raw_name = file.filename.strip() or "unnamed"
        original_name = Path(raw_name).name or "unnamed"

        ext = Path(original_name).suffix
        stored_name = f"{uuid.uuid4().hex}{ext}"

        upload_folder = Path(current_app.config["UPLOAD_FOLDER"])
        upload_folder.mkdir(parents=True, exist_ok=True)

        file_path = upload_folder / stored_name

        try:
            file.save(str(file_path))
            size_bytes = file_path.stat().st_size
        except OSError as e:
            logger.error("Failed to save file: %s", e, exc_info=True)
            raise FileOperationError("Failed to save file")

        mime_type = file.mimetype or mimetypes.guess_type(original_name)[0]

        try:
            item = self.repository.create(
                stored_name=stored_name,
                display_name=original_name,
                kind=ItemKind.FILE,
                mime_type=mime_type,
                size_bytes=size_bytes,
            )
            return item
        except SQLAlchemyError as e:
            file_path.unlink(missing_ok=True)
            logger.error("Database error creating item: %s", e, exc_info=True)
            raise FileOperationError("Failed to create item record")

    def upload_folder(self, files: list[FileStorage], paths: list[str]) -> Item:
        if not files:
            raise ValidationError("No files provided")
        if not paths:
            raise ValidationError("No paths provided")
        if len(files) != len(paths):
            raise ValidationError("Files and paths counts do not match")

        folder_name = self._infer_folder_name(paths)
        stored_name = f"{uuid.uuid4().hex}.zip"

        upload_folder = Path(current_app.config["UPLOAD_FOLDER"])
        upload_folder.mkdir(parents=True, exist_ok=True)
        zip_path = upload_folder / stored_name

        used_paths: set[str] = set()

        try:
            with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
                for file, rel_path in zip(files, paths, strict=True):
                    if not file or not file.filename:
                        raise ValidationError("A folder file is missing a filename")

                    safe_rel = sanitize_zip_path(rel_path)
                    safe_rel = dedupe_zip_path(safe_rel, used_paths)

                    # Stream into the zip without buffering the full file in memory.
                    file.stream.seek(0)
                    with zf.open(safe_rel, "w") as dest:
                        shutil.copyfileobj(file.stream, dest, length=64 * 1024)
        except (OSError, zipfile.BadZipFile) as e:
            zip_path.unlink(missing_ok=True)
            logger.error("Failed to create zip: %s", e, exc_info=True)
            raise FileOperationError("Failed to create folder zip")

        size_bytes = zip_path.stat().st_size
        meta_json = json.dumps(
            {"file_count": len(files), "top_level_dir": folder_name},
            separators=(",", ":"),
        )

        try:
            item = self.repository.create(
                stored_name=stored_name,
                display_name=folder_name,
                kind=ItemKind.FOLDER,
                state=ItemState.ACTIVE,
                mime_type="application/zip",
                size_bytes=size_bytes,
                meta_json=meta_json,
            )
            return item
        except SQLAlchemyError as e:
            zip_path.unlink(missing_ok=True)
            logger.error("Database error creating folder item: %s", e, exc_info=True)
            raise FileOperationError("Failed to create item record")

    def delete_item(self, item_id: int) -> None:
        item = self.repository.get_by_id(item_id)
        if item is None:
            raise NotFoundError(f"Item with ID {item_id} not found")

        if item.state != ItemState.READY_TO_DELETE.value:
            raise ValidationError("Item must be marked 'ready_to_delete' before deletion")

        upload_folder = Path(current_app.config["UPLOAD_FOLDER"])
        file_path = upload_folder / item.stored_name

        try:
            self.repository.delete(item)
        except SQLAlchemyError as e:
            logger.error("Failed to delete item record %s: %s", item_id, e, exc_info=True)
            raise FileOperationError("Failed to delete item record")

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
    ) -> int:
        items = self.repository.find_all(q=q, kind=kind, state=ItemState.READY_TO_DELETE)
        if not items:
            return 0

        upload_folder = Path(current_app.config["UPLOAD_FOLDER"])
        stored_names = [item.stored_name for item in items]

        try:
            self.repository.delete_many(items)
        except SQLAlchemyError as e:
            logger.error("Failed to bulk delete item records: %s", e, exc_info=True)
            raise FileOperationError("Failed to delete item records")

        failures = 0
        for stored_name in stored_names:
            try:
                (upload_folder / stored_name).unlink(missing_ok=True)
            except OSError as e:
                failures += 1
                logger.error(
                    "Failed to delete file %s: %s",
                    upload_folder / stored_name,
                    e,
                    exc_info=True,
                )

        if failures:
            logger.warning("Bulk delete completed with %s file deletion failure(s)", failures)

        return len(stored_names)

    def update_state(self, item_id: int, state: ItemState) -> Item:
        item = self.repository.get_by_id_or_raise(item_id)
        try:
            updated = self.repository.update_state(item, state)
        except SQLAlchemyError as e:
            logger.error("Failed to update item state %s: %s", item_id, e, exc_info=True)
            raise FileOperationError("Failed to update item state")
        return updated

    def get_download_name(self, item: Item) -> str:
        if item.kind == ItemKind.FOLDER.value:
            name = item.display_name
            return name if name.lower().endswith(".zip") else f"{name}.zip"
        return item.display_name

    def _infer_folder_name(self, paths: list[str]) -> str:
        first = sanitize_zip_path(paths[0])
        root = first.split("/", 1)[0]
        root = root.strip() or "folder"
        root = secure_filename(root) or root
        return root
