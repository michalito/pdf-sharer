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
