#!/usr/bin/env bash
# Daily backup (tech-stack 6), run as root by faffago-backup.timer at 02:30 Tunis.
#
#   The database: pg_dump custom format, from the db container.
#   The documents: a tar of /var/lib/faffago/documents. The files are already
#   encrypted (AES-256-GCM, D-32); the key is NOT in the backup, it lives in
#   the env file the owner keeps offline.
#
# Kept 14 days on the server, and copied to BACKUP_RCLONE_REMOTE. Use an rclone
# "crypt" remote: the database dump holds names, phones and addresses in clear.
# With no remote set, the job fails on purpose so the missing copy is seen.
set -euo pipefail
. "$(dirname "$0")/lib.sh"
KEEP_DAYS=14

stamp="$(date +%Y%m%d-%H%M)"
db_file="${BACKUP_DIR}/db-${stamp}.dump"
docs_file="${BACKUP_DIR}/documents-${stamp}.tar"
umask 077

dc exec -T db pg_dump --username faffago_owner --format=custom faffago > "${db_file}.part"
mv "${db_file}.part" "${db_file}"
tar -cf "${docs_file}.part" -C "$(dirname "${DOCS_HOST_DIR}")" "$(basename "${DOCS_HOST_DIR}")"
mv "${docs_file}.part" "${docs_file}"
(cd "${BACKUP_DIR}" && sha256sum "$(basename "${db_file}")" "$(basename "${docs_file}")" > "SHA256SUMS-${stamp}")
echo "Local: ${db_file} ($(du -h "${db_file}" | cut -f1)), ${docs_file} ($(du -h "${docs_file}" | cut -f1))"

find "${BACKUP_DIR}" -maxdepth 1 -type f -mtime +"${KEEP_DAYS}" -delete

if [[ -z "${BACKUP_RCLONE_REMOTE:-}" ]]; then
  echo "BACKUP_RCLONE_REMOTE is empty: no off-server copy (docs/deployment.md, Backups)." >&2
  exit 1
fi
rclone copy --immutable "${BACKUP_DIR}" "${BACKUP_RCLONE_REMOTE}" \
  --include "*-${stamp}*" --include "SHA256SUMS-${stamp}"
echo "Copied to ${BACKUP_RCLONE_REMOTE}."
