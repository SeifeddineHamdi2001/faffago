#!/usr/bin/env bash
# Put the latest main into production (phase 11, D-100).
#
#   sudo bash /opt/faffago/deploy/deploy.sh
#
# Pull main, build the images while the old containers keep serving, migrate
# as faffago_owner, seed (idempotent: it never overwrites a setting or an
# account), swap the containers, then check both apps answer. Downtime: the
# few seconds the new containers take to start.
set -euo pipefail
. "$(dirname "$0")/lib.sh"
cd "${APP_DIR}"

step "Code: main"
git fetch -q origin main
git checkout -q main
git merge --ff-only -q origin/main
git log -1 --format='%h %s'

step "Build the images (the running site is not touched)"
dc build

step "Database"
dc up -d --wait db

step "Migrations, as faffago_owner"
dc run --rm --no-deps -e DATABASE_URL="${DATABASE_MIGRATION_URL}" api \
  node /app/node_modules/prisma/build/index.js migrate deploy

step "Seed (géographie, Paramètres, first admin if none)"
dc run --rm --no-deps api /app/node_modules/.bin/tsx prisma/seed.ts

step "Start the new containers"
dc up -d --remove-orphans api web

step "Check"
wait_for() {
  local name="$1" url="$2" service="$3"
  for _ in $(seq 1 45); do
    if curl -fsS -o /dev/null "${url}"; then
      echo "${name}: ok"
      return 0
    fi
    sleep 2
  done
  echo "${name}: no answer from ${url}. Logs:" >&2
  dc logs --tail 50 "${service}" >&2
  return 1
}
wait_for API "http://127.0.0.1:${API_PORT}/api/health" api
wait_for Web "http://127.0.0.1:${WEB_PORT}/fr" web

# Old image layers from earlier releases.
docker image prune -f >/dev/null
echo
echo "Deployed $(git log -1 --format='%h')."
