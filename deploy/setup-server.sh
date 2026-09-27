#!/usr/bin/env bash
# One-time setup of Faffa Go on an Ubuntu 24.04 VPS (phase 11, D-100).
#
#   sudo bash setup-server.sh
#
# The VPS already hosts other projects behind Nginx, so this script leaves them
# alone: it adds Nginx sites for Faffa Go only, runs the apps on 4000 / 4001,
# keeps its own Node 22 in /opt/faffago-node (the system's Node is untouched),
# reuses the PostgreSQL already running if there is one, and changes neither
# the firewall nor the server's time zone.
#
# Safe to run again: every step checks what is already there. It stops once,
# after printing the server's deploy key, if GitHub does not know it yet: add
# the key to the repository, then run it again. See docs/deployment.md.
set -euo pipefail

REPO_SSH="git@github.com:SeifeddineHamdi2001/faffago.git"
APP_USER="faffago"
APP_DIR="/opt/faffago"
NODE_DIR="/opt/faffago-node"
ENV_FILE="/etc/faffago/faffago.env"
DOCS_DIR="/var/lib/faffago/documents"
BACKUP_DIR="/var/backups/faffago"
APK_DIR="/var/www/faffago-apk"
NGINX_SITE="/etc/nginx/sites-available/faffago"
PNPM_VERSION="9.15.4"
WEB_PORT=4000
API_PORT=4001
PG_NEW_VERSION="17"
PG_MIN_VERSION="16"

step() { printf '\n\033[1;33m== %s\033[0m\n' "$*"; }
die() {
  echo "$*" >&2
  exit 1
}

[[ $EUID -eq 0 ]] || die "Run as root: sudo bash $0"
. /etc/os-release
[[ "${ID}" == "ubuntu" ]] || die "Written for Ubuntu 24.04; this is ${PRETTY_NAME}."

step "Packages (only what is missing), French locale"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -y -q ca-certificates curl gnupg git locales rclone xz-utils
# The database sorts French names with the French collation, as in development.
if ! locale -a | grep -qi '^fr_FR\.utf8$'; then
  locale-gen fr_FR.UTF-8
fi

step "Ports ${WEB_PORT} and ${API_PORT} are free"
if [[ ! -f "${ENV_FILE}" ]]; then
  for port in "${WEB_PORT}" "${API_PORT}"; do
    if ss -ltnH "sport = :${port}" | grep -q .; then
      die "Port ${port} is already used on this server: $(ss -ltnpH "sport = :${port}")"
    fi
  done
fi
echo "ok"

step "Swap (only if the server has none: next build needs it on a small VPS)"
if ! swapon --show | grep -q .; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

step "Node 22 for Faffa Go only, in ${NODE_DIR}"
if [[ ! -x "${NODE_DIR}/bin/node" ]]; then
  case "$(uname -m)" in
    x86_64) arch="x64" ;;
    aarch64) arch="arm64" ;;
    *) die "Unsupported CPU: $(uname -m)" ;;
  esac
  base="https://nodejs.org/dist/latest-v22.x"
  tmp="$(mktemp -d)"
  curl -fsSL "${base}/SHASUMS256.txt" -o "${tmp}/SHASUMS256.txt"
  tarball="$(grep -oE "node-v22\.[0-9]+\.[0-9]+-linux-${arch}\.tar\.xz" "${tmp}/SHASUMS256.txt" | head -1)"
  curl -fsSL "${base}/${tarball}" -o "${tmp}/${tarball}"
  (cd "${tmp}" && grep " ${tarball}\$" SHASUMS256.txt | sha256sum -c -)
  install -d "${NODE_DIR}"
  tar -xJf "${tmp}/${tarball}" -C "${NODE_DIR}" --strip-components=1
  rm -rf "${tmp}"
fi
export PATH="${NODE_DIR}/bin:${PATH}"
corepack enable --install-directory "${NODE_DIR}/bin"
COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack prepare "pnpm@${PNPM_VERSION}" --activate
node -v

step "PostgreSQL"
if command -v pg_lsclusters >/dev/null && pg_lsclusters -h | awk '$4 == "online"' | grep -q .; then
  # Reuse the newest running cluster.
  read -r PG_VERSION PG_PORT < <(pg_lsclusters -h | awk '$4 == "online" {print $1, $3}' | sort -rn | head -1)
  if (( ${PG_VERSION%%.*} < PG_MIN_VERSION )); then
    die "PostgreSQL ${PG_VERSION} runs here; Faffa Go needs ${PG_MIN_VERSION} or newer."
  fi
  echo "Using the PostgreSQL ${PG_VERSION} already running on port ${PG_PORT}."
