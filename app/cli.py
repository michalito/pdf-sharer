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


def register_cli_commands(app):
    """Register CLI commands with the Flask app."""
    app.cli.add_command(prune_orphans_command)
