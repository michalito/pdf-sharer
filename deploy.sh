#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# saíta Deployment Script
# =============================================================================

# Configuration
PROJECT_BASENAME="saita"
DEFAULT_HOST_PORT=5001  # Avoid macOS AirPlay conflict on port 5000
DEFAULT_FRONTEND_PORT=5173
DEFAULT_NAMED_HOST_PORT=5003
DEFAULT_NAMED_FRONTEND_PORT=5175

PROJECT_NAME="$PROJECT_BASENAME"
INSTANCE_NAME=""
CLI_HOST_PORT=""
CLI_FRONTEND_PORT=""
POSITIONAL_ARGS=()
ENV_HAS_HOST_PORT=0
ENV_HAS_FRONTEND_PORT=0
AUTO_ASSIGNED_HOST_PORT=0
AUTO_ASSIGNED_FRONTEND_PORT=0
AUTO_DERIVED_INSTANCE_NAME=0

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

validate_port() {
    local port="$1"
    local label="$2"

    [[ "$port" =~ ^[0-9]+$ ]] || die "${label} must be a number between 1 and 65535"
    (( port >= 1 && port <= 65535 )) || die "${label} must be between 1 and 65535"
}

validate_instance_name() {
    local name="$1"

    [[ "$name" =~ ^[a-z0-9][a-z0-9_-]*$ ]] || die "Instance name must match [a-z0-9][a-z0-9_-]*"
}

sanitize_instance_name() {
    local raw_name="$1"
    local sanitized

    sanitized=$(printf '%s' "$raw_name" \
        | tr '[:upper:]' '[:lower:]' \
        | sed -E 's/[^a-z0-9_-]+/-/g; s/^-+//; s/-+$//; s/-{2,}/-/g')

    [[ -n "$sanitized" ]] || die "Could not derive a valid instance name from '$raw_name'"
    validate_instance_name "$sanitized"
    echo "$sanitized"
}

