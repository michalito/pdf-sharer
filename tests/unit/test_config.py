import pytest

from app.config import (
    DEFAULT_NOTE_EXCERPT_LENGTH,
    MAX_NOTE_EXCERPT_LENGTH,
    MIN_NOTE_EXCERPT_LENGTH,
    Config,
)


def test_note_excerpt_length_defaults_when_env_missing(monkeypatch):
    monkeypatch.setenv("SECRET_KEY", "test-secret")
    monkeypatch.delenv("NOTE_EXCERPT_LENGTH", raising=False)
    config = Config.from_env()
    assert config.NOTE_EXCERPT_LENGTH == DEFAULT_NOTE_EXCERPT_LENGTH


def test_note_excerpt_length_is_bounded(monkeypatch):
    monkeypatch.setenv("SECRET_KEY", "test-secret")
    monkeypatch.setenv("NOTE_EXCERPT_LENGTH", "99999")
    config_high = Config.from_env()
    assert config_high.NOTE_EXCERPT_LENGTH == MAX_NOTE_EXCERPT_LENGTH

    monkeypatch.setenv("NOTE_EXCERPT_LENGTH", "1")
    config_low = Config.from_env()
    assert config_low.NOTE_EXCERPT_LENGTH == MIN_NOTE_EXCERPT_LENGTH


def test_from_env_requires_secret_key(monkeypatch):
    monkeypatch.delenv("SECRET_KEY", raising=False)
    with pytest.raises(ValueError, match="SECRET_KEY"):
        Config.from_env()


def test_from_env_rejects_non_sqlite_database_url(monkeypatch):
    monkeypatch.setenv("SECRET_KEY", "test-secret")
    monkeypatch.setenv("DATABASE_URL", "postgresql://user:pass@localhost:5432/saita")
    with pytest.raises(ValueError, match="Only SQLite is supported"):
        Config.from_env()


def test_from_env_defaults_session_cookie_secure_to_false(monkeypatch):
    monkeypatch.setenv("SECRET_KEY", "test-secret")
    monkeypatch.delenv("SESSION_COOKIE_SECURE", raising=False)
    config = Config.from_env()
    assert config.SESSION_COOKIE_SECURE is False


def test_from_env_honors_explicit_session_cookie_secure_override(monkeypatch):
    monkeypatch.setenv("SECRET_KEY", "test-secret")
    monkeypatch.setenv("SESSION_COOKIE_SECURE", "false")
    config = Config.from_env()
    assert config.SESSION_COOKIE_SECURE is False


@pytest.mark.parametrize("raw", ["banana", "truthy", "2"])
def test_from_env_rejects_invalid_session_cookie_secure(monkeypatch, raw: str):
    monkeypatch.setenv("SECRET_KEY", "test-secret")
    monkeypatch.setenv("SESSION_COOKIE_SECURE", raw)
    with pytest.raises(ValueError, match="Boolean environment values"):
        Config.from_env()


def test_from_env_defaults_trust_proxy_hops_to_zero(monkeypatch):
    monkeypatch.setenv("SECRET_KEY", "test-secret")
    monkeypatch.delenv("TRUST_PROXY_HOPS", raising=False)
    config = Config.from_env()
    assert config.TRUST_PROXY_HOPS == 0


def test_from_env_parses_trust_proxy_hops(monkeypatch):
    monkeypatch.setenv("SECRET_KEY", "test-secret")
    monkeypatch.setenv("TRUST_PROXY_HOPS", "1")
    config = Config.from_env()
    assert config.TRUST_PROXY_HOPS == 1


@pytest.mark.parametrize("raw", ["-1", "abc"])
def test_from_env_rejects_invalid_trust_proxy_hops(monkeypatch, raw: str):
    monkeypatch.setenv("SECRET_KEY", "test-secret")
    monkeypatch.setenv("TRUST_PROXY_HOPS", raw)
    with pytest.raises(ValueError, match="TRUST_PROXY_HOPS"):
        Config.from_env()
