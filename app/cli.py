"""Flask CLI commands for application management."""

import click
from flask.cli import with_appcontext

from app import db
from app.domain.item import Item

# ---------------------------------------------------------------------------
# Seed data constants
# ---------------------------------------------------------------------------

_WELCOME_NOTE_TEXT = """\
# Welcome to Saita

Saita is a simple file, link, and note sharing app.

## Features

- **Files**: Upload and share files of any type
- **Links**: Save and organize bookmarks
- **Notes**: Write and share text notes (with *markdown* support)
- **Spaces**: Organize items into named groups
- **Password Protection**: Lock sensitive items with a password
- **TTL Expiration**: Set items to auto-expire after a time period
- **States**: Move items through Active \u2192 Done \u2192 Archived workflow

## Markdown Support

Notes support full markdown syntax, including:

1. Ordered and unordered lists
2. **Bold**, *italic*, and ~~strikethrough~~ text
3. [Links](https://example.com) and images
4. Tables and task lists

> This is a pinned sample note created by the seed command.
"""

_MEETING_NOTES_TEXT = """\
Project sync - April 2025

Attendees: Alice, Bob, Carol

Key points:
- Backend API is feature-complete
- Frontend needs accessibility audit
- Deploy pipeline is green
- Next milestone: v1.2 release

Action items:
- [ ] Alice: write API docs
- [ ] Bob: run lighthouse audit
- [x] Carol: update changelog
"""

_SHOPPING_LIST_TEXT = """\
- Milk
- Bread
- Eggs
- Coffee beans
- Olive oil
- Tomatoes
"""

_SECRET_NOTE_TEXT = """\
This note is password-protected to demonstrate the feature.

The password for this note is: `devpassword`

In production, you would use a real password that you share securely with recipients.
"""

_README_CONTENT = """\
Sample File
===========

This is a sample text file created by the seed command.
It demonstrates file upload and sharing in Saita.
"""

_SVG_CONTENT = """\
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
  <circle cx="50" cy="50" r="45" fill="#4f46e5" opacity="0.9"/>
  <text x="50" y="56" text-anchor="middle" fill="white" font-size="16" font-family="sans-serif">saita</text>
</svg>
"""

_CSV_CONTENT = """\
name,email,role
Alice,alice@example.com,Engineer
Bob,bob@example.com,Designer
Carol,carol@example.com,Manager
"""


def _seed_data(item_service, space_service):
    """Create sample spaces and items for development."""
    from io import BytesIO

    from werkzeug.datastructures import FileStorage

    from app.domain.item import ItemState

    # -- Spaces ---------------------------------------------------------------
    work = space_service.create_space("Work")
    personal = space_service.create_space("Personal")
    click.echo(f"  Created spaces: Work (id={work.id}), Personal (id={personal.id})")

    # -- Notes ----------------------------------------------------------------
    welcome = item_service.create_note(
        text=_WELCOME_NOTE_TEXT, title="Welcome to Saita", force=True,
    )
    item_service.update_item(welcome.id, pinned=True)

    item_service.create_note(
        text=_MEETING_NOTES_TEXT, title="Meeting Notes",
        space_id=work.id, force=True,
    )

    shopping = item_service.create_note(
        text=_SHOPPING_LIST_TEXT, title="Shopping List",
        space_id=personal.id, force=True,
    )
    item_service.update_item(shopping.id, new_state=ItemState.DONE)

    item_service.create_note(
        text=_SECRET_NOTE_TEXT, title="Secret Note",
        password="devpassword", force=True,
    )
    click.echo("  Created 4 notes")

    # -- Links ----------------------------------------------------------------
    item_service.create_link(
        url="https://github.com", name="GitHub",
        space_id=work.id, force=True,
    )
    item_service.create_link(
        url="https://en.wikipedia.org", name="Wikipedia", force=True,
    )
    hn = item_service.create_link(
        url="https://news.ycombinator.com", name="Hacker News", force=True,
    )
    item_service.update_item(hn.id, new_state=ItemState.ARCHIVED)
    click.echo("  Created 3 links")

    # -- Files ----------------------------------------------------------------
    readme = FileStorage(
        stream=BytesIO(_README_CONTENT.encode()),
        filename="readme.txt",
        content_type="text/plain",
    )
    item_service.upload_files([readme], space_id=work.id, force=True)

    svg = FileStorage(
        stream=BytesIO(_SVG_CONTENT.encode()),
        filename="sample.svg",
        content_type="image/svg+xml",
    )
    item_service.upload_files([svg], ttl="7d", force=True)

    csv_file = FileStorage(
        stream=BytesIO(_CSV_CONTENT.encode()),
        filename="data.csv",
        content_type="text/csv",
    )
    item_service.upload_files([csv_file], space_id=personal.id, force=True)
    click.echo("  Created 3 files")


