# syntax=docker/dockerfile:1

FROM node:20-alpine AS base
RUN corepack enable
WORKDIR /app

# ---- builder: full deps (incl. dev), builds Next.js, doubles as the dev runtime ----
FROM base AS builder
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile=false

COPY packages/shared-types packages/shared-types
COPY apps/web apps/web
RUN pnpm --filter @ai-codebase-copilot/shared-types build
RUN pnpm --filter web build

WORKDIR /app/apps/web
EXPOSE 3000
CMD ["pnpm", "run", "dev"]

# ---- runtime: slim, prod deps only ----
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=builder /app/pnpm-workspace.yaml /app/package.json ./
COPY --from=builder /app/packages/shared-types/package.json packages/shared-types/package.json
COPY --from=builder /app/apps/web/package.json apps/web/package.json
RUN pnpm install --prod --frozen-lockfile=false

COPY --from=builder /app/packages/shared-types/dist packages/shared-types/dist
COPY --from=builder /app/apps/web/.next apps/web/.next
COPY --from=builder /app/apps/web/public apps/web/public
COPY --from=builder /app/apps/web/next.config.js apps/web/next.config.js

WORKDIR /app/apps/web
EXPOSE 3000
CMD ["node_modules/.bin/next", "start"]
