-- Runs once, the first time the container creates its data directory.
--
-- faffago_owner already exists (POSTGRES_USER). This adds the restricted role
-- the API uses, so that the grants in the first migration have something to
-- apply to and the append-only rule is exercised in development exactly as in
-- production.

CREATE ROLE faffago_app LOGIN PASSWORD 'faffago_dev';
GRANT CONNECT ON DATABASE faffago TO faffago_app;
