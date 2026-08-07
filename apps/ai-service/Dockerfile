# syntax=docker/dockerfile:1

FROM python:3.11-slim AS base
WORKDIR /app/apps/ai-service
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# git is required at runtime by app/services/repo_cloner.py (shells out to
# `git clone`) — not present in the slim base image by default.
RUN apt-get update && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/*

# ---- builder: full deps (incl. dev/debug tooling), doubles as the dev runtime ----
FROM base AS builder
COPY apps/ai-service/requirements.txt apps/ai-service/requirements-dev.txt ./
RUN pip install --no-cache-dir -r requirements-dev.txt
COPY apps/ai-service/app ./app

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

# ---- runtime: slim, prod deps only ----
FROM base AS runtime
COPY apps/ai-service/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY apps/ai-service/app ./app

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
