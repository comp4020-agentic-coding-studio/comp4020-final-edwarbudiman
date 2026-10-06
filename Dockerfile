# syntax = docker/dockerfile:1

# Multi-stage: install and build on a full image, then copy only what runs
# into a slim one. Node is pinned to the same version as mise.toml, so the
# node:sqlite API can't shift under us between local and deploy.
#
# The image serves HTTP on 0.0.0.0:$PORT, keeps its SQLite database on the
# /data volume, and publishes README.md (and the images it links) at /readme/.

ARG NODE_VERSION=24.21.0
ARG PNPM_VERSION=11.9.0

# ---- production dependencies only (ws, marked)
FROM docker.io/library/node:${NODE_VERSION}-slim AS deps
ARG PNPM_VERSION
WORKDIR /app
RUN npm install -g pnpm@${PNPM_VERSION}
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

# ---- build the client to static files
FROM deps AS build
RUN pnpm install --frozen-lockfile
COPY client ./client
RUN pnpm build

# ---- runtime: node runs the server's TypeScript directly (type stripping)
FROM docker.io/library/node:${NODE_VERSION}-slim
ENV NODE_ENV=production \
    DATA_DIR=/data \
    PORT=8080
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY server ./server
COPY --from=build /app/client/dist ./client/dist
COPY README.md ./
COPY docs ./docs
RUN mkdir -p /data
EXPOSE 8080
# a 256 MB machine: keep the heap well inside it
CMD ["node", "--disable-warning=ExperimentalWarning", "--max-old-space-size=160", "server/src/index.ts"]
