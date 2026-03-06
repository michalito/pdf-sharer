"""Unit tests for UnlockThrottle."""

from pathlib import Path

from flask import Flask

from app import create_app, db
from app.config import Config
from app.services.unlock_throttle import UnlockThrottle


class FakeClock:
    def __init__(self, start: float = 0.0):
        self._now = start

    def __call__(self) -> float:
        return self._now

    def advance(self, seconds: float) -> None:
        self._now += seconds


def _make_app(tmp_path: Path, db_name: str) -> Flask:
    config = Config(
        SECRET_KEY="test-secret-key",
        DATABASE_URI=f"sqlite:///{tmp_path / db_name}",
        UPLOAD_FOLDER=tmp_path / "uploads",
        MAX_CONTENT_LENGTH=2 * 1024 * 1024 * 1024,
        SESSION_COOKIE_SECURE=False,
    )
    app = create_app(config)
    app.config["TESTING"] = True
    with app.app_context():
        db.create_all()
    return app


def _make_throttle(clock: FakeClock, **kwargs) -> UnlockThrottle:
    defaults = dict(max_attempts=3, window_seconds=60, cooldown_seconds=60)
    defaults.update(kwargs)
    return UnlockThrottle(**defaults, time_func=clock)


def test_blocks_after_max_failures(tmp_path: Path):
    app = _make_app(tmp_path, "throttle.db")
    clock = FakeClock()
    throttle = _make_throttle(clock, max_attempts=3, cooldown_seconds=60)

    with app.app_context():
        for _ in range(3):
            throttle.record_failure("1.2.3.4", 1)

        allowed, retry = throttle.check("1.2.3.4", 1)
        assert allowed is False
        assert 59 < retry <= 60


def test_success_clears_record(tmp_path: Path):
    app = _make_app(tmp_path, "reset.db")
    clock = FakeClock()
    throttle = _make_throttle(clock, max_attempts=3)

    with app.app_context():
        throttle.record_failure("1.2.3.4", 1)
        throttle.record_failure("1.2.3.4", 1)

        throttle.record_success("1.2.3.4", 1)

        throttle.record_failure("1.2.3.4", 1)
        throttle.record_failure("1.2.3.4", 1)
        allowed, _ = throttle.check("1.2.3.4", 1)
        assert allowed is True
        assert throttle.entry_count == 1


def test_sliding_window_evicts_old_attempts(tmp_path: Path):
    app = _make_app(tmp_path, "window.db")
    clock = FakeClock()
    throttle = _make_throttle(clock, max_attempts=3, window_seconds=60)

    with app.app_context():
        throttle.record_failure("1.2.3.4", 1)
        throttle.record_failure("1.2.3.4", 1)

        clock.advance(61)

        throttle.record_failure("1.2.3.4", 1)

        allowed, _ = throttle.check("1.2.3.4", 1)
        assert allowed is True


def test_cleanup_removes_stale_entries(tmp_path: Path):
    app = _make_app(tmp_path, "cleanup.db")
    clock = FakeClock()
    throttle = _make_throttle(clock, window_seconds=60)

    with app.app_context():
        throttle.record_failure("1.2.3.4", 1)
        assert throttle.entry_count == 1

        clock.advance(61)

        removed = throttle.cleanup()
        assert removed == 1
        assert throttle.entry_count == 0


def test_different_items_independent(tmp_path: Path):
    app = _make_app(tmp_path, "scoped-items.db")
    clock = FakeClock()
    throttle = _make_throttle(clock, max_attempts=2)

    with app.app_context():
        throttle.record_failure("1.2.3.4", 1)
        throttle.record_failure("1.2.3.4", 1)

        allowed_1, _ = throttle.check("1.2.3.4", 1)
        allowed_2, _ = throttle.check("1.2.3.4", 2)
        assert allowed_1 is False
        assert allowed_2 is True


def test_different_ips_independent(tmp_path: Path):
    app = _make_app(tmp_path, "scoped-ips.db")
    clock = FakeClock()
    throttle = _make_throttle(clock, max_attempts=2)

    with app.app_context():
        throttle.record_failure("1.2.3.4", 1)
        throttle.record_failure("1.2.3.4", 1)

        allowed_blocked, _ = throttle.check("1.2.3.4", 1)
        allowed_other, _ = throttle.check("5.6.7.8", 1)
        assert allowed_blocked is False
        assert allowed_other is True


def test_cooldown_retry_after_decreases(tmp_path: Path):
    app = _make_app(tmp_path, "retry-after.db")
    clock = FakeClock()
    throttle = _make_throttle(clock, max_attempts=1, cooldown_seconds=60)

    with app.app_context():
        throttle.record_failure("1.2.3.4", 1)
        _, retry1 = throttle.check("1.2.3.4", 1)

        clock.advance(20)

        _, retry2 = throttle.check("1.2.3.4", 1)
        assert retry2 < retry1
        assert 39 < retry2 <= 40


def test_record_failure_returns_lockout_status(tmp_path: Path):
    app = _make_app(tmp_path, "record-failure.db")
    clock = FakeClock()
    throttle = _make_throttle(clock, max_attempts=2, cooldown_seconds=60)

    with app.app_context():
        locked, cooldown = throttle.record_failure("1.2.3.4", 1)
        assert locked is False
        assert cooldown == 0.0

        locked, cooldown = throttle.record_failure("1.2.3.4", 1)
        assert locked is True
        assert cooldown == 60


def test_record_success_on_unknown_key_is_noop(tmp_path: Path):
    app = _make_app(tmp_path, "success-noop.db")
    clock = FakeClock()
    throttle = _make_throttle(clock)

    with app.app_context():
        throttle.record_success("1.2.3.4", 999)
        assert throttle.entry_count == 0


def test_cleanup_preserves_active_lockouts(tmp_path: Path):
    app = _make_app(tmp_path, "cleanup-lockout.db")
    clock = FakeClock()
    throttle = _make_throttle(clock, max_attempts=2, cooldown_seconds=120, window_seconds=60)

    with app.app_context():
        throttle.record_failure("1.2.3.4", 1)
        throttle.record_failure("1.2.3.4", 1)

        clock.advance(61)

        removed = throttle.cleanup()
        assert removed == 0
        assert throttle.entry_count == 1


def test_cleanup_removes_expired_lockout_before_window_cutoff(tmp_path: Path):
    app = _make_app(tmp_path, "cleanup-expired-lockout.db")
    clock = FakeClock()
    throttle = _make_throttle(clock, max_attempts=2, cooldown_seconds=30, window_seconds=60)

    with app.app_context():
        throttle.record_failure("1.2.3.4", 1)
        throttle.record_failure("1.2.3.4", 1)
        assert throttle.entry_count == 1

        clock.advance(31)

        removed = throttle.cleanup()
        assert removed == 1
        assert throttle.entry_count == 0


def test_persists_state_across_app_instances(tmp_path: Path):
    app1 = _make_app(tmp_path, "shared.db")
    app2 = _make_app(tmp_path, "shared.db")
    clock = FakeClock(start=100.0)

    with app1.app_context():
        throttle1 = _make_throttle(clock, max_attempts=2, cooldown_seconds=30)
        throttle1.record_failure("1.2.3.4", 7)
        throttle1.record_failure("1.2.3.4", 7)

    with app2.app_context():
        throttle2 = _make_throttle(clock, max_attempts=2, cooldown_seconds=30)
        allowed, retry = throttle2.check("1.2.3.4", 7)
        assert allowed is False
        assert 29 < retry <= 30
