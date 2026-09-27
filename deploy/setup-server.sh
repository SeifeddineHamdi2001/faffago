#!/usr/bin/env bash
# One-time setup of a fresh Ubuntu 24.04 VPS for Faffa Go (phase 11).
#
#   sudo bash setup-server.sh
#
# Safe to run again: every step checks what is already there. It stops once,
# after printing the server's deploy key, if GitHub does not know it yet: add
# the key to the repository, then run it again.
#
# What it does: system packages, swap, firewall, Node 22 + pnpm, PostgreSQL 17
# with the two roles, Caddy, the faffago user and its directories, the
# production env file with fresh secrets, the code, the systemd services and
# the daily backup timer. See docs/deployment.md.
set -euo pipefail

REPO_SSH="git@github.com:SeifeddineHamdi2001/faffago.git"
APP_USER="faffago"
APP_DIR="/opt/faffago"
ENV_FILE="/etc/faffago/faffago.env"
DOCS_DIR="/var/lib/faffago/documents"
BACKUP_DIR="/var/backups/faffago"
APK_DIR="/var/www/faffago-apk"
PNPM_VERSION="9.15.4"
PG_VERSION="17"

step() { printf '\n\033[1;33m== %s\033[0m\n' "$*"; }

if [[ $EUID -ne 0 ]]; then
  echo "Run as root: sudo bash $0" >&2
  exit 1
fi
. /etc/os-release
if [[ "${ID}" != "ubuntu" ]]; then
  echo "Written for Ubuntu 24.04; this is ${PRETTY_NAME}." >&2
  exit 1
fi

step "System packages, time zone, French locale"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -y -q ca-certificates curl gnupg git ufw fail2ban unattended-upgrades \
  locales rclone debian-keyring debian-archive-keyring apt-transport-https
timedatectl set-timezone Africa/Tunis
# The database sorts French names with the French collation, as in development.
if ! locale -a | grep -qi '^fr_FR\.utf8$'; then
  locale-gen fr_FR.UTF-8
fi
dpkg-reconfigure -f noninteractive unattended-upgrades

step "Swap (next build needs it on a small VPS)"
if ! swapon --show | grep -q .; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

step "Firewall: SSH, HTTP, HTTPS only"
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

step "Node 22 and pnpm ${PNPM_VERSION}"
if ! command -v node >/dev/null || [[ "$(node -v)" != v22.* ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -q nodejs
fi
corepack enable
corepack prepare "pnpm@${PNPM_VERSION}" --activate

step "PostgreSQL ${PG_VERSION}"
if ! command -v "/usr/lib/postgresql/${PG_VERSION}/bin/postgres" >/dev/null; then
  install -d /usr/share/postgresql-common/pgdg
  curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
    https://www.postgresql.org/media/keys/ACCC4CF8.asc
  echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt ${VERSION_CODENAME}-pgdg main" \
    > /etc/apt/sources.list.d/pgdg.list
  apt-get update -q
  apt-get install -y -q "postgresql-${PG_VERSION}"
fi
systemctl enable --now postgresql

step "Caddy"
if ! command -v caddy >/dev/null; then
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt \
    > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -q
  apt-get install -y -q caddy
fi

step "User ${APP_USER} and its directories"
if ! id "${APP_USER}" >/dev/null 2>&1; then
  useradd --create-home --shell /bin/bash "${APP_USER}"
fi
install -d -o "${APP_USER}" -g "${APP_USER}" -m 750 "${APP_DIR}"
# Documents: outside the repository and anything Caddy serves, API user only (D-32).
install -d -o "${APP_USER}" -g "${APP_USER}" -m 700 /var/lib/faffago "${DOCS_DIR}"
install -d -o "${APP_USER}" -g "${APP_USER}" -m 700 "${BACKUP_DIR}"
install -d -o "${APP_USER}" -g caddy -m 750 "${APK_DIR}"
install -d -o root -g "${APP_USER}" -m 750 /etc/faffago

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
sudo -u postgres psql -v ON_ERROR_STOP=1 -q <<SQL
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
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname = 'faffago'" | grep -q 1; then
  sudo -u postgres createdb --owner faffago_owner --template template0 \
    --locale fr_FR.UTF-8 --encoding UTF8 faffago
fi
sudo -u postgres psql -v ON_ERROR_STOP=1 -q -d faffago \
  -c "GRANT CONNECT ON DATABASE faffago TO faffago_app"

if [[ ! -f "${ENV_FILE}" ]]; then
  step "Production env file with fresh secrets: ${ENV_FILE}"
  DOC_KEY="$(openssl rand -base64 32)"
  ADMIN_PW="$(rand | cut -c1-16)"
  umask 027
  cat > "${ENV_FILE}" <<ENV
# Faffa Go — production. Generated by deploy/setup-server.sh on $(date -I).
# Never commit, never send by chat or email. Keep a copy offline (docs/deployment.md).
NODE_ENV="production"

DATABASE_URL="postgresql://faffago_app:${APP_PW}@127.0.0.1:5432/faffago?schema=public"
DATABASE_MIGRATION_URL="postgresql://faffago_owner:${OWNER_PW}@127.0.0.1:5432/faffago?schema=public"
FAFFAGO_APP_DB_PASSWORD="${APP_PW}"

API_PORT=3001
API_BASE_URL="http://127.0.0.1:3001"

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
  chown root:"${APP_USER}" "${ENV_FILE}"
  chmod 640 "${ENV_FILE}"
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

step "Services, reverse proxy, backups"
install -m 644 "${APP_DIR}/deploy/systemd/faffago-api.service" /etc/systemd/system/
install -m 644 "${APP_DIR}/deploy/systemd/faffago-web.service" /etc/systemd/system/
install -m 644 "${APP_DIR}/deploy/systemd/faffago-backup.service" /etc/systemd/system/
install -m 644 "${APP_DIR}/deploy/systemd/faffago-backup.timer" /etc/systemd/system/
install -m 644 "${APP_DIR}/deploy/Caddyfile" /etc/caddy/Caddyfile
# deploy.sh restarts the two services as the faffago user, nothing more.
cat > /etc/sudoers.d/faffago <<SUDO
${APP_USER} ALL=(root) NOPASSWD: /usr/bin/systemctl restart faffago-api, /usr/bin/systemctl restart faffago-web
SUDO
chmod 440 /etc/sudoers.d/faffago
visudo -cf /etc/sudoers.d/faffago >/dev/null
systemctl daemon-reload
systemctl enable faffago-api faffago-web faffago-backup.timer
systemctl start faffago-backup.timer
systemctl reload caddy || systemctl restart caddy

step "Done"
cat <<NEXT
Next:
  1. DNS: A records for mirely.store, www.mirely.store and api.mirely.store -> this server.
  2. First release:  sudo -u ${APP_USER} bash ${APP_DIR}/deploy/deploy.sh
  3. Check the roles: sudo -u ${APP_USER} bash ${APP_DIR}/deploy/check-db-roles.sh
  4. Off-server backups: docs/deployment.md, "Backups".
NEXT
