"""Item repository for data access operations."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Generic, Literal, Optional, TypeVar

from sqlalchemy import and_, func, or_
from sqlalchemy.orm import joinedload

from app import db
from app.domain.item import Item, ItemKind, ItemState
from app.exceptions import NotFoundError


T = TypeVar("T")

SortField = Literal["name", "size", "created", "modified"]
SortOrder = Literal["asc", "desc"]


@dataclass
class PaginatedResult(Generic[T]):
    """Container for paginated query results."""

    items: list[T]
    total: int
    page: int
    per_page: int
    pages: int
    has_next: bool
    has_prev: bool

    def to_dict(self) -> dict:
        return {
            "total": self.total,
            "page": self.page,
            "perPage": self.per_page,
            "pages": self.pages,
            "hasNext": self.has_next,
            "hasPrev": self.has_prev,
        }


@dataclass
class StorageStats:
    """Aggregate storage statistics from the items table."""

    total_count: int
    total_size_bytes: int
    count_by_kind: dict[str, int]
    size_by_kind: dict[str, int]
    count_by_state: dict[str, int]
    largest_items: list[Item]


class ItemRepository:
    """Repository for Item data access operations."""

    MAX_PER_PAGE = 200

    def _build_order_by(self, sort: SortField, order: SortOrder):
        """Return SQLAlchemy order_by clauses: pinned first, then sort field, then id tie-breaker."""
        direction = lambda col: col.asc() if order == "asc" else col.desc()

        if sort == "name":
            secondary = direction(func.lower(Item.display_name))
        elif sort == "size":
            secondary = direction(Item.size_bytes)
        elif sort == "modified":
            secondary = direction(Item.updated_at)
        else:  # "created"
            secondary = direction(Item.created_at)

        return [Item.is_pinned.desc(), secondary, direction(Item.id)]

    def find_all(
        self,
        *,
        q: Optional[str] = None,
        kind: Optional[ItemKind] = None,
        state: Optional[ItemState] = None,
        protected: Optional[bool] = None,
        space_id: Optional[int] = None,
        unspaced: Optional[bool] = None,
        sort: SortField = "created",
        order: SortOrder = "desc",
    ) -> list[Item]:
        query = Item.query.options(joinedload(Item.space)).order_by(
            *self._build_order_by(sort, order),
        )
        query = self._exclude_expired(query)
        query = self._apply_filters(
            query, q=q, kind=kind, state=state, protected=protected,
            space_id=space_id, unspaced=unspaced,
        )

        return query.all()

    def get_all(
        self,
        q: Optional[str] = None,
        kind: Optional[ItemKind] = None,
        state: Optional[ItemState] = None,
        protected: Optional[bool] = None,
        space_id: Optional[int] = None,
        unspaced: Optional[bool] = None,
        page: int = 1,
        per_page: int = 50,
        sort: SortField = "created",
        order: SortOrder = "desc",
    ) -> PaginatedResult[Item]:
        page = max(1, page)
        per_page = min(max(1, per_page), self.MAX_PER_PAGE)

        query = Item.query.options(joinedload(Item.space)).order_by(
            *self._build_order_by(sort, order),
        )
        query = self._exclude_expired(query)
        query = self._apply_filters(
            query, q=q, kind=kind, state=state, protected=protected,
            space_id=space_id, unspaced=unspaced,
        )

        total = query.count()
        pages = (total + per_page - 1) // per_page if total > 0 else 1
        page = min(page, pages)
        offset = (page - 1) * per_page

        items = query.offset(offset).limit(per_page).all()

        return PaginatedResult(
            items=items,
            total=total,
            page=page,
            per_page=per_page,
            pages=pages,
            has_next=page < pages,
            has_prev=page > 1,
        )

    def get_by_id(self, item_id: int) -> Optional[Item]:
        return db.session.get(Item, item_id)

    def get_by_state(self, state: ItemState) -> list[Item]:
        return (
            Item.query.filter(Item.state == state.value)
            .order_by(Item.is_pinned.desc(), Item.created_at.desc())
            .all()
        )

    def get_by_id_or_raise(self, item_id: int) -> Item:
        item = self.get_by_id(item_id)
        if item is None:
            raise NotFoundError(f"Item with ID {item_id} not found")
        if item.is_expired:
            raise NotFoundError(f"Item with ID {item_id} not found")
        return item

    def create(
        self,
        *,
        stored_name: str,
        display_name: str,
        kind: ItemKind,
        state: ItemState = ItemState.ACTIVE,
        mime_type: Optional[str],
        size_bytes: int,
        meta_json: Optional[str] = None,
        password_hash: Optional[str] = None,
        space_id: Optional[int] = None,
        expires_at: Optional[datetime] = None,
    ) -> Item:
        item = Item(
            stored_name=stored_name,
            display_name=display_name,
            kind=kind.value,
            state=state.value,
            mime_type=mime_type,
            size_bytes=size_bytes,
            meta_json=meta_json,
            password_hash=password_hash,
            space_id=space_id,
            expires_at=expires_at,
        )
        db.session.add(item)
        db.session.commit()
        return item

    def update_state(self, item: Item, state: ItemState) -> Item:
        item.state = state.value
        db.session.commit()
        return item

    def update_item_fields(
        self,
        item: Item,
        *,
        new_state: Optional[ItemState] = None,
        new_space_id: Optional[int] = None,
        update_space: bool = False,
        pinned: Optional[bool] = None,
    ) -> Item:
        """Apply state, space, and/or pinned changes in a single commit."""
        if new_state is not None:
            item.state = new_state.value
        if update_space:
            item.space_id = new_space_id
        if pinned is not None:
            item.is_pinned = pinned
        item.updated_at = datetime.now(timezone.utc)
        db.session.commit()
        return item

    def delete(self, item: Item) -> None:
        db.session.delete(item)
        db.session.commit()

    def delete_many(self, items: list[Item]) -> None:
        for item in items:
            db.session.delete(item)
        db.session.commit()

    def update_space(self, item: Item, space_id: Optional[int]) -> Item:
        item.space_id = space_id
        db.session.commit()
        return item

    def get_storage_stats(self, *, top_n: int = 10) -> StorageStats:
        """Compute aggregate storage statistics in minimal DB round-trips."""
        kind_rows = (
            db.session.query(
                Item.kind,
                func.count(Item.id),
                func.coalesce(func.sum(Item.size_bytes), 0),
            )
            .group_by(Item.kind)
            .all()
        )

        count_by_kind: dict[str, int] = {}
        size_by_kind: dict[str, int] = {}
        total_count = 0
        total_size = 0
        for kind_val, cnt, sz in kind_rows:
            count_by_kind[kind_val] = cnt
            size_by_kind[kind_val] = sz
            total_count += cnt
            total_size += sz

        state_rows = (
            db.session.query(
                Item.state,
                func.count(Item.id),
            )
            .group_by(Item.state)
            .all()
        )
        count_by_state = {state_val: cnt for state_val, cnt in state_rows}

        largest_items = (
            Item.query.options(joinedload(Item.space))
            .filter(Item.kind.in_([ItemKind.FILE.value, ItemKind.FOLDER.value]))
            .order_by(Item.size_bytes.desc())
            .limit(top_n)
            .all()
        )

        return StorageStats(
            total_count=total_count,
            total_size_bytes=total_size,
            count_by_kind=count_by_kind,
            size_by_kind=size_by_kind,
            count_by_state=count_by_state,
            largest_items=largest_items,
        )

    def find_expired(self, *, limit: int = 100) -> list[Item]:
        now = datetime.now(timezone.utc)
        return (
            Item.query.filter(
                Item.expires_at.is_not(None),
                Item.expires_at <= now,
            )
            .limit(limit)
            .all()
        )

    def _exclude_expired(self, query):
        now = datetime.now(timezone.utc)
        return query.filter(
            or_(Item.expires_at.is_(None), Item.expires_at > now)
        )

    def _apply_filters(
        self,
        query,
        *,
        q: Optional[str],
        kind: Optional[ItemKind],
        state: Optional[ItemState],
        protected: Optional[bool],
        space_id: Optional[int] = None,
        unspaced: Optional[bool] = None,
    ):
        if kind is not None:
            query = query.filter(Item.kind == kind.value)

        if state is not None:
            query = query.filter(Item.state == state.value)

        if protected is True:
            query = query.filter(Item.password_hash.is_not(None))
        elif protected is False:
            query = query.filter(Item.password_hash.is_(None))

        if space_id is not None:
            query = query.filter(Item.space_id == space_id)
        elif unspaced is True:
            query = query.filter(Item.space_id.is_(None))

        search = q.strip().lower() if q else ""
        if search:
            needle = f"%{search}%"
            display_name_match = func.lower(Item.display_name).like(needle)
            note_text_match = and_(
                Item.kind == ItemKind.NOTE.value,
                Item.password_hash.is_(None),
                func.lower(func.coalesce(Item.meta_json, "")).like(needle),
            )
            query = query.filter(or_(display_name_match, note_text_match))

        return query
