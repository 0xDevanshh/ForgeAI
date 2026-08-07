#!/usr/bin/env bash
#
# Regression smoke test for the local docker-compose stack.
# Run this after every phase, before moving on to the next one:
#
#   ./scripts/smoke-test.sh
#
# Exits 0 if every check passes, 1 otherwise.

set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [ -t 1 ]; then
  GREEN=$'\033[0;32m'; RED=$'\033[0;31m'; YELLOW=$'\033[0;33m'; BOLD=$'\033[1m'; RESET=$'\033[0m'
else
  GREEN=""; RED=""; YELLOW=""; BOLD=""; RESET=""
fi

CHECK_NAMES=()
CHECK_RESULTS=()

record() {
  CHECK_NAMES+=("$1")
  CHECK_RESULTS+=("$2")
}

if [ ! -f .env ]; then
  echo "${YELLOW}No .env found — copying .env.example so docker compose has something to read.${RESET}"
  cp .env.example .env
fi

# shellcheck disable=SC1091
set -a; source .env; set +a
NODE_BACKEND_PORT="${NODE_BACKEND_PORT:-4000}"
AI_SERVICE_PORT="${AI_SERVICE_PORT:-8000}"

STARTUP_TIMEOUT=90
POLL_INTERVAL=2

http_status() {
  curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$1" 2>/dev/null
}

container_health() {
  local service="$1"
  local cid
  cid=$(docker compose ps -q "$service" 2>/dev/null)
  if [ -z "$cid" ]; then
    echo "missing"
    return
  fi
  docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$cid" 2>/dev/null || echo "unknown"
}

wait_for_container_healthy() {
  local service="$1"
  local elapsed=0
  while [ "$elapsed" -lt "$STARTUP_TIMEOUT" ]; do
    if [ "$(container_health "$service")" = "healthy" ]; then
      return 0
    fi
    sleep "$POLL_INTERVAL"
    elapsed=$((elapsed + POLL_INTERVAL))
  done
  return 1
}

wait_for_http_ok() {
  local url="$1"
  local elapsed=0
  while [ "$elapsed" -lt "$STARTUP_TIMEOUT" ]; do
    if [ "$(http_status "$url")" = "200" ]; then
      return 0
    fi
    sleep "$POLL_INTERVAL"
    elapsed=$((elapsed + POLL_INTERVAL))
  done
  return 1
}

echo "${BOLD}==> Step 1: docker-compose up -d${RESET}"
if docker compose up -d; then
  record "docker compose up -d" "PASS"
else
  record "docker compose up -d" "FAIL"
  echo "${RED}docker compose up -d failed — aborting, nothing else can be checked.${RESET}"
  SKIP_REST=1
fi

