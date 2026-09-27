#!/usr/bin/env bash
# Prove a backup can be restored (tech-stack 6: "test a full restore before
# launch"), without touching the live database.
#
#   sudo bash /opt/faffago/deploy/restore-test.sh /var/backups/faffago/db-XXXX.dump \
#                                                  /var/backups/faffago/documents-XXXX.tar
#
# For a backup fetched from the remote, `rclone copy` it into a directory first.
# Restores into a scratch database faffago_restore_test, compares row counts
# with the live one, opens every document with the key (documents:verify
# --decrypt), then drops the scratch copies.
set -euo pipefail

DB_DUMP="${1:?the db-*.dump file}"
DOCS_TAR="${2:?the documents-*.tar file}"
ENV_FILE="/etc/faffago/faffago.env"
APP_DIR="/opt/faffago"
SCRATCH_DB="faffago_restore_test"

if [[ $EUID -ne 0 ]]; then
  echo "Run as root: sudo bash $0 ..." >&2
  exit 1
fi
set -a
# shellcheck source=/dev/null
. "${ENV_FILE}"
set +a

work="$(mktemp -d /var/lib/faffago/restore-XXXX)"
chown faffago:faffago "${work}"
cleanup() {
  sudo -u postgres dropdb --if-exists "${SCRATCH_DB}"
  rm -rf "${work}"
}
trap cleanup EXIT

echo "== Database into ${SCRATCH_DB}"
sudo -u postgres dropdb --if-exists "${SCRATCH_DB}"
sudo -u postgres createdb --owner faffago_owner --template template0 \
  --locale fr_FR.UTF-8 --encoding UTF8 "${SCRATCH_DB}"
base="${DATABASE_MIGRATION_URL%%\?*}"
scratch_url="${base%/*}/${SCRATCH_DB}"
pg_restore --no-password --exit-on-error --dbname="${scratch_url}" "${DB_DUMP}"

echo "== Row counts, live vs restored (live may be ahead since the backup)"
live="${base}"
for table in parcels parcel_events audit_log users sellers bons_versement seller_documents; do
  a="$(psql -tA "${live}" -c "SELECT count(*) FROM ${table}" 2>/dev/null || echo '?')"
  b="$(psql -tA "${scratch_url}" -c "SELECT count(*) FROM ${table}" 2>/dev/null || echo '?')"
  printf '  %-18s live %8s   restored %8s\n' "${table}" "${a}" "${b}"
done

echo "== Documents, opened with the key"
tar -xf "${DOCS_TAR}" -C "${work}"
chown -R faffago:faffago "${work}"
docs="${work}/$(basename "${STORAGE_LOCAL_PATH}")"
# The env file first (for the key), then the scratch database and directory.
sudo -u faffago bash -c "cd ${APP_DIR} && set -a && . ${ENV_FILE} && set +a && \
  DATABASE_URL='${scratch_url}' STORAGE_LOCAL_PATH='${docs}' \
  pnpm --filter @faffago/api documents:verify --decrypt"

echo
echo "Restore test passed. Write the date in docs/PROGRESS.md (phase 11)."
