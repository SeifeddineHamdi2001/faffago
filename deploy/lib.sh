# Shared by the deploy/*.sh scripts: sourced, not run.
APP_DIR="/opt/faffago"
ENV_FILE="/etc/faffago/faffago.env"
DOCS_HOST_DIR="/var/lib/faffago/documents"
BACKUP_DIR="/var/backups/faffago"

step() { printf '\n\033[1;33m== %s\033[0m\n' "$*"; }
die() {
  echo "$*" >&2
  exit 1
}

[[ $EUID -eq 0 ]] || die "Run as root: sudo bash $0"
[[ -f "${ENV_FILE}" ]] || die "${ENV_FILE} is missing: run deploy/setup-server.sh first."
set -a
# shellcheck source=/dev/null
. "${ENV_FILE}"
set +a

# docker compose for Faffa Go's project, with its env file.
dc() {
  docker compose -f "${APP_DIR}/deploy/docker-compose.yml" --env-file "${ENV_FILE}" "$@"
}
