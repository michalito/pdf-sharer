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

            [ "${1:-}" = "compose" ] || exit 1
            shift

            project=""
            compose_file=""

            while [ $# -gt 0 ]; do
                case "$1" in
                    -p)
                        project="$2"
                        shift 2
                        ;;
                    -f)
                        compose_file="$2"
                        shift 2
                        ;;
                    ps)
                        shift
                        show_all=0
                        quiet=0
                        service=""

                        while [ $# -gt 0 ]; do
                            case "$1" in
                                -a|--all)
                                    show_all=1
                                    shift
                                    ;;
                                -q|--quiet)
                                    quiet=1
                                    shift
                                    ;;
                                *)
                                    service="$1"
                                    shift
                                    break
                                    ;;
                            esac
                        done

                        if [ "$show_all" = "1" ] && [ "$quiet" = "1" ] \
                            && [ "${FAKE_DOCKER_STOPPED_COMPOSE:-}" = "$compose_file" ] \
                            && [ "$service" = "web" ]; then
                            printf 'stopped-web\\n'
                        fi
                        exit 0
                        ;;
                    logs)
                        shift
                        printf 'project=%s compose=%s args=%s\\n' "$project" "$compose_file" "$*"
                        exit 0
                        ;;
                    *)
                        shift
                        ;;
                esac
            done
            """
        )
    )
    path.chmod(path.stat().st_mode | stat.S_IEXEC)


def _run_logs_command(tmp_path: Path, *, stopped_compose: str | None = None) -> subprocess.CompletedProcess:
    deploy_script = tmp_path / "deploy.sh"
    deploy_script.write_text(DEPLOY_SCRIPT.read_text())
    deploy_script.chmod(0o755)

    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    _write_fake_docker(bin_dir / "docker")

    env = os.environ.copy()
    env["PATH"] = f"{bin_dir}:{env['PATH']}"

    if stopped_compose is not None:
        env["FAKE_DOCKER_STOPPED_COMPOSE"] = stopped_compose
    else:
        env.pop("FAKE_DOCKER_STOPPED_COMPOSE", None)

    return subprocess.run(
        [str(deploy_script), "--name", "logs-test", "logs"],
        capture_output=True,
        cwd=tmp_path,
        env=env,
        text=True,
    )


def test_logs_uses_exited_dev_container_when_no_service_is_running(tmp_path: Path):
    result = _run_logs_command(tmp_path, stopped_compose="docker-compose.dev.yaml")

    assert result.returncode == 0
    assert "project=saita-logs-test" in result.stdout
    assert "compose=docker-compose.dev.yaml" in result.stdout


def test_logs_errors_when_no_project_containers_exist(tmp_path: Path):
    result = _run_logs_command(tmp_path)

    assert result.returncode == 1
    assert "No containers found for project 'saita-logs-test'" in result.stderr
