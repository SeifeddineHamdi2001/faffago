#!/bin/bash
# Runs once, when the database volume is first created.
#
# POSTGRES_USER (faffago_owner) owns the schema and runs the migrations. This
# adds faffago_app, the role the API connects as, with its password from the
# env file, so the first migration's grants have someone to apply to: UPDATE
# and DELETE revoked on parcel_events and audit_log.
psql -v ON_ERROR_STOP=1 --username "${POSTGRES_USER}" --dbname "${POSTGRES_DB}" \
  -v app_password="${FAFFAGO_APP_DB_PASSWORD:?FAFFAGO_APP_DB_PASSWORD missing}" <<'SQL'
CREATE ROLE faffago_app LOGIN PASSWORD :'app_password';
GRANT CONNECT ON DATABASE faffago TO faffago_app;
SQL
