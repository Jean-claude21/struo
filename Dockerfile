# Struo — one image, every environment (Coolify). The public address, the databases and the secrets
# arrive through environment variables at start, never through this image.
FROM node:22-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/core/package.json packages/core/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile
COPY tsconfig.base.json ./
COPY packages/core packages/core
COPY apps/web apps/web
COPY scripts scripts
RUN pnpm --filter @struo/web build
# The start script (migrations + server), bundled with its database driver.
RUN pnpm exec esbuild scripts/start.ts --bundle --platform=node --format=esm --target=node22       --external:pg-native --outfile=start.mjs       --banner:js="import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);"

FROM node:22-slim AS runtime
WORKDIR /app
ARG APP_VERSION=dev
ENV NODE_ENV=production APP_ENV=production APP_VERSION=$APP_VERSION PORT=3000 STORAGE_DIR=/data/storage
# curl: Coolify checks the container's health with it before switching to a new release.
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*
# The standalone server, plus what the start script needs to migrate before serving.
COPY --from=build /app/apps/web/.output ./.output
COPY --from=build /app/packages/core/db/migrations ./migrations
COPY --from=build /app/start.mjs ./start.mjs
RUN mkdir -p /data/storage && chown -R node:node /app /data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "start.mjs"]