@click.command("prune-orphans")
@click.option("--dry-run", is_flag=True, help="Show what would be deleted without deleting")
@with_appcontext
def prune_orphans_command(dry_run: bool):
    """Remove files from the upload folder that are not referenced by the DB."""
    from pathlib import Path
    from flask import current_app

    upload_folder = Path(current_app.config["UPLOAD_FOLDER"])
    upload_folder.mkdir(parents=True, exist_ok=True)

    stored_names = {row[0] for row in db.session.query(Item.stored_name).all()}
    candidates = [p for p in upload_folder.iterdir() if p.is_file() and p.name not in stored_names]

    if not candidates:
        click.echo("No orphaned files found.")
        return

    click.echo(f"Found {len(candidates)} orphaned file(s) in {upload_folder}:")
    for p in candidates:
        click.echo(f"  - {p.name}")

    if dry_run:
        click.echo("Dry run: no files deleted.")
        return

    deleted = 0
    for p in candidates:
        try:
            p.unlink()
            deleted += 1
        except OSError as e:
            click.echo(f"Failed to delete {p.name}: {e}")

    click.echo(f"Deleted {deleted} orphaned file(s).")


@click.command("expire-items")
@click.option("--dry-run", is_flag=True, help="Show expired items without deleting")
@click.option(
    "--limit",
    default=500,
    type=click.IntRange(min=1),
    show_default=True,
    help="Max items to delete per run",
)
@with_appcontext
def expire_items_command(dry_run: bool, limit: int):
    """Delete items whose TTL has expired."""
    from app.repositories.item_repository import ItemRepository
    from app.services.item_service import ItemService

    service = ItemService(ItemRepository())
    expired = service.repository.find_expired(limit=limit)

    if not expired:
        click.echo("No expired items found.")
        return

    click.echo(f"Found {len(expired)} expired item(s):")
    for item in expired:
        click.echo(f"  - [{item.id}] {item.display_name} (expired {item.expires_at})")

    if dry_run:
        click.echo("Dry run: no items deleted.")
        return

    deleted = service.delete_expired_items(limit=limit)
    click.echo(f"Deleted {deleted} expired item(s).")


@click.command("seed")
@click.option("--force", is_flag=True, help="Clear existing data and re-seed")
@with_appcontext
def seed_command(force: bool):
    """Populate the database with sample data for development."""
    import os
    from pathlib import Path

    from flask import current_app

    from app.domain.space import Space
    from app.domain.unlock_attempt import UnlockAttempt
    from app.repositories.item_repository import ItemRepository
    from app.repositories.space_repository import SpaceRepository
    from app.services.item_service import ItemService
    from app.services.space_service import SpaceService

    if os.environ.get("FLASK_ENV") == "production":
        click.echo("Refusing to seed: FLASK_ENV is 'production'.")
        return

    existing_items = db.session.query(Item.id).count()
    existing_spaces = db.session.query(Space.id).count()
    existing_unlock_attempts = db.session.query(UnlockAttempt.id).count()
    existing_total = existing_items + existing_spaces + existing_unlock_attempts

    if existing_items == 0 and existing_spaces == 0 and existing_unlock_attempts > 0:
        click.echo(
            f"Cleaning up {existing_unlock_attempts} stale unlock attempt(s) left from a previous seed..."
        )
        db.session.query(UnlockAttempt).delete()
        db.session.commit()
        existing_unlock_attempts = 0
        existing_total = 0

    if existing_total > 0 and not force:
        click.echo(
            "Database already has "
            f"{existing_items} item(s), {existing_spaces} space(s), and "
            f"{existing_unlock_attempts} unlock attempt(s). "
            "Skipping seed. Use --force to override."
        )
        return

    if force and existing_total > 0:
        click.echo(
            "Force mode: clearing "
            f"{existing_items} item(s), {existing_spaces} space(s), and "
            f"{existing_unlock_attempts} unlock attempt(s)..."
        )
        upload_folder = Path(current_app.config["UPLOAD_FOLDER"])
        upload_folder.mkdir(parents=True, exist_ok=True)
        # Remove uploaded files from disk
        for p in upload_folder.iterdir():
            if p.is_file():
                p.unlink(missing_ok=True)
        db.session.query(UnlockAttempt).delete()
        db.session.query(Item).delete()
        db.session.query(Space).delete()
        db.session.commit()

    click.echo("Seeding sample data...")
    item_service = ItemService(ItemRepository())
    space_service = SpaceService(SpaceRepository())
    _seed_data(item_service, space_service)
    click.echo("Seed complete! (10 items, 2 spaces)")


def register_cli_commands(app):
    """Register CLI commands with the Flask app."""
    app.cli.add_command(prune_orphans_command)
    app.cli.add_command(expire_items_command)
    app.cli.add_command(seed_command)
