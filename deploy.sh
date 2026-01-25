#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# PDF Sharer Deployment Script
# =============================================================================

# Configuration
PROJECT_NAME="pdf-sharer"
DEFAULT_PORT=5001  # Avoid macOS AirPlay conflict on port 5000

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# -----------------------------------------------------------------------------
# Helper Functions
# -----------------------------------------------------------------------------

info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[OK]${NC} $1"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
error()   { echo -e "${RED}[ERROR]${NC} $1" >&2; }
die()     { error "$1"; exit 1; }

check_dependencies() {
    for cmd in "$@"; do
        if ! command -v "$cmd" &> /dev/null; then
            die "Required command not found: $cmd"
        fi
    done
}

generate_secret_key() {
    python3 -c "import secrets; print(secrets.token_hex(32))"
}

ensure_env_file() {
    if [[ ! -f .env ]]; then
        if [[ -f .env.example ]]; then
            cp .env.example .env
            info "Created .env from .env.example"
        else
            touch .env
        fi
    fi

    # Ensure SECRET_KEY exists for production
    if ! grep -q "^SECRET_KEY=." .env 2>/dev/null; then
        local secret_key
        secret_key=$(generate_secret_key)
        if grep -q "^SECRET_KEY=" .env 2>/dev/null; then
            if [[ "$OSTYPE" == "darwin"* ]]; then
                sed -i '' "s/^SECRET_KEY=.*/SECRET_KEY=$secret_key/" .env
            else
                sed -i "s/^SECRET_KEY=.*/SECRET_KEY=$secret_key/" .env
            fi
        else
            echo "SECRET_KEY=$secret_key" >> .env
        fi
        success "Generated SECRET_KEY"
    fi
}

load_env() {
    if [[ -f .env ]]; then
        set -a
        source .env
        set +a
    fi
}

wait_for_health() {
    local timeout="${1:-60}"
    local container="${PROJECT_NAME}-web-1"
    local interval=2
    local elapsed=0

    while [[ $elapsed -lt $timeout ]]; do
        local health
        health=$(docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null || echo "starting")

        case "$health" in
            healthy)
                return 0
                ;;
            unhealthy)
                warn "Container is unhealthy!"
                return 1
                ;;
            *)
                sleep $interval
                elapsed=$((elapsed + interval))
                ;;
        esac
    done

    return 1
}

is_container_running() {
    local compose_file="${1:-docker-compose.yaml}"
    docker compose -f "$compose_file" ps --quiet web 2>/dev/null | grep -q .
}

get_running_compose_file() {
    if docker compose -f docker-compose.dev.yaml ps --quiet web 2>/dev/null | grep -q .; then
        echo "docker-compose.dev.yaml"
    elif docker compose -f docker-compose.yaml ps --quiet web 2>/dev/null | grep -q .; then
        echo "docker-compose.yaml"
    else
        echo ""
    fi
}

# -----------------------------------------------------------------------------
# Development Commands
# -----------------------------------------------------------------------------

cmd_dev() {
    local action="${1:-up}"

    check_dependencies docker

    case "$action" in
        up|start)
            info "Starting development containers..."
            load_env

            # Build and start with dev config (detached)
            docker compose -f docker-compose.dev.yaml build
            docker compose -f docker-compose.dev.yaml up -d

            # Run migrations
            info "Running database migrations..."
            sleep 2
            docker compose -f docker-compose.dev.yaml exec web flask db upgrade

            # Create/reset admin user with easy dev password
            info "Ensuring admin user with dev password..."
            docker compose -f docker-compose.dev.yaml exec web flask create-admin --username admin --password admin123 --force 2>/dev/null || true

            success "Development server running at http://localhost:${HOST_PORT:-$DEFAULT_PORT}"
            echo ""
            echo "=== Development Credentials ==="
            echo "  Username: admin"
            echo "  Password: admin123"
            echo ""
            info "Code changes will auto-reload. View logs with: ./deploy.sh logs"
            ;;
        down|stop)
            info "Stopping development containers..."
            docker compose -f docker-compose.dev.yaml down
            success "Containers stopped"
            ;;
        restart)
            info "Restarting development containers..."
            docker compose -f docker-compose.dev.yaml restart
            success "Containers restarted"
            ;;
        *)
            die "Unknown dev action: $action. Use 'up', 'down', or 'restart'."
            ;;
    esac
}

