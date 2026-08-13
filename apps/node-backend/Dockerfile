# syntax=docker/dockerfile:1

FROM node:20-alpine AS base
RUN corepack enable
WORKDIR /app

# ---- builder: full deps (incl. dev), compiles TS, doubles as the dev runtime ----
FROM base AS builder
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY apps/node-backend/package.json apps/node-backend/package.json
RUN pnpm install --frozen-lockfile=false

COPY packages/shared-types packages/shared-types
COPY apps/node-backend apps/node-backend
RUN pnpm --filter @ai-codebase-copilot/shared-types build

# `build` runs `prisma generate` first, and prisma.config.ts resolves
# DATABASE_URL through env() — which throws when unset. There is no .env in the
# image (and there shouldn't be), so a throwaway value is supplied for this one
# layer. Generate only reads the schema and never opens a connection, so the
# value is irrelevant; the real URL arrives at runtime via compose's env_file.
# Scoped to this RUN rather than set with ENV, so it cannot leak into the
# running container and mask a genuinely missing DATABASE_URL.
RUN DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder" \
    pnpm --filter node-backend build

WORKDIR /app/apps/node-backend
EXPOSE 4000
CMD ["pnpm", "run", "dev"]

# ---- runtime: slim, prod deps only ----
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=builder /app/pnpm-workspace.yaml /app/package.json ./
COPY --from=builder /app/packages/shared-types/package.json packages/shared-types/package.json
COPY --from=builder /app/apps/node-backend/package.json apps/node-backend/package.json
RUN pnpm install --prod --frozen-lockfile=false

COPY --from=builder /app/packages/shared-types/dist packages/shared-types/dist
COPY --from=builder /app/apps/node-backend/dist apps/node-backend/dist

WORKDIR /app/apps/node-backend
EXPOSE 4000
CMD ["node", "dist/index.js"]
