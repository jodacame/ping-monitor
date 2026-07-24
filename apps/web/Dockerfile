# ---------------------------------------------------------------------------
# Web image: build the Vite SPA, then serve it with nginx. nginx also reverse-
# proxies /api to the api service, so the browser only ever talks same-origin.
# ---------------------------------------------------------------------------
FROM node:26-slim AS build

WORKDIR /app
RUN corepack enable

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages ./packages
COPY apps ./apps
RUN pnpm install --frozen-lockfile --prod=false
RUN pnpm --filter @ping/web run build

FROM nginx:1.27-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
