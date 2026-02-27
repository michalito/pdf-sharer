FROM node:20-bookworm-slim AS frontend-builder

WORKDIR /frontend

COPY frontend/package.json ./package.json
RUN npm install

COPY frontend/ ./
RUN npm run build

# Python dependencies stage
FROM python:3.12-slim-bookworm AS py-builder

WORKDIR /app

# Install build dependencies
RUN pip install --no-cache-dir --upgrade pip

# Copy and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

# Runtime base (shared by dev/prod)
FROM python:3.12-slim-bookworm AS runtime-base

# Security: Don't run as root
RUN useradd --create-home --shell /bin/bash app

# Set environment variables
ARG APP_VERSION=dev
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/home/app/.local/bin:$PATH" \
    FLASK_APP=run.py \
    APP_VERSION=${APP_VERSION}

WORKDIR /app

# Copy installed packages from builder
COPY --from=py-builder /root/.local /home/app/.local

# Copy application code
COPY --chown=app:app . .

# Create required directories and make entrypoint executable
RUN mkdir -p /app/instance /app/uploads && \
    chown -R app:app /app/instance /app/uploads && \
    chmod +x /app/entrypoint.sh

# Switch to non-root user
USER app

# Expose port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:5000/api/health')" || exit 1

# Entrypoint runs migrations before starting
ENTRYPOINT ["/app/entrypoint.sh"]

# Development image (backend only; frontend runs separately)
FROM runtime-base AS dev
CMD ["flask", "run", "--host=0.0.0.0", "--port=5000", "--reload"]

# Production image (includes built frontend)
FROM runtime-base AS prod
COPY --chown=app:app --from=frontend-builder /frontend/dist/index.html /app/app/templates/index.html
COPY --chown=app:app --from=frontend-builder /frontend/dist/assets /app/app/static/assets
COPY --chown=app:app --from=frontend-builder /frontend/dist/logo.png /app/app/static/logo.png
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "2", "--threads", "4", "run:app"]
