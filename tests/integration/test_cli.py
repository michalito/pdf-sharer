"""Integration tests for Flask CLI commands."""

from flask import Flask


def test_expire_items_cli_accepts_positive_limit(app: Flask):
    runner = app.test_cli_runner()
    result = runner.invoke(args=["expire-items", "--limit", "1", "--dry-run"])

    assert result.exit_code == 0
    assert "No expired items found." in result.output


def test_expire_items_cli_rejects_non_positive_limit(app: Flask):
    runner = app.test_cli_runner()

    for raw_limit in ("0", "-1"):
        result = runner.invoke(args=["expire-items", "--limit", raw_limit])
        assert result.exit_code == 2
        assert "Invalid value for '--limit'" in result.output