parse_global_options() {
    POSITIONAL_ARGS=()

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --name)
                [[ $# -ge 2 ]] || die "Missing value for --name"
                INSTANCE_NAME="$2"
                shift 2
                ;;
            --host-port)
                [[ $# -ge 2 ]] || die "Missing value for --host-port"
                CLI_HOST_PORT="$2"
                shift 2
                ;;
            --frontend-port)
                [[ $# -ge 2 ]] || die "Missing value for --frontend-port"
                CLI_FRONTEND_PORT="$2"
                shift 2
                ;;
            *)
                POSITIONAL_ARGS+=("$1")
                shift
                ;;
        esac
    done
}

configure_project_name() {
    AUTO_DERIVED_INSTANCE_NAME=0

    if [[ -z "$INSTANCE_NAME" ]]; then
        local current_root
        local primary_worktree

        current_root=$(pwd)
        primary_worktree=$(git worktree list --porcelain 2>/dev/null | awk '/^worktree / {print substr($0,10); exit}')

        if [[ -n "$primary_worktree" && "$current_root" != "$primary_worktree" ]]; then
            INSTANCE_NAME=$(sanitize_instance_name "$(basename "$current_root")")
            AUTO_DERIVED_INSTANCE_NAME=1
        fi
    fi

    if [[ -n "$INSTANCE_NAME" ]]; then
        validate_instance_name "$INSTANCE_NAME"
        PROJECT_NAME="${PROJECT_BASENAME}-${INSTANCE_NAME}"
    else
        PROJECT_NAME="$PROJECT_BASENAME"
    fi
}

detect_app_version() {
    # Use APP_VERSION from env/.env if already set, otherwise derive from git.
    if [[ -n "${APP_VERSION:-}" ]]; then
        return
    fi

    local ver
    ver=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
    ver="${ver#v}"  # Strip leading "v".
    export APP_VERSION="${ver:-dev}"
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
}

ensure_secret_key() {
    if [[ -z "${SECRET_KEY:-}" ]]; then
        local key
        key=$(openssl rand -hex 32 2>/dev/null || python3 -c "import secrets; print(secrets.token_hex(32))")
        echo "SECRET_KEY=$key" >> .env
        export SECRET_KEY="$key"
        info "Generated SECRET_KEY and saved to .env (keep .env stable across deploys)"
    fi
}

load_env() {
    ENV_HAS_HOST_PORT=0
    ENV_HAS_FRONTEND_PORT=0

    if [[ -f .env ]]; then
        if grep -Eq '^[[:space:]]*HOST_PORT=' .env; then
            ENV_HAS_HOST_PORT=1
        fi
        if grep -Eq '^[[:space:]]*FRONTEND_PORT=' .env; then
            ENV_HAS_FRONTEND_PORT=1
        fi
        set -a
        source .env
        set +a
    fi
}

prepare_compose_env() {
    load_env
    apply_cli_overrides
}

apply_cli_overrides() {
    if [[ -n "$CLI_HOST_PORT" ]]; then
        validate_port "$CLI_HOST_PORT" "--host-port"
        export HOST_PORT="$CLI_HOST_PORT"
    fi

    if [[ -n "$CLI_FRONTEND_PORT" ]]; then
        validate_port "$CLI_FRONTEND_PORT" "--frontend-port"
        export FRONTEND_PORT="$CLI_FRONTEND_PORT"
    fi
}

effective_host_port() {
    echo "${HOST_PORT:-$DEFAULT_HOST_PORT}"
}

effective_frontend_port() {
    echo "${FRONTEND_PORT:-$DEFAULT_FRONTEND_PORT}"
}

is_port_available() {
    local port="$1"

    if command -v lsof &> /dev/null; then
        ! lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
        return
    fi

    if command -v nc &> /dev/null; then
        ! nc -z localhost "$port" >/dev/null 2>&1
        return
    fi

    die "Unable to auto-detect free ports because neither 'lsof' nor 'nc' is available"
}

find_available_port() {
    local start_port="$1"
    local label="$2"
    local port="$start_port"

    while (( port <= 65535 )); do
        if is_port_available "$port"; then
            echo "$port"
            return 0
        fi
        port=$((port + 1))
    done

    die "No available ${label} port found starting at ${start_port}"
}

set_env_value() {
    local key="$1"
    local value="$2"
    local tmp_file

    ensure_env_file
    tmp_file=$(mktemp)

    awk -v key="$key" -v value="$value" '
        BEGIN { updated = 0 }
        $0 ~ "^[[:space:]]*" key "=" {
            print key "=" value
            updated = 1
            next
        }
        { print }
        END {
            if (!updated) {
                print key "=" value
            }
        }
    ' .env > "$tmp_file"

    mv "$tmp_file" .env
}

assign_named_dev_ports() {
    if [[ -z "$INSTANCE_NAME" ]]; then
        return
    fi

    AUTO_ASSIGNED_HOST_PORT=0
    AUTO_ASSIGNED_FRONTEND_PORT=0

    if [[ -z "${HOST_PORT:-}" ]]; then
        export HOST_PORT
        HOST_PORT=$(find_available_port "$DEFAULT_NAMED_HOST_PORT" "backend")
        AUTO_ASSIGNED_HOST_PORT=1
    fi

    if [[ -z "${FRONTEND_PORT:-}" ]]; then
        export FRONTEND_PORT
        FRONTEND_PORT=$(find_available_port "$DEFAULT_NAMED_FRONTEND_PORT" "frontend")
        AUTO_ASSIGNED_FRONTEND_PORT=1
    fi
}

persist_named_dev_ports() {
    local wrote=0

    if [[ -z "$INSTANCE_NAME" ]]; then
        return
    fi

    if (( AUTO_ASSIGNED_HOST_PORT )) || { [[ -n "$CLI_HOST_PORT" ]] && (( ! ENV_HAS_HOST_PORT )); }; then
        set_env_value HOST_PORT "${HOST_PORT}"
        ENV_HAS_HOST_PORT=1
        wrote=1
    fi

    if (( AUTO_ASSIGNED_FRONTEND_PORT )) || { [[ -n "$CLI_FRONTEND_PORT" ]] && (( ! ENV_HAS_FRONTEND_PORT )); }; then
        set_env_value FRONTEND_PORT "${FRONTEND_PORT}"
        ENV_HAS_FRONTEND_PORT=1
        wrote=1
    fi

    if (( wrote )); then
        info "Saved dev ports to .env for project '$PROJECT_NAME' (backend ${HOST_PORT}, frontend ${FRONTEND_PORT})"
    fi
}

selected_instance_flag() {
    if [[ -n "$INSTANCE_NAME" && $AUTO_DERIVED_INSTANCE_NAME -eq 0 ]]; then
        echo " --name $INSTANCE_NAME"
    fi
}

compose() {
    local compose_file="$1"
    shift

    docker compose -p "$PROJECT_NAME" -f "$compose_file" "$@"
}

get_service_container_id() {
    local compose_file="$1"
    local service="${2:-web}"

    compose "$compose_file" ps -q "$service" 2>/dev/null | head -n 1
}

wait_for_health() {
    local timeout="${1:-60}"
    local compose_file="${2:-docker-compose.yaml}"
    local interval=2
    local elapsed=0

    while [[ $elapsed -lt $timeout ]]; do
        local container_id
        container_id=$(get_service_container_id "$compose_file" web)

        if [[ -z "$container_id" ]]; then
            sleep "$interval"
            elapsed=$((elapsed + interval))
            continue
        fi

        local state
        state=$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id" 2>/dev/null || echo "starting")

        case "$state" in
            healthy|running)
                return 0
                ;;
            unhealthy|exited|dead)
                warn "Container state is $state"
                return 1
                ;;
            *)
                sleep "$interval"
                elapsed=$((elapsed + interval))
                ;;
        esac
    done

    return 1
}