# -----------------------------------------------------------------------------
# Production Commands
# -----------------------------------------------------------------------------

cmd_prod() {
    local action="${1:-up}"

    check_dependencies docker

    case "$action" in
        up|start)
            info "Starting production containers..."
            ensure_env_file
            load_env

            # Build and start (detached)
            docker compose build
            docker compose up -d

            # Wait for health
            info "Waiting for application to be healthy..."
            if wait_for_health 60; then
                success "Application is running and healthy!"

                # Create admin user with auto-generated password (capture output)
                info "Ensuring admin user exists..."
                local admin_output
                admin_output=$(docker compose exec -T web flask create-admin --username admin 2>&1) || true

                echo ""
                cmd_status

                # Print admin credentials if newly created
                if echo "$admin_output" | grep -q "Admin user created"; then
                    echo ""
                    echo "$admin_output"
                fi
            else
                warn "Health check timed out. Check logs with: ./deploy.sh logs"
            fi
            ;;
        down|stop)
            info "Stopping production containers..."
            docker compose down
            success "Containers stopped"
            ;;
        restart)
            info "Restarting production containers..."
            docker compose restart
            if wait_for_health 60; then
                success "Containers restarted"
            else
                warn "Health check timed out after restart"
            fi
            ;;
        *)
            die "Unknown prod action: $action. Use 'up', 'down', or 'restart'."
            ;;
    esac
}

cmd_stop() {
    local compose_file
    compose_file=$(get_running_compose_file)

    if [[ -n "$compose_file" ]]; then
        info "Stopping containers..."
        docker compose -f "$compose_file" down
        success "Containers stopped"
    else
        info "No running containers found"
    fi
}

cmd_rebuild() {
    check_dependencies docker

    local compose_file
    compose_file=$(get_running_compose_file)
    compose_file="${compose_file:-docker-compose.yaml}"

    info "Rebuilding containers..."
    if [[ "$compose_file" == "docker-compose.yaml" ]]; then
        ensure_env_file
    fi
    load_env

    docker compose -f "$compose_file" down
    docker compose -f "$compose_file" build --no-cache
    docker compose -f "$compose_file" up -d

    if [[ "$compose_file" == "docker-compose.yaml" ]]; then
        if wait_for_health 60; then
            success "Rebuild complete!"
            cmd_status
        else
            warn "Health check timed out. Check logs with: ./deploy.sh logs"
        fi
    else
        sleep 2
        docker compose -f "$compose_file" exec web flask db upgrade
        success "Rebuild complete!"
    fi
}

cmd_status() {
    local compose_file
    compose_file=$(get_running_compose_file)

    if [[ -z "$compose_file" ]]; then
        info "No running containers"
        return
    fi

    echo ""
    echo "=== Container Status ==="
    docker compose -f "$compose_file" ps
    echo ""

    local container="${PROJECT_NAME}-web-1"
    if docker inspect "$container" &>/dev/null; then
        echo "=== Health Check ==="
        local health
        health=$(docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null || echo "N/A")
        echo "Status: $health"
        echo ""

        echo "=== Access ==="
        local port
        port=$(docker compose -f "$compose_file" port web 5000 2>/dev/null | cut -d: -f2 || echo "$DEFAULT_PORT")
        echo "URL: http://localhost:${port}"
        echo ""

        if [[ "$compose_file" == "docker-compose.dev.yaml" ]]; then
            echo "Mode: Development (hot-reload enabled)"
        else
            echo "Mode: Production"
        fi
        echo ""
    fi
}

# -----------------------------------------------------------------------------
# Database Commands
# -----------------------------------------------------------------------------

