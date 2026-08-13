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
# torch arrives transitively via sentence-transformers, unpinned — so pip
# resolves the default PyPI aarch64 wheel, which now bundles ~900MB of NVIDIA
# CUDA packages (torch 427MB + cudnn 445MB). That is dead weight in a container
# with no GPU, and large enough that the download reliably times out.
# Installing the CPU build first satisfies sentence-transformers' torch>=1.11
# requirement, so the later resolve leaves it alone.
RUN pip install --no-cache-dir --timeout 120 --retries 5 \
    --index-url https://download.pytorch.org/whl/cpu torch==2.10.0

COPY apps/ai-service/requirements.txt apps/ai-service/requirements-dev.txt ./
RUN pip install --no-cache-dir --timeout 120 --retries 5 -r requirements-dev.txt
COPY apps/ai-service/app ./app

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

# ---- runtime: slim, prod deps only ----
FROM base AS runtime
# torch arrives transitively via sentence-transformers, unpinned — so pip
# resolves the default PyPI aarch64 wheel, which now bundles ~900MB of NVIDIA
# CUDA packages (torch 427MB + cudnn 445MB). That is dead weight in a container
# with no GPU, and large enough that the download reliably times out.
# Installing the CPU build first satisfies sentence-transformers' torch>=1.11
# requirement, so the later resolve leaves it alone.
RUN pip install --no-cache-dir --timeout 120 --retries 5 \
    --index-url https://download.pytorch.org/whl/cpu torch==2.10.0

COPY apps/ai-service/requirements.txt ./
RUN pip install --no-cache-dir --timeout 120 --retries 5 -r requirements.txt
COPY apps/ai-service/app ./app

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
