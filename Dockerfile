# syntax=docker/dockerfile:1
# SPDX-License-Identifier: AGPL-3.0-or-later

# ---------- build ----------
FROM node:22-bookworm-slim AS build
# Toolchain only needed if a native module has no prebuilt binary for this platform.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@10
WORKDIR /app
COPY . .
RUN pnpm install --no-frozen-lockfile
RUN pnpm build
# Runtime dependencies of the server only (the shared workspace package is bundled into dist).
RUN mkdir -p /prod \
  && node -e "const p=require('./apps/server/package.json');delete p.devDependencies;p.scripts={start:'node dist/index.js'};require('fs').writeFileSync('/prod/package.json',JSON.stringify(p,null,2))" \
  && cd /prod && npm install --omit=dev --no-package-lock --no-audit --no-fund

# ---------- runtime ----------
FROM node:22-bookworm-slim
ENV NODE_ENV=production \
    PORT=3000 \
    MEALLER_DATA_DIR=/data
WORKDIR /app
COPY --from=build /prod/package.json ./package.json
COPY --from=build /prod/node_modules ./node_modules
COPY --from=build /app/apps/server/dist ./dist
COPY --from=build /app/apps/server/migrations ./migrations
COPY --from=build /app/apps/web/build ./public
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/index.js"]
