#!/usr/bin/env bash
# Put the latest main into production (phase 11).
#
#   sudo -u faffago bash /opt/faffago/deploy/deploy.sh
#
# Pull main, install, build, migrate as faffago_owner, seed (idempotent: it
# never overwrites a setting or an account), restart, then check both apps
# answer. The web app is rebuilt in place, so run it outside working hours.
set -euo pipefail

APP_DIR="/opt/faffago"
ENV_FILE="/etc/faffago/faffago.env"
# Faffa Go's own Node 22 and pnpm (setup-server.sh), not the system's.
export PATH="/opt/faffago-node/bin:${PATH}"

step() { printf '\n\033[1;33m== %s\033[0m\n' "$*"; }

if [[ "$(id -un)" != "faffago" ]]; then
  echo "Run as the faffago user: sudo -u faffago bash $0" >&2
  exit 1
fi
cd "${APP_DIR}"
set -a
# shellcheck source=/dev/null
. "${ENV_FILE}"
set +a

step "Code: main"
git fetch -q origin main
git checkout -q main
git merge --ff-only -q origin/main
git log -1 --format='%h %s'

step "Install"
pnpm install --frozen-lockfile

step "Build: shared, API, web"
pnpm --filter @faffago/shared build
pnpm --filter @faffago/api build
# NEXT_PUBLIC_SITE_URL is compiled into the pages here, from the env file.
pnpm --filter @faffago/web build

step "Migrations, as faffago_owner"
DATABASE_URL="${DATABASE_MIGRATION_URL}" pnpm --filter @faffago/api prisma:deploy

step "Seed (géographie, Paramètres, first admin if none)"
pnpm --filter @faffago/api db:seed

step "Restart"
sudo /usr/bin/systemctl restart faffago-api
sudo /usr/bin/systemctl restart faffago-web

step "Check"
wait_for() {
  local name="$1" url="$2"
  for _ in $(seq 1 30); do
    if curl -fsS -o /dev/null "${url}"; then
      echo "${name}: ok"
      return 0
    fi
    sleep 2
  done
  echo "${name}: no answer from ${url}. Logs: journalctl -u faffago-${name,,} -n 100" >&2
  return 1
}
wait_for API "http://127.0.0.1:${API_PORT}/api/health"
wait_for Web "http://127.0.0.1:${WEB_PORT}/fr"
echo
echo "Deployed $(git log -1 --format='%h')."
