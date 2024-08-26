#!/bin/bash

set -e

# Wait for the database to be ready (useful in containerized environments)
if [ -n "$DATABASE_URL" ]; then
    echo "Waiting for database..."
    while ! nc -z ${DATABASE_URL/:*} ${DATABASE_URL/*:/}; do
        sleep 1
    done
    echo "Database is up"
fi

# Create the uploads directory if it doesn't exist
mkdir -p uploads

# Check if the database needs to be initialized
if [ ! -d "migrations" ] || [ -z "$(ls -A migrations/versions)" ]; then
    echo "Initializing the database..."
    flask db init
    flask db migrate -m "Initial migration"
    flask db upgrade
else
    echo "Running any pending migrations..."
    flask db upgrade
fi

# Start the Flask application
exec flask run --host=0.0.0.0