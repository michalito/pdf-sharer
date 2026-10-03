import os
import stat
import subprocess
import textwrap
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
DEPLOY_SCRIPT = REPO_ROOT / "deploy.sh"


def _write_fake_docker(path: Path) -> None:
    path.write_text(
        textwrap.dedent(
            """\
            #!/bin/sh
            set -eu

            if [ "${1:-}" = "inspect" ]; then
                case "$*" in
                    *com.docker.compose.project.config_files*)
                        printf '/source/%s\\n' "${FAKE_DOCKER_RUNNING_COMPOSE:-${FAKE_DOCKER_STOPPED_COMPOSE:-}}"
                        ;;
                    *) printf '%s\\n' "${FAKE_DOCKER_HEALTH:-healthy}" ;;
                esac
                exit 0
            fi

            [ "${1:-}" = "compose" ] || exit 1
            shift
            project=""
            compose_file=""

            while [ $# -gt 0 ]; do
                case "$1" in
                    -p) project="$2"; shift 2 ;;
                    -f) compose_file="$2"; shift 2 ;;
                    ps)
                        shift
                        case "$*" in
                            *--quiet*|*-q*)
                                if [ -n "${FAKE_DOCKER_RUNNING_COMPOSE:-}" ]; then
                                    printf 'running-web\\n'
                                elif [ -n "${FAKE_DOCKER_STOPPED_COMPOSE:-}" ]; then
                                    case "$*" in *--all*) printf 'stopped-web\\n' ;; esac
                                fi
                                ;;
                        esac
                        exit 0
                        ;;
                    port) exit 0 ;;
                    *)
                        printf 'project=%s compose=%s args=%s\\n' "$project" "$compose_file" "$*"
                        exit 0
                        ;;
                esac
            done
            """
        )
    )
    path.chmod(path.stat().st_mode | stat.S_IEXEC)


def _run_deploy_command(
    tmp_path: Path,
    *args: str,
    stopped_compose: str | None = None,
    running_compose: str | None = None,
    health: str = "healthy",
    env_content: str = "SECRET_KEY=deploy-test-secret\nAPP_VERSION=test\nHOST_PORT=5001\nFRONTEND_PORT=5173\n",
) -> subprocess.CompletedProcess:
    deploy_script = tmp_path / "deploy.sh"
    deploy_script.write_text(DEPLOY_SCRIPT.read_text())
    deploy_script.chmod(0o755)
    (tmp_path / ".env").write_text(env_content)

    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    _write_fake_docker(bin_dir / "docker")
    fake_lsof = bin_dir / "lsof"
    fake_lsof.write_text("#!/bin/sh\nexit 1\n")
    fake_lsof.chmod(0o755)
    env = os.environ.copy()
    env.pop("HOST_PORT", None)
    env.pop("FRONTEND_PORT", None)
    env["PATH"] = f"{bin_dir}:{env['PATH']}"
    env["FAKE_DOCKER_HEALTH"] = health
    for key, value in (
        ("FAKE_DOCKER_STOPPED_COMPOSE", stopped_compose),
        ("FAKE_DOCKER_RUNNING_COMPOSE", running_compose),
    ):
        if value is None:
            env.pop(key, None)
        else:
            env[key] = value
    return subprocess.run(
        [str(deploy_script), "--name", "logs-test", *args],
        capture_output=True,
        cwd=tmp_path,
        env=env,
        text=True,
    )


def test_logs_uses_exited_dev_container_when_no_service_is_running(tmp_path: Path):
    result = _run_deploy_command(tmp_path, "logs", stopped_compose="docker-compose.dev.yaml")

    assert result.returncode == 0
    assert "project=saita-logs-test" in result.stdout
    assert "compose=docker-compose.dev.yaml" in result.stdout


def test_logs_errors_when_no_project_containers_exist(tmp_path: Path):
    result = _run_deploy_command(tmp_path, "logs")

    assert result.returncode == 1
    assert "No containers found for project 'saita-logs-test'" in result.stderr


def test_logs_uses_exited_prod_container(tmp_path: Path):
    result = _run_deploy_command(tmp_path, "logs", stopped_compose="docker-compose.yaml")
    assert result.returncode == 0
    assert "compose=docker-compose.yaml" in result.stdout
    assert "compose=docker-compose.dev.yaml" not in result.stdout


def test_status_reports_actual_production_mode(tmp_path: Path):
    result = _run_deploy_command(tmp_path, "status", running_compose="docker-compose.yaml")
    assert result.returncode == 0
    assert "Mode: Production" in result.stdout
    assert "Mode: Development" not in result.stdout


def test_status_reports_actual_development_mode(tmp_path: Path):
    result = _run_deploy_command(tmp_path, "status", running_compose="docker-compose.dev.yaml")
    assert result.returncode == 0
    assert "Mode: Development" in result.stdout


def test_rebuild_keeps_production_config(tmp_path: Path):
    result = _run_deploy_command(tmp_path, "rebuild", running_compose="docker-compose.yaml")
    assert result.returncode == 0
    assert "compose=docker-compose.yaml args=build --no-cache" in result.stdout
    assert "compose=docker-compose.dev.yaml args=" not in result.stdout


def test_rebuild_development_does_not_rerun_startup_migrations(tmp_path: Path):
    result = _run_deploy_command(tmp_path, "rebuild", running_compose="docker-compose.dev.yaml")
    assert result.returncode == 0
    assert "compose=docker-compose.dev.yaml args=build --no-cache" in result.stdout
    assert "flask db upgrade" not in result.stdout


def test_development_waits_for_startup_before_seeding(tmp_path: Path):
    result = _run_deploy_command(tmp_path, "dev", running_compose="docker-compose.dev.yaml")
    assert result.returncode == 0
    assert "flask seed" in result.stdout
    assert "flask db upgrade" not in result.stdout


def test_development_does_not_seed_unhealthy_app(tmp_path: Path):
    result = _run_deploy_command(tmp_path, "dev", running_compose="docker-compose.dev.yaml", health="unhealthy")
    assert result.returncode == 1
    assert "flask seed" not in result.stdout


def test_production_start_fails_when_unhealthy(tmp_path: Path):
    result = _run_deploy_command(tmp_path, "prod", running_compose="docker-compose.yaml", health="unhealthy")
    assert result.returncode == 1
    assert "failed to become healthy" in result.stderr


def test_production_restart_fails_when_unhealthy(tmp_path: Path):
    result = _run_deploy_command(tmp_path, "prod", "restart", running_compose="docker-compose.yaml", health="unhealthy")
    assert result.returncode == 1


def test_rebuild_fails_when_unhealthy(tmp_path: Path):
    result = _run_deploy_command(tmp_path, "rebuild", running_compose="docker-compose.yaml", health="unhealthy")
    assert result.returncode == 1
    assert "Rebuild complete" not in result.stdout


def test_named_dev_auto_frontend_port_skips_reserved_backend_port(tmp_path: Path):
    result = _run_deploy_command(
        tmp_path, "dev", "--host-port", "5175",
        running_compose="docker-compose.dev.yaml",
        env_content="SECRET_KEY=deploy-test-secret\nAPP_VERSION=test\n",
    )
    assert result.returncode == 0
    assert "frontend 5176" in result.stdout
    assert "FRONTEND_PORT=5176" in (tmp_path / ".env").read_text()
    assert "HOST_PORT=5175" in (tmp_path / ".env").read_text()
