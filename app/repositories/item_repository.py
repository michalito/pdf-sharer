"""Item repository for data access operations."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Generic, Optional, TypeVar

from sqlalchemy import and_, func, or_

from app import db
from app.domain.item import Item, ItemKind, ItemState
from app.exceptions import NotFoundError


T = TypeVar("T")


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


class ItemRepository:
    """Repository for Item data access operations."""

    MAX_PER_PAGE = 200

    def find_all(
        self,
        *,
        q: Optional[str] = None,
        kind: Optional[ItemKind] = None,
        state: Optional[ItemState] = None,
        protected: Optional[bool] = None,
    ) -> list[Item]:
        query = Item.query.order_by(Item.created_at.desc())
        query = self._apply_filters(query, q=q, kind=kind, state=state, protected=protected)

        return query.all()

    def get_all(
        self,
        q: Optional[str] = None,
        kind: Optional[ItemKind] = None,
        state: Optional[ItemState] = None,
        protected: Optional[bool] = None,
        page: int = 1,
        per_page: int = 50,
    ) -> PaginatedResult[Item]:
        page = max(1, page)
        per_page = min(max(1, per_page), self.MAX_PER_PAGE)

        query = Item.query.order_by(Item.created_at.desc())
        query = self._apply_filters(query, q=q, kind=kind, state=state, protected=protected)

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
            .order_by(Item.created_at.desc())
            .all()
        )

    def get_by_id_or_raise(self, item_id: int) -> Item:
        item = self.get_by_id(item_id)
        if item is None:
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
        )
        db.session.add(item)
        db.session.commit()
        return item

    def update_state(self, item: Item, state: ItemState) -> Item:
        item.state = state.value
        db.session.commit()
        return item

    def delete(self, item: Item) -> None:
        db.session.delete(item)
        db.session.commit()

    def delete_many(self, items: list[Item]) -> None:
        for item in items:
            db.session.delete(item)
        db.session.commit()

    def _apply_filters(
        self,
        query,
        *,
        q: Optional[str],
        kind: Optional[ItemKind],
        state: Optional[ItemState],
        protected: Optional[bool],
    ):
        if kind is not None:
            query = query.filter(Item.kind == kind.value)

        if state is not None:
            query = query.filter(Item.state == state.value)

        if protected is True:
            query = query.filter(Item.password_hash.is_not(None))
        elif protected is False:
            query = query.filter(Item.password_hash.is_(None))

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