is_container_running() {
    local compose_file="${1:-docker-compose.yaml}"

    compose "$compose_file" ps --quiet web 2>/dev/null | grep -q .
}

get_running_compose_file() {
    if is_container_running docker-compose.dev.yaml; then
        echo "docker-compose.dev.yaml"
    elif is_container_running docker-compose.yaml; then
        echo "docker-compose.yaml"
    else
        echo ""
    fi
}

require_running_compose_file() {
    local compose_file
    compose_file=$(get_running_compose_file)

    if [[ -z "$compose_file" ]]; then
        die "No running containers for project '$PROJECT_NAME'. Start with: ./deploy.sh dev$(selected_instance_flag) or ./deploy.sh prod$(selected_instance_flag)"
    fi

    echo "$compose_file"
}

get_host_port() {
    local compose_file="$1"
    local service="$2"
    local container_port="$3"
    local fallback="$4"
    local mapped_port

    mapped_port=$(compose "$compose_file" port "$service" "$container_port" 2>/dev/null | awk -F: 'END { print $NF }')

    if [[ -n "$mapped_port" ]]; then
        echo "$mapped_port"
    else
        echo "$fallback"
    fi
}

run_cleanup() {
    local -a down_args=("$@")

    compose docker-compose.yaml down "${down_args[@]}" 2>/dev/null || true
    compose docker-compose.dev.yaml down "${down_args[@]}" 2>/dev/null || true
}

# -----------------------------------------------------------------------------
# Development Commands
# -----------------------------------------------------------------------------

cmd_dev() {
    local action="${1:-up}"

    check_dependencies docker

    case "$action" in
        up|start)
            info "Starting development containers for project '$PROJECT_NAME'..."
            prepare_compose_env
            assign_named_dev_ports
            persist_named_dev_ports
            detect_app_version

            # Build and start with dev config (detached).
            compose docker-compose.dev.yaml build
            compose docker-compose.dev.yaml up -d

            # Run migrations.
            info "Running database migrations..."
            sleep 2
            compose docker-compose.dev.yaml exec web flask db upgrade

            # Seed sample data (idempotent — skips if data already exists).
            compose docker-compose.dev.yaml exec web flask seed

            echo ""
            success "Frontend: http://localhost:$(effective_frontend_port)"
            success "API:      http://localhost:$(effective_host_port)/api/health"
            echo ""
            info "Code changes will auto-reload. View logs with: ./deploy.sh logs$(selected_instance_flag)"
            ;;
        down|stop)
            info "Stopping development containers for project '$PROJECT_NAME'..."
            prepare_compose_env
            compose docker-compose.dev.yaml down
            success "Containers stopped"
            ;;
        restart)
            info "Restarting development containers for project '$PROJECT_NAME'..."
            prepare_compose_env
            compose docker-compose.dev.yaml restart
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
            info "Starting production containers for project '$PROJECT_NAME'..."
            ensure_env_file
            prepare_compose_env
            ensure_secret_key
            detect_app_version

            # Build and start (detached).
            compose docker-compose.yaml build
            compose docker-compose.yaml up -d

            # Wait for health.
            info "Waiting for application to be healthy..."
            if wait_for_health 60 docker-compose.yaml; then
                success "Application is running and healthy!"
                echo ""
                cmd_status
            else
                warn "Health check timed out. Check logs with: ./deploy.sh logs$(selected_instance_flag)"
            fi
            ;;
        down|stop)
            info "Stopping production containers for project '$PROJECT_NAME'..."
            prepare_compose_env
            compose docker-compose.yaml down
            success "Containers stopped"
            ;;
        restart)
            info "Restarting production containers for project '$PROJECT_NAME'..."
            prepare_compose_env
            compose docker-compose.yaml restart
            if wait_for_health 60 docker-compose.yaml; then
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
    prepare_compose_env
    compose_file=$(get_running_compose_file)

    if [[ -n "$compose_file" ]]; then
        info "Stopping containers for project '$PROJECT_NAME'..."
        compose "$compose_file" down
        success "Containers stopped"
    else
        info "No running containers found for project '$PROJECT_NAME'"
    fi
}

