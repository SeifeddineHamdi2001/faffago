# syntax=docker/dockerfile:1
#
# Faffa Go API and web app: one image, two containers (deploy/docker-compose.yml,
# D-100). Built on the VPS by deploy/deploy.sh. The courier app is not in it.
#
#   docker build --build-arg NEXT_PUBLIC_SITE_URL=https://www.mirely.store -t faffago-app .

FROM node:22-bookworm-slim AS base
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app

FROM base AS build
# For native modules (argon2, sharp) if no prebuilt binary fits.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY . .
# The root, the API and the web app with their dependencies; not the courier
# app. prisma generate runs here (the API's postinstall), for this platform.
RUN pnpm install --frozen-lockfile \
  --filter faffago --filter "@faffago/api..." --filter "@faffago/web..."
# Printed in every label's QR code and compiled into the pages (D-43).
ARG NEXT_PUBLIC_SITE_URL
RUN test -n "${NEXT_PUBLIC_SITE_URL}" || (echo "NEXT_PUBLIC_SITE_URL build arg missing" >&2 && exit 1)
RUN pnpm --filter @faffago/shared build \
  && pnpm --filter @faffago/api build \
  && pnpm --filter @faffago/web build \
  && rm -rf apps/web/.next/cache

FROM base AS runtime
ENV NODE_ENV=production
# Dev dependencies stay: the Prisma CLI runs the migrations, tsx the seed.
COPY --from=build --chown=node:node /app /app
USER node
