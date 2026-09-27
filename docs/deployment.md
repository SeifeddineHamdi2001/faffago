# Faffa Go — deployment runbook

How to put Faffa Go on a VPS and keep it running. The scripts are in
`deploy/`; the choices behind them are D-100 in `decisions.md`.

## What runs where

One Ubuntu 24.04 VPS, shared with other projects: Faffa Go adds its own Nginx
sites, its own ports (4000 and 4001, the 3000s are taken) and its own Node 22,
and leaves the rest of the server as it is.

| Piece                | How                                                                                             | Reached at                             |
| -------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------- |
| Web app (Next.js)    | systemd `faffago-web`, 127.0.0.1:4000, Node in `/opt/faffago-node`                              | https://www.mirely.store               |
| API (NestJS)         | systemd `faffago-api`, port 4001                                                                | https://api.mirely.store (courier app) |
| PostgreSQL           | the one already running (16+), or 17 installed; roles `faffago_owner` and `faffago_app`         | local only                             |
| Nginx + certbot      | the server's Nginx, site `/etc/nginx/sites-available/faffago`; Let's Encrypt renewed by certbot | ports 80 and 443                       |
| Seller documents     | `/var/lib/faffago/documents`, encrypted                                                         | never served (D-32)                    |
| Courier APK          | `/var/www/faffago-apk`                                                                          | https://www.mirely.store/apk/…         |
| Backups              | `faffago-backup.timer`, 02:30 Tunis                                                             | `/var/backups/faffago` + off-server    |
| Settings and secrets | `/etc/faffago/faffago.env`                                                                      | —                                      |

`mirely.store` redirects to `www`. The web app talks to the API on 127.0.0.1;
only the courier app uses `api.mirely.store`.

## 1. Before you start

- **A VPS**: Ubuntu 24.04, at least **2 vCPU, 4 GB RAM, 40 GB disk**. 2 GB RAM
  works with the swap the setup adds, but building the web app is then slow.
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

The first run stops after printing a **deploy key**. In GitHub: the repository
→ Settings → Deploy keys → Add deploy key, paste it, leave "write access"
unticked. Then run the script again.

It prints **the first admin's password once**: note it. It also writes
`/etc/faffago/faffago.env` with fresh secrets. **Copy that file to two offline
places now** (a USB key, a password manager): it holds the documents'
encryption key, and losing it loses every CIN and patente.

Then, once the DNS names point at the server, get the HTTPS certificates
(certbot asks for an email address for expiry notices, once):

```bash
sudo certbot --nginx --redirect -d mirely.store -d www.mirely.store -d api.mirely.store
```

certbot adds the HTTPS part to Faffa Go's Nginx site and renews it by itself.
Then:

```bash
sudo -u faffago bash /opt/faffago/deploy/deploy.sh        # first release
sudo -u faffago bash /opt/faffago/deploy/check-db-roles.sh
```

Open https://www.mirely.store/admin, log in as `admin` with the printed
password, and fill in Paramètres.

## 3. Releasing an update

When `main` has new work:

```bash
sudo -u faffago bash /opt/faffago/deploy/deploy.sh
```

It pulls `main`, installs, builds, migrates, seeds (never overwrites a setting
or an account), restarts, and checks both apps answer. The web app is rebuilt
in place: run it **outside working hours**, not while the depot is scanning.

If it stops with an error, the old version keeps running until the restart
step; read the error, fix on `main`, run it again.

## 4. Backups

Every night at 02:30 the database and the documents are dumped to
`/var/backups/faffago` (14 days kept) and copied off the server with rclone.

**To set up the off-server copy** (once the legal question is answered),
as the faffago user:

```bash
sudo -u faffago rclone config
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

- Logs: `journalctl -u faffago-api -f`, `journalctl -u faffago-web -f`,
  `/var/log/nginx/faffago*.log`.
- State: `systemctl status faffago-api faffago-web faffago-backup.timer`.
- Uptime: add https://api.mirely.store/api/health to a free uptime monitor
  (for example UptimeRobot). It answers `{"status":"ok"}` when the API reaches
  its database.
- Errors: create a free Sentry account and a **Node.js / NestJS** project, put
  its DSN in `/etc/faffago/faffago.env` as `SENTRY_DSN="…"`, then
  `sudo systemctl restart faffago-api`. Only unexpected API errors are sent,
  without any customer data.

## 6. Courier app (APK)

Built with EAS from `apps/courier` (profile `production`: an APK talking to
`https://api.mirely.store/api`):

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
  scp faffago-coursier.apk user@server:/tmp/
  sudo install -o faffago -g www-data -m 640 /tmp/faffago-coursier.apk /var/www/faffago-apk/
  cd /var/www/faffago-apk && sha256sum faffago-coursier.apk | sudo tee faffago-coursier.apk.sha256
  ```

  Couriers download https://www.mirely.store/apk/faffago-coursier.apk.

- After a new APK, raise the minimum app version in Paramètres so older apps
  are asked to update (D-14).

## 7. If something goes wrong

- **The site is down**: `systemctl status faffago-web faffago-api nginx`, then
  the logs above. `sudo systemctl restart faffago-api faffago-web`.
- **Lost admin password**: `cd /opt/faffago && sudo -u faffago bash -c 'set -a; . /etc/faffago/faffago.env; pnpm --filter @faffago/api admin:reset admin'`.
- **Server lost**: on the new VPS, put the saved env file at
  `/etc/faffago/faffago.env` **before** running `setup-server.sh`: the script
  keeps its passwords and keys. Then restore the latest dump
  (`pg_restore --dbname="<DATABASE_MIGRATION_URL without ?schema=public>" db-….dump`),
  untar the documents into `/var/lib/faffago/`, and run `deploy.sh`.
- **A newer `deploy/nginx/faffago.conf`**: the setup installs it only once,
  because certbot has since added the HTTPS lines to the installed copy. Copy
  the change by hand into `/etc/nginx/sites-available/faffago`, then
  `sudo nginx -t && sudo systemctl reload nginx`.
