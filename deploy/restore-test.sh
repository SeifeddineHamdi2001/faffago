#!/usr/bin/env bash
# Prove a backup can be restored (tech-stack 6: "test a full restore before
# launch"), without touching the live database.
#
#   sudo bash /opt/faffago/deploy/restore-test.sh /var/backups/faffago/db-XXXX.dump \
#                                                  /var/backups/faffago/documents-XXXX.tar
#
# For a backup fetched from the remote, `rclone copy` it into a directory first.
# Restores into a scratch database faffago_restore_test (same container),
# compares row counts with the live one, opens every document with the key
# (documents:verify --decrypt), then drops the scratch copies.
set -euo pipefail
. "$(dirname "$0")/lib.sh"

DB_DUMP="${1:?the db-*.dump file}"
DOCS_TAR="${2:?the documents-*.tar file}"
SCRATCH_DB="faffago_restore_test"
CONTAINER_UID=1000

psql_in() { dc exec -T db psql --username faffago_owner -v ON_ERROR_STOP=1 "$@"; }

work="$(mktemp -d /var/lib/faffago/restore-XXXX)"
cleanup() {
  dc exec -T db dropdb --username faffago_owner --if-exists "${SCRATCH_DB}" || true
  rm -rf "${work}"
}
trap cleanup EXIT

step "Database into ${SCRATCH_DB}"
dc exec -T db dropdb --username faffago_owner --if-exists "${SCRATCH_DB}"
dc exec -T db createdb --username faffago_owner --template template0 \
  --locale fr_FR.UTF-8 --encoding UTF8 "${SCRATCH_DB}"
dc exec -T db pg_restore --username faffago_owner --exit-on-error --dbname "${SCRATCH_DB}" < "${DB_DUMP}"

step "Row counts, live vs restored (live may be ahead since the backup)"
for table in parcels parcel_events audit_log users sellers bons_versement seller_documents; do
  a="$(psql_in -d faffago -tAc "SELECT count(*) FROM ${table}" 2>/dev/null || echo '?')"
  b="$(psql_in -d "${SCRATCH_DB}" -tAc "SELECT count(*) FROM ${table}" 2>/dev/null || echo '?')"
  printf '  %-18s live %8s   restored %8s\n' "${table}" "${a}" "${b}"
done

step "Documents, opened with the key"
tar -xf "${DOCS_TAR}" -C "${work}"
chown -R "${CONTAINER_UID}:${CONTAINER_UID}" "${work}"
dc run --rm --no-deps \
  -v "${work}/$(basename "${DOCS_HOST_DIR}"):/restore:ro" \
  -e DATABASE_URL="postgresql://faffago_owner:${FAFFAGO_OWNER_DB_PASSWORD}@db:5432/${SCRATCH_DB}" \
  -e STORAGE_LOCAL_PATH=/restore \
  api /app/node_modules/.bin/tsx scripts/documents-verify.ts --decrypt

echo
echo "Restore test passed. Write the date in docs/PROGRESS.md (phase 11)."
