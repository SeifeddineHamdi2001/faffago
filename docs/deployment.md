# Faffa Go — deployment runbook

How to put Faffa Go on the VPS with Docker and keep it running. The files are
in `deploy/` and the `Dockerfile` at the root; the choices behind them are
D-100 in `decisions.md`.

## What runs where

One Ubuntu 24.04 VPS, shared with other projects. Faffa Go runs in its own
Docker Compose project (`faffago`), listens on 127.0.0.1:4002 and 4001 (the
3000s are taken), and adds its own site to the server's Nginx. Nothing else on
the server is changed.

| Piece                | How                                                           | Reached at                             |
| -------------------- | ------------------------------------------------------------- | -------------------------------------- |
| Web app (Next.js)    | container `web`, 127.0.0.1:4002                               | https://www.mirely.store               |
| API (NestJS)         | container `api`, 127.0.0.1:4001                               | https://api.mirely.store (courier app) |
| PostgreSQL 17        | container `db`, volume `faffago_faffago-pgdata`, no host port | inside Docker only                     |
| Nginx + certbot      | the server's Nginx, site `/etc/nginx/sites-available/faffago` | ports 80 and 443                       |
| Seller documents     | `/var/lib/faffago/documents`, encrypted                       | never served (D-32)                    |
| Courier APK          | `/var/www/faffago-apk`                                        | https://www.mirely.store/apk/…         |
| Backups              | `faffago-backup.timer`, 02:30 Tunis                           | `/var/backups/faffago` + off-server    |
| Settings and secrets | `/etc/faffago/faffago.env` (root only)                        | —                                      |

The web app talks to the API inside Docker (`http://api:4001`); only the
courier app uses `api.mirely.store`.

**Shortcut** used below:

```bash
alias fg='sudo docker compose -f /opt/faffago/deploy/docker-compose.yml --env-file /etc/faffago/faffago.env'
```

## 1. Before you start

- **The VPS**: Ubuntu 24.04, at least **2 vCPU, 4 GB RAM**, 20 GB free disk.
  Building the image needs the memory; the setup adds swap if there is none.
- **Where the data may live**: CIN numbers, customers' names, phones and
  addresses will sit on this server and in its backups. Hosting them outside
  Tunisia is still open (D-32, loi organique 2004-63): get the answer before
  real sellers' data goes in.
- **DNS** for `mirely.store`: three **A** records to the VPS's IP address:
  `mirely.store`, `www.mirely.store`, `api.mirely.store`.
- SSH access as a user with `sudo`.

## 2. First install

The repository is private, so copy the setup script over first. From your PC,
in the repository:

```bash
scp deploy/setup-server.sh user@SERVER_IP:/tmp/
```

Then on the VPS:

```bash
sudo bash /tmp/setup-server.sh
```

It installs Docker (if missing), Nginx and certbot (if missing), and writes
`/etc/faffago/faffago.env` with fresh secrets.

The first run stops after printing a **deploy key**. In GitHub: the repository
→ Settings → Deploy keys → Add deploy key, paste it, leave "write access"
unticked. Then run the script again.

It prints **the first admin's password once**: note it. **Copy
`/etc/faffago/faffago.env` to two offline places now** (a USB key, a password
manager): it holds the documents' encryption key and the database passwords.
Losing it loses every CIN and patente.

Once the DNS names point at the server, get the HTTPS certificates (certbot
asks for an email address for expiry notices, once):

```bash
sudo certbot --nginx --redirect -d mirely.store -d www.mirely.store -d api.mirely.store
```

certbot adds the HTTPS part to Faffa Go's Nginx site and renews it by itself.
Then the first release:

```bash
sudo bash /opt/faffago/deploy/deploy.sh
sudo bash /opt/faffago/deploy/check-db-roles.sh
```

The first build takes several minutes. Open https://www.mirely.store/admin,
log in as `admin` with the printed password, and fill in Paramètres.

## 3. Releasing an update

When `main` has new work:

```bash
sudo bash /opt/faffago/deploy/deploy.sh
```

It pulls `main`, builds the new image **while the site keeps running**,
migrates, seeds (never overwrites a setting or an account), swaps the
containers and checks both apps answer. The site is down only the few seconds
the new containers take to start.

If it stops with an error before "Start the new containers", the old version is
still running untouched: read the error, fix on `main`, run it again.