cmd_migrate() {
    local action="${1:-upgrade}"
    local message="${2:-}"

    local compose_file
    compose_file=$(get_running_compose_file)

    if [[ -z "$compose_file" ]]; then
        die "No running containers. Start with: ./deploy.sh dev or ./deploy.sh prod"
    fi

    info "Running migration..."
    case "$action" in
        upgrade)
            docker compose -f "$compose_file" exec web flask db upgrade
            ;;
        create|new)
            [[ -z "$message" ]] && die "Migration message required: ./deploy.sh migrate create 'message'"
            docker compose -f "$compose_file" exec web flask db migrate -m "$message"
            ;;
        downgrade)
            docker compose -f "$compose_file" exec web flask db downgrade
            ;;
        history)
            docker compose -f "$compose_file" exec web flask db history
            ;;
        *)
            die "Unknown migrate action: $action. Use: upgrade, create, downgrade, history"
            ;;
    esac
    success "Migration complete"
}

# -----------------------------------------------------------------------------
# Utility Commands
# -----------------------------------------------------------------------------

cmd_logs() {
    local arg="${1:--f}"

    check_dependencies docker

    local compose_file
    compose_file=$(get_running_compose_file)
    compose_file="${compose_file:-docker-compose.yaml}"

    if [[ "$arg" == "-f" ]] || [[ "$arg" == "--follow" ]]; then
        docker compose -f "$compose_file" logs -f web
    elif [[ "$arg" =~ ^[0-9]+$ ]]; then
        docker compose -f "$compose_file" logs --tail="$arg" web
    else
        docker compose -f "$compose_file" logs web
    fi
}

cmd_shell() {
    check_dependencies docker

    local compose_file
    compose_file=$(get_running_compose_file)

    if [[ -n "$compose_file" ]]; then
        docker compose -f "$compose_file" exec web /bin/bash
    else
        die "No running containers. Start with: ./deploy.sh dev or ./deploy.sh prod"
    fi
}

cmd_users() {
    local action="${1:-list}"
    shift || true

    local compose_file
    compose_file=$(get_running_compose_file)

    if [[ -z "$compose_file" ]]; then
        die "No running containers. Start with: ./deploy.sh dev or ./deploy.sh prod"
    fi

    case "$action" in
        list)
            docker compose -f "$compose_file" exec web flask list-users
            ;;
        create)
            local username="${1:-}"
            local password="${2:-}"
            if [[ -z "$username" ]]; then
                die "Username required: ./deploy.sh users create <username> [password]"
            fi
            if [[ -n "$password" ]]; then
                docker compose -f "$compose_file" exec web flask create-admin --username "$username" --password "$password"
            else
                docker compose -f "$compose_file" exec web flask create-admin --username "$username"
            fi
            ;;
        delete)
            local username="${1:-}"
            if [[ -z "$username" ]]; then
                die "Username required: ./deploy.sh users delete <username>"
            fi
            docker compose -f "$compose_file" exec web flask delete-user "$username"
            ;;
        reset)
            local username="${1:-admin}"
            info "Resetting user '$username'..."
            docker compose -f "$compose_file" exec web flask create-admin --username "$username" --force
            ;;
        *)
            die "Unknown users action: $action. Use: list, create, delete, reset"
            ;;
    esac
}

cmd_cleanup_deleted() {
    local args=("$@")

    local compose_file
    compose_file=$(get_running_compose_file)

    if [[ -z "$compose_file" ]]; then
        die "No running containers. Start with: ./deploy.sh dev or ./deploy.sh prod"
    fi

    info "Running soft-delete cleanup..."
    docker compose -f "$compose_file" exec web flask cleanup-deleted "${args[@]}"
}

