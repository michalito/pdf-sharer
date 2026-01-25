"""Flask CLI commands for application management."""

import click
from flask import current_app
from flask.cli import with_appcontext

from app import db
from app.domain.user import User


@click.command("create-admin")
@click.option("--username", default="admin", help="Admin username")
@click.option("--password", default=None, help="Admin password (auto-generated if not provided)")
@click.option("--force", is_flag=True, help="Recreate admin user if exists")
@with_appcontext
def create_admin_command(username: str, password: str, force: bool):
    """Create an admin user for the application."""
    import secrets

    existing_user = User.query.filter_by(username=username).first()

    if existing_user and not force:
        click.echo(f"User '{username}' already exists. Use --force to recreate.")
        return

    if existing_user and force:
        db.session.delete(existing_user)
        db.session.commit()
        click.echo(f"Deleted existing user '{username}'")

    # Generate password if not provided
    if not password:
        password = secrets.token_urlsafe(12)
        generated = True
    else:
        generated = False

    user = User(username=username)
    user.set_password(password)
    db.session.add(user)
    db.session.commit()

    click.echo("")
    click.echo("=" * 50)
    click.echo("Admin user created successfully!")
    click.echo("=" * 50)
    click.echo(f"  Username: {username}")
    if generated:
        click.echo(f"  Password: {password}")
        click.echo("")
        click.echo("  (Save this password - it won't be shown again)")
    click.echo("=" * 50)
    click.echo("")


@click.command("list-users")
@with_appcontext
def list_users_command():
    """List all users in the application."""
    users = User.query.all()

    if not users:
        click.echo("No users found.")
        return

    click.echo("")
    click.echo(f"{'ID':<6} {'Username':<20} {'Created':<25}")
    click.echo("-" * 51)
    for user in users:
        created = user.created_at.strftime("%Y-%m-%d %H:%M:%S")
        click.echo(f"{user.id:<6} {user.username:<20} {created:<25}")
    click.echo("")
    click.echo(f"Total: {len(users)} user(s)")


@click.command("delete-user")
@click.argument("username")
@with_appcontext
def delete_user_command(username: str):
    """Delete a user by username."""
    user = User.query.filter_by(username=username).first()

    if not user:
        click.echo(f"User '{username}' not found.")
        return

    # Count user's PDFs
    pdf_count = user.pdfs.count()

    if pdf_count > 0:
        if not click.confirm(f"User '{username}' has {pdf_count} PDF(s). Delete anyway?"):
            click.echo("Cancelled.")
            return

    db.session.delete(user)
    db.session.commit()
    click.echo(f"User '{username}' deleted.")


@click.command("cleanup-deleted")
@click.option("--days", default=7, help="Delete PDFs soft-deleted more than N days ago")
@click.option("--dry-run", is_flag=True, help="Show what would be deleted without deleting")
@with_appcontext
def cleanup_deleted_command(days: int, dry_run: bool):
    """Permanently delete soft-deleted PDFs older than N days."""
    from app.repositories.pdf_repository import PDFRepository
    from app.services.pdf_service import PDFService

    service = PDFService(PDFRepository())

    if dry_run:
        deleted_pdfs = service.repository.get_deleted_pdfs(older_than_days=days)
        click.echo(f"Would delete {len(deleted_pdfs)} PDF(s) soft-deleted more than {days} days ago:")
        for pdf in deleted_pdfs:
            click.echo(f"  - {pdf.id}: {pdf.original_filename} (deleted: {pdf.deleted_at})")
    else:
        count = service.cleanup_deleted_pdfs(days=days)
        click.echo(f"Permanently deleted {count} PDF(s).")


def register_cli_commands(app):
    """Register CLI commands with the Flask app."""
    app.cli.add_command(create_admin_command)
    app.cli.add_command(list_users_command)
    app.cli.add_command(delete_user_command)
    app.cli.add_command(cleanup_deleted_command)
