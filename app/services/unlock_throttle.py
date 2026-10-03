"""Database-backed brute-force throttle for item unlock attempts."""

from __future__ import annotations

from contextlib import contextmanager
import fcntl
import hashlib
import json
import os
from pathlib import Path
import time

from flask import current_app
from sqlalchemy import and_, or_
from sqlalchemy.exc import IntegrityError

from app import db
from app.domain.unlock_attempt import UnlockAttempt


class UnlockThrottle:
    """Rate limiter for password unlock attempts scoped per (client_ip, item_id)."""

    def __init__(
        self,
        *,
        max_attempts: int = 5,
        window_seconds: float = 60.0,
        cooldown_seconds: float = 60.0,
        time_func=time.time,
    ):
        self._max_attempts = max_attempts
        self._window_seconds = window_seconds
        self._cooldown_seconds = cooldown_seconds
        self._time = time_func
        self._next_cleanup_at = 0.0

    @contextmanager
    def _lock_state_directory(self, *, exclusive: bool):
        lock_root = Path(current_app.config["UPLOAD_FOLDER"]) / ".unlock-throttle-locks"
        lock_root.mkdir(parents=True, exist_ok=True)
        descriptor = os.open(lock_root, os.O_RDONLY)
        try:
            fcntl.flock(descriptor, fcntl.LOCK_EX if exclusive else fcntl.LOCK_SH)
            yield lock_root
        finally:
            os.close(descriptor)

    @contextmanager
    def serialized_attempt(self, client_ip: str, item_id: int):
        """Keep admission, password verification, and recording under one lock.

        Fixed stripes bound the lock-file count; the shared upload volume also
        coordinates independent workers and containers using the same database.
        """
        now = self._time()
        if now >= self._next_cleanup_at:
            self._next_cleanup_at = now + 60.0
            self.cleanup(limit=500)
        key = f"{client_ip}:{item_id}".encode()
        stripe = hashlib.sha256(key).digest()[0]
        with self._lock_state_directory(exclusive=False) as lock_root:
            with (lock_root / f"{stripe:02x}.lock").open("a+b") as handle:
                fcntl.flock(handle.fileno(), fcntl.LOCK_EX)
                try:
                    yield
                finally:
                    fcntl.flock(handle.fileno(), fcntl.LOCK_UN)

    def check(self, client_ip: str, item_id: int) -> tuple[bool, float]:
        """Check if an unlock attempt is allowed.

        Returns (allowed, retry_after_seconds).
        """
        now = self._time()
        record = self._get_record(client_ip, item_id)
        if record is None:
            return True, 0.0

        timestamps, locked_until, changed = self._normalized_state(record, now)
        if locked_until > now:
            return False, locked_until - now

        return True, 0.0

    def record_failure(self, client_ip: str, item_id: int) -> tuple[bool, float]:
        """Record a failed attempt. Returns (locked_out, retry_after_seconds)."""
        now = self._time()
        record = self._get_or_create_record(client_ip, item_id)
        timestamps, locked_until, _changed = self._normalized_state(record, now)
        timestamps.append(now)
        timestamps = timestamps[-self._max_attempts :]

        if len(timestamps) >= self._max_attempts:
            locked_until = now + self._cooldown_seconds
            self._persist(record, timestamps, locked_until, now)
            return True, self._cooldown_seconds

        self._persist(record, timestamps, locked_until, now)
        return False, 0.0

    def record_success(self, client_ip: str, item_id: int) -> None:
        """Clear failed attempt record on successful unlock."""
        record = self._get_record(client_ip, item_id)
        if record is None:
            return
        self._delete_record(record)

    def cleanup(self, *, limit: int = 500) -> int:
        """Remove stale entries. Returns number of entries removed."""
        with self._lock_state_directory(exclusive=True):
            return self._cleanup_stale_rows(limit=limit)

    def _cleanup_stale_rows(self, *, limit: int) -> int:
        now = self._time()
        stale_cutoff = now - self._window_seconds
        stale = or_(
            and_(UnlockAttempt.locked_until > 0.0, UnlockAttempt.locked_until <= now),
            and_(UnlockAttempt.locked_until <= 0.0, UnlockAttempt.updated_at <= stale_cutoff),
        )
        stale_ids = (
            db.session.query(UnlockAttempt.id)
            .filter(stale)
            .limit(limit)
            .all()
        )
        if not stale_ids:
            return 0
        removed = db.session.query(UnlockAttempt).filter(
            UnlockAttempt.id.in_([row[0] for row in stale_ids]),
            stale,
        ).delete(synchronize_session=False)
        if removed:
            db.session.commit()
        return removed

    @property
    def entry_count(self) -> int:
        return UnlockAttempt.query.count()

    def _get_record(self, client_ip: str, item_id: int) -> UnlockAttempt | None:
        return UnlockAttempt.query.filter_by(client_ip=client_ip, item_id=item_id).first()

    def _get_or_create_record(self, client_ip: str, item_id: int) -> UnlockAttempt:
        record = self._get_record(client_ip, item_id)
        if record is not None:
            return record

        record = UnlockAttempt(client_ip=client_ip, item_id=item_id)
        try:
            with db.session.begin_nested():
                db.session.add(record)
                db.session.flush()
            return record
        except IntegrityError:
            existing = self._get_record(client_ip, item_id)
            if existing is None:
                raise
            return existing

    def _load_timestamps(self, record: UnlockAttempt) -> list[float]:
        try:
            parsed = json.loads(record.attempt_timestamps_json or "[]")
        except json.JSONDecodeError:
            return []
        return [float(ts) for ts in parsed if isinstance(ts, (int, float))]

    def _normalized_state(
        self,
        record: UnlockAttempt,
        now: float,
    ) -> tuple[list[float], float, bool]:
        timestamps = self._load_timestamps(record)[-self._max_attempts :]
        original_timestamps = list(timestamps)
        original_locked_until = float(record.locked_until or 0.0)
        locked_until = original_locked_until

        if locked_until > now:
            return timestamps, locked_until, False

        if locked_until > 0.0:
            locked_until = 0.0
            timestamps = []

        cutoff = now - self._window_seconds
        timestamps = [ts for ts in timestamps if ts > cutoff]
        changed = timestamps != original_timestamps or locked_until != original_locked_until
        return timestamps, locked_until, changed

    def _persist(
        self,
        record: UnlockAttempt,
        timestamps: list[float],
        locked_until: float,
        now: float,
    ) -> None:
        record.attempt_timestamps_json = json.dumps(timestamps, separators=(",", ":"))
        record.locked_until = locked_until
        record.updated_at = now
        db.session.commit()

    def _delete_record(self, record: UnlockAttempt) -> None:
        db.session.delete(record)
        db.session.commit()
