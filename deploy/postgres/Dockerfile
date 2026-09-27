# PostgreSQL 17 (as in the tests, D-78) with the French locale, so names sort
# the French way, as in development (docker-compose.yml at the root).
FROM postgres:17-bookworm
RUN localedef -i fr_FR -c -f UTF-8 -A /usr/share/locale/locale.alias fr_FR.UTF-8
ENV LANG=fr_FR.utf8
COPY initdb/ /docker-entrypoint-initdb.d/