if [ "${SKIP_REST:-0}" != "1" ]; then
  echo
  echo "${BOLD}==> Step 2: waiting for healthchecks${RESET}"

  for svc in postgres redis qdrant; do
    echo "  waiting for $svc..."
    if wait_for_container_healthy "$svc"; then
      record "container healthy: $svc" "PASS"
    else
      record "container healthy: $svc (status: $(container_health "$svc"))" "FAIL"
    fi
  done

  echo "  waiting for node-backend /health/ready..."
  if wait_for_http_ok "http://localhost:${NODE_BACKEND_PORT}/health/ready"; then
    record "node-backend /health/ready reachable" "PASS"
  else
    record "node-backend /health/ready reachable" "FAIL"
  fi

  echo "  waiting for ai-service /health/ready..."
  if wait_for_http_ok "http://localhost:${AI_SERVICE_PORT}/health/ready"; then
    record "ai-service /health/ready reachable" "PASS"
  else
    record "ai-service /health/ready reachable" "FAIL"
  fi

  echo
  echo "${BOLD}==> Step 3: node-backend health endpoints${RESET}"
  for path in "/health/live" "/health/ready"; do
    code=$(http_status "http://localhost:${NODE_BACKEND_PORT}${path}")
    if [ "$code" = "200" ]; then
      record "node-backend GET $path -> 200" "PASS"
    else
      record "node-backend GET $path -> $code (expected 200)" "FAIL"
    fi
  done

  echo
  echo "${BOLD}==> Step 4: ai-service health endpoints${RESET}"
  for path in "/health/live" "/health/ready"; do
    code=$(http_status "http://localhost:${AI_SERVICE_PORT}${path}")
    if [ "$code" = "200" ]; then
      record "ai-service GET $path -> 200" "PASS"
    else
      record "ai-service GET $path -> $code (expected 200)" "FAIL"
    fi
  done

  echo
  echo "${BOLD}==> Step 5: rate limiter must not block health checks${RESET}"
  codes=()
  for _ in $(seq 1 10); do
    codes+=("$(http_status "http://localhost:${NODE_BACKEND_PORT}/health/live")")
  done
  blocked=0
  for c in "${codes[@]}"; do
    [ "$c" = "429" ] && blocked=$((blocked + 1))
  done
  if [ "$blocked" -eq 0 ]; then
    record "10 rapid /health/live requests, none rate-limited" "PASS"
  else
    record "10 rapid /health/live requests, $blocked/10 got 429 (${codes[*]})" "FAIL"
  fi

  echo
  echo "${BOLD}==> Step 6: internal-service auth wiring (ai-service <-> node-backend)${RESET}"

  # 1. no key at all -> ai-service must reject it
  code=$(http_status "http://localhost:${AI_SERVICE_PORT}/internal/ping")
  if [ "$code" = "401" ]; then
    record "ai-service GET /internal/ping (no key) -> 401" "PASS"
  else
    record "ai-service GET /internal/ping (no key) -> $code (expected 401)" "FAIL"
  fi

  # 2. correct key, direct to ai-service (bypassing node-backend entirely) -> 200
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 \
    -H "X-Internal-Key: ${INTERNAL_SERVICE_SECRET}" \
    "http://localhost:${AI_SERVICE_PORT}/internal/ping" 2>/dev/null)
  if [ "$code" = "200" ]; then
    record "ai-service GET /internal/ping (correct key) -> 200" "PASS"
  else
    record "ai-service GET /internal/ping (correct key) -> $code (expected 200)" "FAIL"
  fi

  # 3. node-backend's own test route calls ai-service internally via
  #    internalHttpClient — the key never comes from us here, node-backend
  #    attaches it itself.
  response_with_code=$(curl -s --max-time 10 -w '\n%{http_code}' \
    "http://localhost:${NODE_BACKEND_PORT}/internal-test/ping" 2>/dev/null)
  code="${response_with_code##*$'\n'}"
  body="${response_with_code%$'\n'*}"
  if [ "$code" = "200" ] && echo "$body" | grep -q '"aiService"' && echo "$body" | grep -q '"status":"ok"'; then
    record "node-backend GET /internal-test/ping -> 200 with nested ai-service ping" "PASS"
  else
    record "node-backend GET /internal-test/ping -> $code, body: $body (expected 200 with nested ai-service ping)" "FAIL"
  fi
fi

echo
echo "${BOLD}==================== SMOKE TEST SUMMARY ====================${RESET}"
fail_count=0
for i in "${!CHECK_NAMES[@]}"; do
  if [ "${CHECK_RESULTS[$i]}" = "PASS" ]; then
    printf "%s✔ PASS%s  %s\n" "$GREEN" "$RESET" "${CHECK_NAMES[$i]}"
  else
    printf "%s✘ FAIL%s  %s\n" "$RED" "$RESET" "${CHECK_NAMES[$i]}"
    fail_count=$((fail_count + 1))
  fi
done
echo "${BOLD}=============================================================${RESET}"

if [ "$fail_count" -eq 0 ]; then
  echo "${GREEN}${BOLD}ALL CHECKS PASSED${RESET}"
  exit 0
else
  echo "${RED}${BOLD}${fail_count} CHECK(S) FAILED${RESET}"
  exit 1
fi
