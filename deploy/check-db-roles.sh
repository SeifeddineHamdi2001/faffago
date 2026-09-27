#!/usr/bin/env bash
# Phase 11 check: on the real server, the API connects as faffago_app with its
# password, and that role cannot change parcel_events or audit_log (proved on
# PostgreSQL 17 in the tests with SET ROLE, D-78; this proves the login path).
#
#   sudo bash /opt/faffago/deploy/check-db-roles.sh
set -euo pipefail
. "$(dirname "$0")/lib.sh"

[[ "${DATABASE_URL}" == postgresql://faffago_app:* ]] ||
  die "FAIL: the API's DATABASE_URL does not use faffago_app."

# Over TCP with the password, as the API does (not the container's local trust).
app_url="postgresql://faffago_app:${FAFFAGO_APP_DB_PASSWORD}@127.0.0.1:5432/faffago"
as_app() { dc exec -T db psql "${app_url}" -tA -c "$1"; }

who="$(as_app 'SELECT current_user')"
[[ "${who}" == "faffago_app" ]] || die "FAIL: connected as ${who}, not faffago_app."
echo "ok: faffago_app logs in with its password"

for table in parcel_events audit_log; do
  # WHERE false: the privilege check still runs, no row can change.
  if as_app "UPDATE ${table} SET id = id WHERE false" >/dev/null 2>&1; then
    die "FAIL: faffago_app may UPDATE ${table}."
  fi
  if as_app "DELETE FROM ${table} WHERE false" >/dev/null 2>&1; then
    die "FAIL: faffago_app may DELETE from ${table}."
  fi
  echo "ok: UPDATE and DELETE on ${table} are refused"
done
echo "Roles checked. Tick the item in docs/PROGRESS.md (phase 11)."
