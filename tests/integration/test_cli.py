"""Integration tests for Flask CLI commands."""

from flask import Flask

from app import db
from app.domain.item import Item
from app.domain.space import Space
from app.domain.unlock_attempt import UnlockAttempt


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


def test_seed_cli_creates_sample_data(app: Flask):
    runner = app.test_cli_runner()

    result = runner.invoke(args=["seed"])

    assert result.exit_code == 0
    assert "Seed complete! (10 items, 2 spaces)" in result.output

    with app.app_context():
        assert Item.query.count() == 10
        assert Space.query.count() == 2
        assert UnlockAttempt.query.count() == 0


def test_seed_cli_skips_when_spaces_exist_without_force(app: Flask):
    runner = app.test_cli_runner()

    with app.app_context():
        db.session.add(Space(name="Work", normalized_name="work", position=0))
        db.session.commit()

    result = runner.invoke(args=["seed"])

    assert result.exit_code == 0
    assert (
        "Database already has 0 item(s), 1 space(s), and 0 unlock attempt(s). "
        "Skipping seed. Use --force to override."
    ) in result.output

    with app.app_context():
        assert Item.query.count() == 0
        assert Space.query.count() == 1


def test_seed_cli_force_clears_existing_unlock_attempts(app: Flask):
    runner = app.test_cli_runner()

    first_seed = runner.invoke(args=["seed"])
    assert first_seed.exit_code == 0

    with app.app_context():
        first_item = Item.query.order_by(Item.id).first()
        assert first_item is not None
        db.session.add(UnlockAttempt(client_ip="1.2.3.4", item_id=first_item.id))
        db.session.commit()

    result = runner.invoke(args=["seed", "--force"])

    assert result.exit_code == 0
    assert "Force mode: clearing 10 item(s), 2 space(s), and 1 unlock attempt(s)..." in result.output

    with app.app_context():
        assert Item.query.count() == 10
        assert Space.query.count() == 2
        assert UnlockAttempt.query.count() == 0


def test_seed_cli_recovers_from_stale_unlock_attempts(app: Flask):
    runner = app.test_cli_runner()

    with app.app_context():
        db.session.add(UnlockAttempt(client_ip="1.2.3.4", item_id=1))
        db.session.commit()

    result = runner.invoke(args=["seed"])

    assert result.exit_code == 0
    assert "Cleaning up 1 stale unlock attempt(s) left from a previous seed..." in result.output
    assert "Seed complete! (10 items, 2 spaces)" in result.output

    with app.app_context():
        assert Item.query.count() == 10
        assert Space.query.count() == 2
        assert UnlockAttempt.query.count() == 0
