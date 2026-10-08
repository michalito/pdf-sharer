import pytest

from app.config import (
    DEFAULT_MAX_NOTE_TEXT_LENGTH,
    DEFAULT_NOTE_EXCERPT_LENGTH,
    MAX_NOTE_EXCERPT_LENGTH,
    MIN_NOTE_EXCERPT_LENGTH,
    Config,
)


@pytest.fixture(autouse=True)
def production_auth_mode(monkeypatch):
    monkeypatch.setenv("AUTH_MODE", "forward")


def test_max_note_text_length_defaults_when_env_missing(monkeypatch):
    monkeypatch.setenv("SECRET_KEY", "test-secret")
    monkeypatch.delenv("MAX_NOTE_TEXT_LENGTH", raising=False)
    config = Config.from_env()
    assert config.MAX_NOTE_TEXT_LENGTH == DEFAULT_MAX_NOTE_TEXT_LENGTH


@pytest.mark.parametrize("raw", ["", "banana", "0", "-1"])
def test_max_note_text_length_defaults_for_invalid_values(monkeypatch, raw: str):
    monkeypatch.setenv("SECRET_KEY", "test-secret")
    monkeypatch.setenv("MAX_NOTE_TEXT_LENGTH", raw)
    config = Config.from_env()
    assert config.MAX_NOTE_TEXT_LENGTH == DEFAULT_MAX_NOTE_TEXT_LENGTH


def test_max_note_text_length_accepts_positive_integer(monkeypatch):
    monkeypatch.setenv("SECRET_KEY", "test-secret")
    monkeypatch.setenv("MAX_NOTE_TEXT_LENGTH", "123456")
    config = Config.from_env()
    assert config.MAX_NOTE_TEXT_LENGTH == 123456


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


def test_from_env_defaults_session_cookie_secure_to_true(monkeypatch):
    monkeypatch.setenv("SECRET_KEY", "test-secret")
    monkeypatch.delenv("SESSION_COOKIE_SECURE", raising=False)
    config = Config.from_env()
    assert config.SESSION_COOKIE_SECURE is True


@pytest.mark.parametrize("mode", [None, "development", "disabled", ""])
def test_production_requires_explicit_forward_mode(monkeypatch, mode):
    monkeypatch.setenv("SECRET_KEY", "test-secret")
    if mode is None:
        monkeypatch.delenv("AUTH_MODE", raising=False)
    else:
        monkeypatch.setenv("AUTH_MODE", mode)
    with pytest.raises(ValueError, match="AUTH_MODE=forward"):
        Config.from_env()


def test_development_is_consciously_usable_without_idp(monkeypatch):
    monkeypatch.delenv("AUTH_MODE", raising=False)
    assert Config.for_development().AUTH_MODE == "development"


def test_unknown_environment_cannot_silently_enable_development(monkeypatch):
    from app.config import get_config
    monkeypatch.setenv("FLASK_ENV", "prod")
    with pytest.raises(ValueError, match="FLASK_ENV"):
        get_config()


def test_auth_environment_is_passed_to_flask(monkeypatch):
    values = {
        "APP_ORIGIN": "https://saita.test",
        "AUTHENTIK_PROXY_ISSUER": "https://auth.test/application/o/saita/",
        "AUTHENTIK_PROXY_CLIENT_ID": "provider-client",
        "AUTHENTIK_REQUIRED_GROUP": "app-saita",
        "AUTHENTIK_PROXY_CLIENT_SECRET_FILE": "/config/client-secret",
    }
    monkeypatch.setenv("SECRET_KEY", "test-secret")
    for name, value in values.items():
        monkeypatch.setenv(name, value)
    config = Config.from_env()
    for name, value in values.items():
        assert config.to_flask_config()[name] == value


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


def test_relative_sqlite_directories_use_flask_instance_path(test_config, tmp_path, monkeypatch):
    from dataclasses import replace
    from flask import Flask
    import app as app_module

    instance = tmp_path / "instance-root"
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(app_module, "Flask", lambda name: Flask(name, instance_path=str(instance)))
    application = app_module.create_app(replace(test_config, DATABASE_URI="sqlite:///nested/saita.db"))
    with application.app_context():
        app_module.db.create_all()
        assert app_module.db.session.execute(app_module.db.text("PRAGMA foreign_keys")).scalar() == 1
    assert (instance / "nested" / "saita.db").is_file()
    assert not (tmp_path / "nested").exists()


@pytest.mark.parametrize("raw", ["-1", "abc"])
def test_from_env_rejects_invalid_trust_proxy_hops(monkeypatch, raw: str):
    monkeypatch.setenv("SECRET_KEY", "test-secret")
    monkeypatch.setenv("TRUST_PROXY_HOPS", raw)
    with pytest.raises(ValueError, match="TRUST_PROXY_HOPS"):
        Config.from_env()
