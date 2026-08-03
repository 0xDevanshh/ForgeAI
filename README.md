# AI Codebase Copilot

AI Codebase Copilot is a monorepo for a tool that lets developers ask natural-language
questions about a codebase and get grounded, citation-backed answers. A Next.js web app
provides the chat UI, an Express backend handles auth, sessions, and orchestration, and a
Python FastAPI service performs embeddings, retrieval (via Qdrant), and LLM calls (via
Claude). Postgres stores relational data (users, repos, conversations) and Redis is used
for caching and lightweight job/session state.

## Architecture

```
                         ┌─────────────────────┐
                         │        User          │
                         └──────────┬───────────┘
                                    │ HTTPS
                                    ▼
                         ┌──────────────────────┐
                         │   web (Next.js)      │
                         │   apps/web            │
                         └──────────┬───────────┘
                                    │ REST/JSON
                                    ▼
                         ┌──────────────────────┐
                         │  node-backend         │
                         │  (Express + TS)       │
                         │  apps/node-backend     │
                         └──┬────────────┬───────┘
                            │            │ internal API
                 ┌──────────┘            └───────────┐
                 ▼                                    ▼
     ┌───────────────────┐               ┌─────────────────────┐
     │     Postgres       │               │   ai-service         │
     │  (users, repos,     │               │  (FastAPI + Python)  │
     │   conversations)    │               │  apps/ai-service      │
     └───────────────────┘               └──┬───────────┬───────┘
                                              │           │
                                              ▼           ▼
                                    ┌────────────┐  ┌────────────┐
                                    │   Qdrant    │  │   Redis     │
                                    │ (vectors)   │  │ (cache)     │
                                    └────────────┘  └────────────┘
                                              │
                                              ▼
                                    ┌────────────────┐
                                    │ Anthropic API   │
                                    │ (Claude)        │
                                    └────────────────┘

     packages/shared-types — TS interfaces shared between web and node-backend
```

## Setup

Two manual, one-time steps before your `.env` is complete:

1. **GitHub OAuth App** — used for GitHub login / repo import in node-backend.
   - Register one at https://github.com/settings/developers ("New OAuth App")
   - Authorization callback URL: `http://localhost:4000/auth/github/callback`
     (adjust the port if you've changed `NODE_BACKEND_PORT`)
   - Scopes needed: `repo` (read access to private + public repos) and `read:user`
   - Put the generated values in `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` in `.env`

2. **Encryption key** — node-backend encrypts stored GitHub access tokens at rest
   (AES-256-GCM, see `apps/node-backend/src/lib/encryption.ts`) using `ENCRYPTION_KEY`,
   a base64-encoded 32-byte key:
   ```bash
   openssl rand -base64 32
   ```
   Put the output in `ENCRYPTION_KEY` in `.env`.

## Running locally

1. Copy the environment template and fill in real secrets:
   ```bash
   cp .env.example .env
   ```
2. Install JS dependencies once (speeds up the first `dev` run and gives you local
   type-checking/linting outside Docker):
   ```bash
   pnpm install
   ```
3. Start everything (Postgres, Redis, Qdrant, node-backend, ai-service, web) with hot
   reload:
   ```bash
   pnpm dev
   ```
   This runs `docker compose -f docker-compose.dev.yml up --build`.
   - web: http://localhost:3001
   - node-backend: http://localhost:4000/health
   - ai-service: http://localhost:8000/health

4. For a production-style build instead:
   ```bash
   docker compose up --build
   ```

5. Stop the dev stack:
   ```bash
   pnpm dev:down
   ```

### Other useful scripts (run from repo root)

```bash
pnpm lint        # lint every workspace (node-backend, web, shared-types, ai-service)
pnpm typecheck   # typecheck every workspace (tsc for JS, mypy for ai-service)
pnpm build       # build every buildable workspace
```

## Folder structure

```
/ai-codebase-copilot
  /apps
    /node-backend       Express + TypeScript API (auth, orchestration)
    /ai-service          Python FastAPI service (embeddings, retrieval, LLM calls)
    /web                 Next.js web app (chat UI)
  /packages
    /shared-types        Shared TypeScript types/interfaces (node-backend + web)
  docker-compose.yml       Production-style compose (builds each app's Dockerfile)
  docker-compose.dev.yml   Dev compose (hot reload, source mounted as volumes)
  .env.example             Template for required environment variables
  package.json             Root workspace config + cross-workspace scripts
```