cmd_rebuild() {
    check_dependencies docker

    local compose_file
    compose_file=$(get_running_compose_file)
    compose_file="${compose_file:-docker-compose.yaml}"

    info "Rebuilding containers for project '$PROJECT_NAME'..."
    if [[ "$compose_file" == "docker-compose.yaml" ]]; then
        ensure_env_file
        prepare_compose_env
        ensure_secret_key
    else
        prepare_compose_env
    fi
    detect_app_version

    compose "$compose_file" down
    compose "$compose_file" build --no-cache
    compose "$compose_file" up -d

    if [[ "$compose_file" == "docker-compose.yaml" ]]; then
        if wait_for_health 60 "$compose_file"; then
            success "Rebuild complete!"
            cmd_status
        else
            warn "Health check timed out. Check logs with: ./deploy.sh logs$(selected_instance_flag)"
        fi
    else
        sleep 2
        compose "$compose_file" exec web flask db upgrade
        success "Rebuild complete!"
    fi
}

cmd_status() {
    local compose_file
    prepare_compose_env
    compose_file=$(get_running_compose_file)

    if [[ -z "$compose_file" ]]; then
        info "No running containers for project '$PROJECT_NAME'"
        return
    fi

    echo ""
    echo "Project: $PROJECT_NAME"
    echo "Compose file: $compose_file"
    echo ""
    echo "=== Container Status ==="
    compose "$compose_file" ps
    echo ""

    local container_id
    container_id=$(get_service_container_id "$compose_file" web)
    if [[ -n "$container_id" ]]; then
        echo "=== Health / State ==="
        local health
        health=$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id" 2>/dev/null || echo "N/A")
        echo "Status: $health"
        echo ""

        echo "=== Access ==="
        local backend_port
        backend_port=$(get_host_port "$compose_file" web 5000 "$(effective_host_port)")

        if [[ "$compose_file" == "docker-compose.dev.yaml" ]]; then
            local frontend_port
            frontend_port=$(get_host_port "$compose_file" frontend 5173 "$(effective_frontend_port)")
            echo "Frontend: http://localhost:${frontend_port}"
            echo "API:      http://localhost:${backend_port}/api/health"
            echo ""
            echo "Mode: Development (hot-reload enabled)"
        else
            echo "URL: http://localhost:${backend_port}"
            echo "API: http://localhost:${backend_port}/api/health"
            echo ""
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

    prepare_compose_env
    compose_file=$(require_running_compose_file)

    info "Running migration for project '$PROJECT_NAME'..."
    case "$action" in
        upgrade)
            compose "$compose_file" exec web flask db upgrade
            ;;
        create|new)
            [[ -z "$message" ]] && die "Migration message required: ./deploy.sh migrate create 'message'"
            compose "$compose_file" exec web flask db migrate -m "$message"
            ;;
        downgrade)
            compose "$compose_file" exec web flask db downgrade
            ;;
        history)
            compose "$compose_file" exec web flask db history
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
    local compose_file

    check_dependencies docker
    prepare_compose_env
    compose_file=$(require_running_compose_file)

    if [[ "$arg" == "-f" ]] || [[ "$arg" == "--follow" ]]; then
        compose "$compose_file" logs -f web
    elif [[ "$arg" =~ ^[0-9]+$ ]]; then
        compose "$compose_file" logs --tail="$arg" web
    else
        compose "$compose_file" logs web
    fi
}

cmd_shell() {
    local compose_file

    check_dependencies docker
    prepare_compose_env
    compose_file=$(require_running_compose_file)
    compose "$compose_file" exec web /bin/bash
}

cmd_prune_orphans() {
    local args=("$@")
    local compose_file

    prepare_compose_env
    compose_file=$(require_running_compose_file)

    info "Pruning orphaned upload files for project '$PROJECT_NAME'..."
    compose "$compose_file" exec web flask prune-orphans "${args[@]}"
}

cmd_expire_items() {
    local args=("$@")
    local compose_file

    prepare_compose_env
    compose_file=$(require_running_compose_file)

    info "Deleting expired items for project '$PROJECT_NAME'..."
    compose "$compose_file" exec web flask expire-items "${args[@]}"
}