## 4. Backups

Every night at 02:30 (Tunis time) the database and the documents are dumped to
`/var/backups/faffago` (14 days kept) and copied off the server with rclone.

**To set up the off-server copy** (once the legal question is answered):

```bash
sudo rclone config
```

1. Add a remote for the storage (for example Backblaze B2, or SFTP to another
   server), e.g. named `faffago-store`.
2. Add a **crypt** remote on top of it, e.g. `faffago-crypt` pointing to
   `faffago-store:faffago-backups`. Keep its two passwords with the env file,
   offline.
3. In `/etc/faffago/faffago.env`: `BACKUP_RCLONE_REMOTE="faffago-crypt:"`.
4. Test it: `sudo systemctl start faffago-backup && journalctl -u faffago-backup -n 20`.

Until this is done the backup job reports a failure every night, on purpose.

**Restore test, before launch and then every few months:**

```bash
ls /var/backups/faffago
sudo bash /opt/faffago/deploy/restore-test.sh \
  /var/backups/faffago/db-XXXXXXXX-0230.dump /var/backups/faffago/documents-XXXXXXXX-0230.tar
```

It restores into a scratch database, compares counts with the live one, and
opens every document with the key. The live database is not touched.

## 5. Watching it

- State: `fg ps`. Logs: `fg logs -f api`, `fg logs -f web`, `fg logs db`,
  and Nginx's `/var/log/nginx/faffago*.log`.
- Backups: `systemctl list-timers faffago-backup.timer`,
  `journalctl -u faffago-backup`.
- Uptime: add https://api.mirely.store/api/health to a free uptime monitor
  (for example UptimeRobot). It answers `{"status":"ok"}` when the API reaches
  its database.
- Errors: create a free Sentry account and a **Node.js / NestJS** project, put
  its DSN in `/etc/faffago/faffago.env` as `SENTRY_DSN="…"`, then
  `fg up -d api`. Only unexpected API errors are sent, without any customer
  data.

## 6. Courier app (APK)

Built with EAS from `apps/courier` on your PC (profile `production`: an APK
talking to `https://api.mirely.store/api`):

```bash
cd apps/courier
pnpm exec eas build --platform android --profile production
```

- **Signing key**: on the first build EAS creates it and keeps it. Download a
  copy (`eas credentials` → Android → Download keystore) and keep it in two
  offline places with the env file: without it, no update can replace the
  installed app.
- **Publishing**: put the APK on the server with its checksum:

  ```bash
  scp faffago-coursier.apk user@SERVER_IP:/tmp/
  sudo install -o root -g www-data -m 640 /tmp/faffago-coursier.apk /var/www/faffago-apk/
  cd /var/www/faffago-apk && sha256sum faffago-coursier.apk | sudo tee faffago-coursier.apk.sha256
  ```

  Couriers download https://www.mirely.store/apk/faffago-coursier.apk.

- After a new APK, raise the minimum app version in Paramètres so older apps
  are asked to update (D-14).

## 7. If something goes wrong

- **The site is down**: `fg ps`, then the logs above. `fg up -d` starts
  whatever stopped; `fg restart api web` restarts the apps.
- **Lost admin password**: `fg exec api /app/node_modules/.bin/tsx scripts/admin-reset.ts admin`.
- **A newer `deploy/nginx/faffago.conf`**: the setup installs it only once,
  because certbot has since added the HTTPS lines to the installed copy. Copy
  the change by hand into `/etc/nginx/sites-available/faffago`, then
  `sudo nginx -t && sudo systemctl reload nginx`.
- **Server lost**: on the new VPS, put the saved env file at
  `/etc/faffago/faffago.env` **before** running `setup-server.sh` (it keeps it).
  Run `deploy.sh` once (it creates an empty database with the same passwords),
  then restore the latest backup into it:

  ```bash
  fg stop api web
  fg exec -T db dropdb --username faffago_owner faffago
  fg exec -T db createdb --username faffago_owner --template template0 --locale fr_FR.UTF-8 faffago
  fg exec -T db psql --username faffago_owner -d faffago -c "GRANT CONNECT ON DATABASE faffago TO faffago_app"
  fg exec -T db pg_restore --username faffago_owner --dbname faffago < db-….dump
  sudo tar -xf documents-….tar -C /var/lib/faffago/
  fg up -d api web
  ```
