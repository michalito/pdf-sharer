#!/bin/bash
set -e

echo "=== File Sharer Container Starting ==="

# Wait for external database if configured
if [[ -n "${DATABASE_URL:-}" ]] && [[ "$DATABASE_URL" != sqlite* ]]; then
    echo "Waiting for database to be ready..."
    sleep 3
fi

# Run database migrations with explicit error handling
echo "Running database migrations..."
if ! flask db upgrade; then
    echo "ERROR: Database migration failed!"
    echo "Please check the migration files and database connectivity."
    exit 1
fi

# Verify migrations were applied successfully
echo "Verifying database state..."
if ! flask db current; then
    echo "ERROR: Could not verify database migration state!"
    exit 1
fi

echo "Migrations complete. Starting application..."

# Execute the main command (gunicorn)
exec "$@"
