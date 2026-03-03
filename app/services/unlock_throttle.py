"""In-memory brute-force throttle for item unlock attempts."""

from __future__ import annotations

import threading
import time
from dataclasses import dataclass, field


@dataclass
class _AttemptRecord:
    timestamps: list[float] = field(default_factory=list)
    locked_until: float = 0.0


class UnlockThrottle:
    """Rate limiter for password unlock attempts.

    Scoped per (client_ip, item_id). Thread-safe via a single lock.
    """

    def __init__(
        self,
        *,
        max_attempts: int = 5,
        window_seconds: float = 60.0,
        cooldown_seconds: float = 60.0,
        time_func=time.monotonic,
    ):
        self._max_attempts = max_attempts
        self._window_seconds = window_seconds
        self._cooldown_seconds = cooldown_seconds
        self._time = time_func
        self._records: dict[tuple[str, int], _AttemptRecord] = {}
        self._lock = threading.Lock()

    def check(self, client_ip: str, item_id: int) -> tuple[bool, float]:
        """Check if an unlock attempt is allowed.

        Returns (allowed, retry_after_seconds).
        """
        now = self._time()
        key = (client_ip, item_id)

        with self._lock:
            record = self._records.get(key)
            if record is None:
                return True, 0.0

            if record.locked_until > now:
                return False, record.locked_until - now

            # Cooldown expired — reset
            if record.locked_until > 0.0:
                record.locked_until = 0.0
                record.timestamps.clear()

            # Prune stale timestamps
            cutoff = now - self._window_seconds
            record.timestamps = [t for t in record.timestamps if t > cutoff]

            return True, 0.0

    def record_failure(self, client_ip: str, item_id: int) -> tuple[bool, float]:
        """Record a failed attempt. Returns (locked_out, retry_after_seconds)."""
        now = self._time()
        key = (client_ip, item_id)

        with self._lock:
            record = self._records.get(key)
            if record is None:
                record = _AttemptRecord()
                self._records[key] = record

            cutoff = now - self._window_seconds
            record.timestamps = [t for t in record.timestamps if t > cutoff]
            record.timestamps.append(now)

            if len(record.timestamps) >= self._max_attempts:
                record.locked_until = now + self._cooldown_seconds
                return True, self._cooldown_seconds

            return False, 0.0

    def record_success(self, client_ip: str, item_id: int) -> None:
        """Clear failed attempt record on successful unlock."""
        key = (client_ip, item_id)
        with self._lock:
            self._records.pop(key, None)

    def cleanup(self) -> int:
        """Remove stale entries. Returns number of entries removed."""
        now = self._time()
        cutoff = now - self._window_seconds

        with self._lock:
            stale_keys = [
                key
                for key, record in self._records.items()
                if record.locked_until <= now
                and not any(t > cutoff for t in record.timestamps)
            ]
            for key in stale_keys:
                del self._records[key]
            return len(stale_keys)

    @property
    def entry_count(self) -> int:
        with self._lock:
            return len(self._records)
