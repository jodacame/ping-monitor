# ---------------------------------------------------------------------------
# Backend image, shared by the api / scheduler / worker / migrate services.
# The Node services run TypeScript directly via tsx (no build step); the image
# just needs the source and installed dependencies. Select the process with the
# container `command` (see docker-compose.yml).
# ---------------------------------------------------------------------------
FROM node:26-slim

ENV NODE_ENV=production
WORKDIR /app

# pnpm via corepack.
RUN corepack enable

# Install dependencies (all workspaces). Copy manifests first for layer caching.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages ./packages
COPY apps ./apps

# Dev deps (tsx) are required at runtime, so install the full dependency set.
RUN pnpm install --frozen-lockfile --prod=false

# Default to the API; overridden per service in compose.
CMD ["pnpm", "--filter", "@ping/api", "run", "start"]
