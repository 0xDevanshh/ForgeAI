# syntax=docker/dockerfile:1

FROM node:20-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY apps/node-backend/package.json apps/node-backend/package.json
RUN pnpm install --frozen-lockfile=false

FROM deps AS build
COPY packages/shared-types packages/shared-types
COPY apps/node-backend apps/node-backend
RUN pnpm --filter @ai-codebase-copilot/shared-types build
RUN pnpm --filter node-backend build

FROM base AS runner
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared-types packages/shared-types
COPY --from=build /app/apps/node-backend apps/node-backend
WORKDIR /app/apps/node-backend
EXPOSE 4000
CMD ["node", "dist/index.js"]