else
  install -d /usr/share/postgresql-common/pgdg
  curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
    https://www.postgresql.org/media/keys/ACCC4CF8.asc
  echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt ${VERSION_CODENAME}-pgdg main" \
    > /etc/apt/sources.list.d/pgdg.list
  apt-get update -q
  apt-get install -y -q "postgresql-${PG_NEW_VERSION}"
  systemctl enable --now postgresql
  read -r PG_VERSION PG_PORT < <(pg_lsclusters -h | awk '{print $1, $3}' | head -1)
fi
pg() { sudo -u postgres psql -p "${PG_PORT}" -v ON_ERROR_STOP=1 -q "$@"; }

step "Nginx and certbot"
command -v nginx >/dev/null || apt-get install -y -q nginx
command -v certbot >/dev/null || apt-get install -y -q certbot python3-certbot-nginx

step "User ${APP_USER} and its directories"
if ! id "${APP_USER}" >/dev/null 2>&1; then
  useradd --create-home --shell /bin/bash "${APP_USER}"
fi
install -d -o "${APP_USER}" -g "${APP_USER}" -m 750 "${APP_DIR}"
# Documents: outside the repository and anything Nginx serves, API user only (D-32).
install -d -o "${APP_USER}" -g "${APP_USER}" -m 700 /var/lib/faffago "${DOCS_DIR}"
install -d -o "${APP_USER}" -g "${APP_USER}" -m 700 "${BACKUP_DIR}"
install -d -o "${APP_USER}" -g www-data -m 750 "${APK_DIR}"
install -d -o root -g "${APP_USER}" -m 750 /etc/faffago
# pnpm and node for the faffago user's own shell (deploy.sh sets PATH itself).
grep -q "${NODE_DIR}/bin" "/home/${APP_USER}/.profile" 2>/dev/null ||
  echo "export PATH=\"${NODE_DIR}/bin:\$PATH\"" >> "/home/${APP_USER}/.profile"

step "Database roles and database"
rand() { openssl rand -base64 48 | tr -d '/+=\n' | cut -c1-40; }
# An env file already there (a rerun, or the saved copy put back after losing a
# server) keeps its passwords; otherwise they are new.
if [[ -f "${ENV_FILE}" ]]; then
  pw_of() { grep "^$1=" "${ENV_FILE}" | sed -E 's#^[^=]+="?postgresql://[^:]+:([^@]+)@.*#\1#'; }
  OWNER_PW="$(pw_of DATABASE_MIGRATION_URL)"
  APP_PW="$(pw_of DATABASE_URL)"
else
  OWNER_PW="$(rand)"
  APP_PW="$(rand)"
fi
pg <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'faffago_owner') THEN
    CREATE ROLE faffago_owner LOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'faffago_app') THEN
    CREATE ROLE faffago_app LOGIN;
  END IF;
END \$\$;
ALTER ROLE faffago_owner PASSWORD '${OWNER_PW}';
ALTER ROLE faffago_app PASSWORD '${APP_PW}';
SQL
if ! pg -tAc "SELECT 1 FROM pg_database WHERE datname = 'faffago'" | grep -q 1; then
  sudo -u postgres createdb -p "${PG_PORT}" --owner faffago_owner --template template0 \
    --locale fr_FR.UTF-8 --encoding UTF8 faffago
fi
pg -d faffago -c "GRANT CONNECT ON DATABASE faffago TO faffago_app"

if [[ ! -f "${ENV_FILE}" ]]; then
  step "Production env file with fresh secrets: ${ENV_FILE}"
  DOC_KEY="$(openssl rand -base64 32)"
  ADMIN_PW="$(rand | cut -c1-16)"
  umask 027
  cat > "${ENV_FILE}" <<ENV
# Faffa Go — production. Generated by deploy/setup-server.sh on $(date -I).
# Never commit, never send by chat or email. Keep a copy offline (docs/deployment.md).
NODE_ENV="production"

DATABASE_URL="postgresql://faffago_app:${APP_PW}@127.0.0.1:${PG_PORT}/faffago?schema=public"
DATABASE_MIGRATION_URL="postgresql://faffago_owner:${OWNER_PW}@127.0.0.1:${PG_PORT}/faffago?schema=public"
FAFFAGO_APP_DB_PASSWORD="${APP_PW}"

# 4000 and up: the 3000s are taken by other projects on this server (D-100).
WEB_PORT=${WEB_PORT}
API_PORT=${API_PORT}
API_BASE_URL="http://127.0.0.1:${API_PORT}"

JWT_ACCESS_SECRET="$(openssl rand -base64 48 | tr -d '\n')"
JWT_REFRESH_SECRET="$(openssl rand -base64 48 | tr -d '\n')"

