"""Flask CLI commands for application management."""

import click
from flask.cli import with_appcontext

from app import db
from app.domain.item import Item


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


def register_cli_commands(app):
    """Register CLI commands with the Flask app."""
    app.cli.add_command(prune_orphans_command)
    app.cli.add_command(expire_items_command)