cmd_cleanup() {
    local target="${1:-all}"

    check_dependencies docker

    case "$target" in
        containers)
            info "Removing containers..."
            docker compose -f docker-compose.yaml down --remove-orphans 2>/dev/null || true
            docker compose -f docker-compose.dev.yaml down --remove-orphans 2>/dev/null || true
            success "Containers removed"
            ;;
        volumes)
            warn "This will delete all data volumes!"
            read -p "Are you sure? [y/N]: " -r confirm
            if [[ "$confirm" =~ ^[Yy]$ ]]; then
                docker compose -f docker-compose.yaml down -v 2>/dev/null || true
                docker compose -f docker-compose.dev.yaml down -v 2>/dev/null || true
                success "Volumes removed"
            else
                info "Cancelled"
            fi
            ;;
        images)
            info "Removing project images..."
            docker compose -f docker-compose.yaml down --rmi local 2>/dev/null || true
            docker compose -f docker-compose.dev.yaml down --rmi local 2>/dev/null || true
            success "Images removed"
            ;;
        all)
            warn "This will remove containers, volumes, and images!"
            read -p "Are you sure? [y/N]: " -r confirm
            if [[ "$confirm" =~ ^[Yy]$ ]]; then
                docker compose -f docker-compose.yaml down -v --rmi local --remove-orphans 2>/dev/null || true
                docker compose -f docker-compose.dev.yaml down -v --rmi local --remove-orphans 2>/dev/null || true
                success "Cleanup complete"
            else
                info "Cancelled"
            fi
            ;;
        *)
            die "Unknown cleanup target: $target. Use: containers, volumes, images, all"
            ;;
    esac
}

cmd_help() {
    cat << 'EOF'
PDF Sharer Deployment Script

Usage: ./deploy.sh <command> [options]

Development:
  dev [action]        Manage development containers (hot-reload enabled)
                      Actions: up (default), down, restart

Production:
  prod [action]       Manage production containers
                      Actions: up (default), down, restart
  rebuild             Rebuild containers from scratch (no cache)
  stop                Stop all containers (dev or prod)
  status              Show container status and health

Database:
  migrate [action]    Run database migrations
                      Actions: upgrade (default), create "msg", downgrade, history

Logs & Debugging:
  logs [option]       View container logs
                      Options: -f/--follow (default), or number of lines
  shell               Open bash shell in running container

Users:
  users [action]      Manage application users
                      Actions: list (default), create <user> [pass], delete <user>, reset [user]

Cleanup:
  cleanup [target]    Remove Docker resources
                      Targets: containers, volumes, images, all (default)

Maintenance:
  cleanup-deleted [options]  Permanently delete soft-deleted PDFs
                             Options: --days=N (default: 7), --dry-run

Examples:
  ./deploy.sh dev                    # Start development (hot-reload)
  ./deploy.sh dev down               # Stop development containers
  ./deploy.sh prod                   # Start production containers
  ./deploy.sh prod down              # Stop production containers
  ./deploy.sh migrate                # Run pending migrations
  ./deploy.sh migrate create "Add users table"
  ./deploy.sh logs 100               # View last 100 log lines
  ./deploy.sh users list             # List all users
  ./deploy.sh users create myuser    # Create user with auto password
  ./deploy.sh users reset admin      # Reset admin password
  ./deploy.sh cleanup volumes        # Remove data volumes

Notes:
  - Port 5001 is used by default to avoid macOS AirPlay conflict on 5000
  - SECRET_KEY is auto-generated for production if not set in .env
  - Development mode mounts local code for hot-reloading
  - Migrations run automatically on container startup (production)
EOF
}

# -----------------------------------------------------------------------------
# Main Entry Point
# -----------------------------------------------------------------------------

main() {
    cd "$(dirname "$0")"

    case "${1:-help}" in
        dev)        shift; cmd_dev "$@" ;;
        prod)       shift; cmd_prod "$@" ;;
        stop)       cmd_stop ;;
        logs)       shift; cmd_logs "$@" ;;
        migrate)    shift; cmd_migrate "$@" ;;
        users)      shift; cmd_users "$@" ;;
        shell)      cmd_shell ;;
        rebuild)    cmd_rebuild ;;
        cleanup)    shift; cmd_cleanup "$@" ;;
        cleanup-deleted) shift; cmd_cleanup_deleted "$@" ;;
        status)     cmd_status ;;
        help|--help|-h) cmd_help ;;
        *)          die "Unknown command: $1. Run './deploy.sh help' for usage." ;;
    esac
}

main "$@"
