"""Shared helpers for API and web route modules."""

from __future__ import annotations

from flask import current_app, g, request

from app.services.item_service import ItemService
from app.services.unlock_throttle import UnlockThrottle


def get_service() -> ItemService:
    return g.item_service


def get_throttle() -> UnlockThrottle:
    return current_app.config["UNLOCK_THROTTLE"]


def get_client_ip() -> str:
    return request.remote_addr or "unknown"