# The first admin: created by the seed on the first deploy. Log in, then
# change nothing here: the password lives hashed in the database afterwards.
FAFFAGO_ADMIN_USERNAME="admin"
FAFFAGO_ADMIN_PASSWORD="${ADMIN_PW}"
FAFFAGO_ADMIN_PHONE="20000000"

STORAGE_DRIVER="local"
STORAGE_LOCAL_PATH="${DOCS_DIR}"
# Losing this key loses every CIN / patente document. Copy it to two offline places.
STORAGE_ENCRYPTION_KEY_ID="k1"
STORAGE_ENCRYPTION_KEY="${DOC_KEY}"
STORAGE_ENCRYPTION_PREVIOUS_KEYS=""

# Printed in the QR code of every label: never change it once labels are printed (D-43).
NEXT_PUBLIC_SITE_URL="https://www.mirely.store"

# Off-server backups (deploy/backup.sh): an rclone remote and folder, e.g.
# "faffago-crypt:faffago". Empty = backups stay on this server only, and the
# backup job fails on purpose so it is noticed.
BACKUP_RCLONE_REMOTE=""

SENTRY_DSN=""
ENV
  echo
  echo "Written. The first admin is 'admin' with password: ${ADMIN_PW}"
  echo "Copy ${ENV_FILE} to two offline places now (it holds the document key)."
else
  echo "${ENV_FILE} exists: kept as is, its database passwords applied."
fi
chown root:"${APP_USER}" "${ENV_FILE}"
chmod 640 "${ENV_FILE}"

step "The code"
if [[ ! -f "/home/${APP_USER}/.ssh/id_ed25519" ]]; then
  sudo -u "${APP_USER}" ssh-keygen -q -t ed25519 -N '' -C "faffago-vps" \
    -f "/home/${APP_USER}/.ssh/id_ed25519"
fi
sudo -u "${APP_USER}" bash -c 'ssh-keyscan -t ed25519 github.com >> ~/.ssh/known_hosts 2>/dev/null; sort -u -o ~/.ssh/known_hosts ~/.ssh/known_hosts'
if [[ ! -d "${APP_DIR}/.git" ]]; then
  if ! sudo -u "${APP_USER}" git clone -q "${REPO_SSH}" "${APP_DIR}"; then
    echo
    echo "GitHub refused the clone. Add this key to the repository:"
    echo "  GitHub > faffago > Settings > Deploy keys > Add deploy key (read-only)"
    echo
    cat "/home/${APP_USER}/.ssh/id_ed25519.pub"
    echo
    echo "Then run this script again."
    exit 2
  fi
fi
# The API and the scripts read the root .env (app.module.ts).
ln -sfn "${ENV_FILE}" "${APP_DIR}/.env"

step "Services and backups"
for unit in faffago-api.service faffago-web.service faffago-backup.service faffago-backup.timer; do
  install -m 644 "${APP_DIR}/deploy/systemd/${unit}" /etc/systemd/system/
done
# deploy.sh restarts the two services as the faffago user, nothing more.
cat > /etc/sudoers.d/faffago <<SUDO
${APP_USER} ALL=(root) NOPASSWD: /usr/bin/systemctl restart faffago-api, /usr/bin/systemctl restart faffago-web
SUDO
chmod 440 /etc/sudoers.d/faffago
visudo -cf /etc/sudoers.d/faffago >/dev/null
systemctl daemon-reload
systemctl enable faffago-api faffago-web faffago-backup.timer
systemctl start faffago-backup.timer

step "Nginx sites for Faffa Go"
# Installed once: certbot then adds the HTTPS parts to this file, and a rerun
# must not undo them. To take a newer deploy/nginx/faffago.conf, see the runbook.
if [[ ! -f "${NGINX_SITE}" ]]; then
  install -m 644 "${APP_DIR}/deploy/nginx/faffago.conf" "${NGINX_SITE}"
  ln -sfn "${NGINX_SITE}" /etc/nginx/sites-enabled/faffago
fi
nginx -t
systemctl reload nginx

step "Done"
cat <<NEXT
Next:
  1. DNS: A records for mirely.store, www.mirely.store and api.mirely.store -> this server.
  2. HTTPS: sudo certbot --nginx --redirect -d mirely.store -d www.mirely.store -d api.mirely.store
  3. First release:  sudo -u ${APP_USER} bash ${APP_DIR}/deploy/deploy.sh
  4. Check the roles: sudo -u ${APP_USER} bash ${APP_DIR}/deploy/check-db-roles.sh
  5. Off-server backups: docs/deployment.md, "Backups".
NEXT
