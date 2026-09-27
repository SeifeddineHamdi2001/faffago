#!/usr/bin/env bash
# Phase 11 check: on the real server, the API connects as faffago_app with its
# password, and that role cannot change parcel_events or audit_log (proved on
# PostgreSQL 17 in the tests with SET ROLE, D-78; this proves the login path).
#
#   sudo -u faffago bash /opt/faffago/deploy/check-db-roles.sh
set -euo pipefail

set -a
# shellcheck source=/dev/null
. /etc/faffago/faffago.env
set +a
url="${DATABASE_URL%%\?*}"

who="$(psql -tA "${url}" -c 'SELECT current_user')"
if [[ "${who}" != "faffago_app" ]]; then
  echo "FAIL: DATABASE_URL connects as ${who}, not faffago_app." >&2
  exit 1
fi
echo "ok: the API connects as faffago_app, with its password"

for table in parcel_events audit_log; do
  # WHERE false: the privilege check still runs, no row can change.
  if psql -tA "${url}" -c "UPDATE ${table} SET id = id WHERE false" >/dev/null 2>&1; then
    echo "FAIL: faffago_app may UPDATE ${table}." >&2
    exit 1
  fi
  if psql -tA "${url}" -c "DELETE FROM ${table} WHERE false" >/dev/null 2>&1; then
    echo "FAIL: faffago_app may DELETE from ${table}." >&2
    exit 1
  fi
  echo "ok: UPDATE and DELETE on ${table} are refused"
done
echo "Roles checked. Tick the item in docs/PROGRESS.md (phase 11)."
