ARG BUN_VERSION=1.4-alpine

# ---------------------------------------------------------------------------
# 1) Build the client (Vite)
# ---------------------------------------------------------------------------
FROM oven/bun:${BUN_VERSION} AS client-build
WORKDIR /app/client
COPY client-react/package.json client-react/bun.lock ./
RUN bun install --frozen-lockfile
COPY client-react/ ./
RUN bun run build

# ---------------------------------------------------------------------------
# 2) Install production-only server dependencies
#
# No C toolchain and no node-gyp: replacing bcrypt with Bun.password removed
# the last native addon, and nothing here compiles TypeScript any more either.
# ---------------------------------------------------------------------------
FROM oven/bun:${BUN_VERSION} AS server-deps
WORKDIR /app/server
COPY server/package.json server/bun.lock ./
RUN bun install --frozen-lockfile --production

# ---------------------------------------------------------------------------
# 3) Runtime image: Bun plus the server's TypeScript sources.
#
# There is no compile step. Bun executes TypeScript directly, so the old
# tsc build stage is gone along with the separate dist/ copy of the assets.
# Running from server/src keeps every __dirname lookup at the same depth the
# compiled server/dist layout had:
#   server/src/routes -> ../../../client   =>  /app/dist/client
#   server/src        -> ./assets          =>  /app/dist/server/src/assets
# ---------------------------------------------------------------------------
FROM oven/bun:${BUN_VERSION} AS runtime
ARG APP_VERSION=0.0.0-dev

ENV NODE_ENV=production \
    APP_VERSION=${APP_VERSION} \
    LOGGER_PATH=/app/logs

LABEL org.opencontainers.image.title="vaultisse" \
      org.opencontainers.image.description="Vaultisse — self-hosted personal/library book tracker" \
      org.opencontainers.image.version="${APP_VERSION}" \
      org.opencontainers.image.source="https://github.com/samuelloranger/vaultisse" \
      org.opencontainers.image.licenses="MIT"

WORKDIR /app/dist

COPY --from=server-deps /app/server/node_modules ./server/node_modules
COPY server/package.json                          ./server/package.json
COPY server/tsconfig.json                         ./server/tsconfig.json
COPY server/src                                   ./server/src
COPY --from=client-build /app/client/dist         ./client

RUN mkdir -p /app/logs \
    && chown -R bun:bun /app

USER bun

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:'+(process.env.API_PORT||3000)+'/api/rest/app/version').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"

CMD ["bun", "server/src/index.ts"]