cmd_seed() {
    local args=("$@")
    local compose_file

    prepare_compose_env
    compose_file=$(require_running_compose_file)

    info "Seeding sample data for project '$PROJECT_NAME'..."
    compose "$compose_file" exec web flask seed "${args[@]}"
}

cmd_cleanup() {
    local target="${1:-all}"

    check_dependencies docker
    prepare_compose_env

    case "$target" in
        containers)
            info "Removing containers for project '$PROJECT_NAME'..."
            run_cleanup --remove-orphans
            success "Containers removed"
            ;;
        volumes)
            warn "This will delete all data volumes for project '$PROJECT_NAME'!"
            read -p "Are you sure? [y/N]: " -r confirm
            if [[ "$confirm" =~ ^[Yy]$ ]]; then
                run_cleanup -v
                success "Volumes removed"
            else
                info "Cancelled"
            fi
            ;;
        images)
            info "Removing project images for project '$PROJECT_NAME'..."
            run_cleanup --rmi local
            success "Images removed"
            ;;
        all)
            warn "This will remove containers, volumes, and images for project '$PROJECT_NAME'!"
            read -p "Are you sure? [y/N]: " -r confirm
            if [[ "$confirm" =~ ^[Yy]$ ]]; then
                run_cleanup -v --rmi local --remove-orphans
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
saíta Deployment Script

Usage: ./deploy.sh <command> [options]

Global Options:
  --name <instance>          Override the instance name (project becomes "saita-<instance>")
  --host-port <port>         Override backend host port (default: 5001)
  --frontend-port <port>     Override dev frontend host port (default: 5173)

Development:
  dev [action]               Manage development containers (hot-reload enabled)
                             Actions: up (default), down, restart

Production:
  prod [action]              Manage production containers
                             Actions: up (default), down, restart
  rebuild                    Rebuild containers from scratch (no cache)
  stop                       Stop containers for the selected project
  status                     Show container status and health

Database:
  migrate [action]           Run database migrations
                             Actions: upgrade (default), create "msg", downgrade, history

Logs & Debugging:
  logs [option]              View container logs
                             Options: -f/--follow (default), or number of lines
  shell                      Open bash shell in running container

Cleanup:
  cleanup [target]           Remove Docker resources for the selected project
                             Targets: containers, volumes, images, all (default)

Maintenance:
  seed [--force]             Seed database with sample data (dev only, idempotent)
  prune-orphans [--dry-run]  Delete upload files not referenced in the DB
  expire-items [--dry-run]   Delete expired TTL items from the DB and upload folder

Examples:
  ./deploy.sh dev
  ./deploy.sh dev down
  ./deploy.sh dev            # auto-derives "kyoto" when run inside worktree ./kyoto
  ./deploy.sh dev --name kyoto --host-port 5003 --frontend-port 5175
  ./deploy.sh status
  ./deploy.sh logs 100
  ./deploy.sh cleanup volumes

Notes:
  - Port 5001 is used by default to avoid macOS AirPlay conflict on 5000
  - In non-primary git worktrees, the instance name defaults to the worktree directory name
  - Derived/named dev instances auto-select free backend/frontend ports when .env and flags do not provide them
  - Development mode mounts local code for hot-reloading
  - Migrations run automatically on container startup (production)
EOF
}

# -----------------------------------------------------------------------------
# Main Entry Point
# -----------------------------------------------------------------------------

run_with_positional_args() {
    local fn="$1"

    if [[ ${#POSITIONAL_ARGS[@]} -gt 1 ]]; then
        "$fn" "${POSITIONAL_ARGS[@]:1}"
    else
        "$fn"
    fi
}

main() {
    cd "$(dirname "$0")"
    parse_global_options "$@"
    configure_project_name

    local command="${POSITIONAL_ARGS[0]:-help}"

    case "$command" in
        dev)           run_with_positional_args cmd_dev ;;
        prod)          run_with_positional_args cmd_prod ;;
        stop)          cmd_stop ;;
        logs)          run_with_positional_args cmd_logs ;;
        migrate)       run_with_positional_args cmd_migrate ;;
        shell)         cmd_shell ;;
        rebuild)       cmd_rebuild ;;
        cleanup)       run_with_positional_args cmd_cleanup ;;
        seed)          run_with_positional_args cmd_seed ;;
        prune-orphans) run_with_positional_args cmd_prune_orphans ;;
        expire-items)  run_with_positional_args cmd_expire_items ;;
        status)        cmd_status ;;
        help|--help|-h) cmd_help ;;
        *)             die "Unknown command: $command. Run './deploy.sh help' for usage." ;;
    esac
}

main "$@"
