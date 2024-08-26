# Use an official Python runtime as the base image
FROM python:3.9-slim-buster

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1
ENV FLASK_APP run.py
ENV FLASK_RUN_HOST 0.0.0.0

# Set the working directory in the container
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y netcat-openbsd

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the entrypoint script
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Copy the current directory contents into the container
COPY . .

# Create necessary directories
RUN mkdir -p /app/instance /app/uploads

# Create a non-root user
RUN useradd -m myuser

# Change ownership of the app directory to the non-root user
RUN chown -R myuser:myuser /app

# Switch to the non-root user
USER myuser

# Run the entrypoint script
CMD ["/entrypoint.sh"]