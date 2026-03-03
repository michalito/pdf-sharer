"""Unit tests for UnlockThrottle."""

import threading

from app.services.unlock_throttle import UnlockThrottle


class FakeClock:
    def __init__(self, start: float = 0.0):
        self._now = start

    def __call__(self) -> float:
        return self._now

    def advance(self, seconds: float) -> None:
        self._now += seconds


def _make(clock: FakeClock, **kwargs) -> UnlockThrottle:
    defaults = dict(max_attempts=3, window_seconds=60, cooldown_seconds=60)
    defaults.update(kwargs)
    return UnlockThrottle(**defaults, time_func=clock)


# --- basic allow / block ---


def test_allows_first_attempt():
    clock = FakeClock()
    throttle = _make(clock)
    allowed, retry = throttle.check("1.2.3.4", 1)
    assert allowed is True
    assert retry == 0.0


def test_blocks_after_max_failures():
    clock = FakeClock()
    throttle = _make(clock, max_attempts=3, cooldown_seconds=60)

    for _ in range(3):
        throttle.record_failure("1.2.3.4", 1)

    allowed, retry = throttle.check("1.2.3.4", 1)
    assert allowed is False
    assert 59 < retry <= 60


def test_allows_below_max_failures():
    clock = FakeClock()
    throttle = _make(clock, max_attempts=3)

    throttle.record_failure("1.2.3.4", 1)
    throttle.record_failure("1.2.3.4", 1)

    allowed, _ = throttle.check("1.2.3.4", 1)
    assert allowed is True


# --- scoping ---


def test_different_items_independent():
    clock = FakeClock()
    throttle = _make(clock, max_attempts=2)

    throttle.record_failure("1.2.3.4", 1)
    throttle.record_failure("1.2.3.4", 1)

    allowed_1, _ = throttle.check("1.2.3.4", 1)
    assert allowed_1 is False

    allowed_2, _ = throttle.check("1.2.3.4", 2)
    assert allowed_2 is True


def test_different_ips_independent():
    clock = FakeClock()
    throttle = _make(clock, max_attempts=2)

    throttle.record_failure("1.2.3.4", 1)
    throttle.record_failure("1.2.3.4", 1)

    allowed_blocked, _ = throttle.check("1.2.3.4", 1)
    assert allowed_blocked is False

    allowed_other, _ = throttle.check("5.6.7.8", 1)
    assert allowed_other is True


# --- cooldown ---


def test_cooldown_expires():
    clock = FakeClock()
    throttle = _make(clock, max_attempts=2, cooldown_seconds=30)

    throttle.record_failure("1.2.3.4", 1)
    throttle.record_failure("1.2.3.4", 1)

    allowed, _ = throttle.check("1.2.3.4", 1)
    assert allowed is False

    clock.advance(31)

    allowed, _ = throttle.check("1.2.3.4", 1)
    assert allowed is True


def test_cooldown_retry_after_decreases():
    clock = FakeClock()
    throttle = _make(clock, max_attempts=1, cooldown_seconds=60)

    throttle.record_failure("1.2.3.4", 1)

    _, retry1 = throttle.check("1.2.3.4", 1)
    clock.advance(20)
    _, retry2 = throttle.check("1.2.3.4", 1)

    assert retry2 < retry1
    assert 39 < retry2 <= 40


# --- success reset ---


def test_success_clears_record():
    clock = FakeClock()
    throttle = _make(clock, max_attempts=3)

    throttle.record_failure("1.2.3.4", 1)
    throttle.record_failure("1.2.3.4", 1)

    throttle.record_success("1.2.3.4", 1)

    # Back to zero — two more failures should not trigger lockout
    throttle.record_failure("1.2.3.4", 1)
    throttle.record_failure("1.2.3.4", 1)
    allowed, _ = throttle.check("1.2.3.4", 1)
    assert allowed is True


def test_success_on_unknown_key_is_noop():
    clock = FakeClock()
    throttle = _make(clock)
    throttle.record_success("1.2.3.4", 999)
    assert throttle.entry_count == 0


# --- sliding window ---


def test_sliding_window_evicts_old_attempts():
    clock = FakeClock()
    throttle = _make(clock, max_attempts=3, window_seconds=60)

    throttle.record_failure("1.2.3.4", 1)
    throttle.record_failure("1.2.3.4", 1)

    clock.advance(61)  # Both failures now outside window

    throttle.record_failure("1.2.3.4", 1)  # Only 1 in window

    allowed, _ = throttle.check("1.2.3.4", 1)
    assert allowed is True


# --- record_failure return value ---


def test_record_failure_returns_lockout_status():
    clock = FakeClock()
    throttle = _make(clock, max_attempts=2, cooldown_seconds=60)

    locked, _ = throttle.record_failure("1.2.3.4", 1)
    assert locked is False

    locked, cooldown = throttle.record_failure("1.2.3.4", 1)
    assert locked is True
    assert cooldown == 60


# --- cleanup ---


def test_cleanup_removes_stale_entries():
    clock = FakeClock()
    throttle = _make(clock, max_attempts=3, window_seconds=60)

    throttle.record_failure("1.2.3.4", 1)
    assert throttle.entry_count == 1

    clock.advance(61)

    removed = throttle.cleanup()
    assert removed == 1
    assert throttle.entry_count == 0


def test_cleanup_preserves_active_lockouts():
    clock = FakeClock()
    throttle = _make(clock, max_attempts=2, cooldown_seconds=120, window_seconds=60)

    throttle.record_failure("1.2.3.4", 1)
    throttle.record_failure("1.2.3.4", 1)

    clock.advance(61)  # Timestamps stale but lockout still active (120s)

    removed = throttle.cleanup()
    assert removed == 0
    assert throttle.entry_count == 1


# --- thread safety ---


def test_thread_safety():
    clock = FakeClock(start=100.0)
    throttle = _make(clock, max_attempts=1000, window_seconds=60)

    errors: list[Exception] = []

    def hammer():
        try:
            for _ in range(50):
                throttle.check("1.2.3.4", 1)
                throttle.record_failure("1.2.3.4", 1)
        except Exception as e:
            errors.append(e)

    threads = [threading.Thread(target=hammer) for _ in range(4)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert not errors
