#!/bin/bash
set -euo pipefail

# ============================================
# mc-webui Unraid updater script
#
# - Pulls latest git changes
# - If changes detected OR FORCE_REBUILD=1:
#     docker compose down
#     docker compose build --pull
#     docker compose up -d
#
# - Logs to file and console (if run manually)
# - Prints running version: YYYY.MM.DD+<shortsha> <branch>
#
# Environment variables:
#   FORCE_REBUILD=1   Force rebuild even if no git changes
#   DOCKER_TIMEOUT=600  Timeout (seconds) for compose operations (0=disable)
# ============================================

APPDIR="/mnt/user/appdata/mc-webui"
LOG="$APPDIR/updater.log"
LOCK="/tmp/mc-webui-updater.lock"

FORCE_REBUILD="${FORCE_REBUILD:-0}"
DOCKER_TIMEOUT="${DOCKER_TIMEOUT:-600}"   # set 0 to disable timeouts

# Detect interactive terminal
IS_TTY=0
if [[ -t 1 ]]; then IS_TTY=1; fi

timestamp() { date '+%F %T'; }

log() {
  local msg="$1"
  if [[ "$IS_TTY" == "1" ]]; then
    echo "$msg" | tee -a "$LOG"
  else
    echo "$msg" >>"$LOG"
  fi
}

# Run a command with optional timeout, capturing output line-by-line to log
run_cmd() {
  local prefix="$1"; shift
  if [[ "$DOCKER_TIMEOUT" != "0" ]] && command -v timeout >/dev/null 2>&1; then
    timeout "$DOCKER_TIMEOUT" "$@" 2>&1 | while IFS= read -r line; do log "[$prefix] $line"; done
  else
    "$@" 2>&1 | while IFS= read -r line; do log "[$prefix] $line"; done
  fi
}

log "=================================================="
log "[INFO] $(timestamp) mc-webui update start"
log "[INFO] APPDIR=$APPDIR"
log "[INFO] FORCE_REBUILD=$FORCE_REBUILD"
log "[INFO] DOCKER_TIMEOUT=$DOCKER_TIMEOUT"

# Lock to prevent parallel runs
if ! ( set -o noclobber; echo "$$" > "$LOCK" ) 2>/dev/null; then
  log "[WARN] Lock exists ($LOCK). Another run in progress. Exiting."
  exit 0
fi
trap 'rm -f "$LOCK"' EXIT

cd "$APPDIR"

# Mark repo as safe (helps on Unraid/root/appdata)
git config --global --add safe.directory "$APPDIR" >/dev/null 2>&1 || true

# Determine current commit (may be empty on first run / non-git dir)
OLD="$(git rev-parse HEAD 2>/dev/null || true)"
log "[INFO] Current commit: ${OLD:-<none>}"

log "[INFO] git fetch..."
git fetch --all --prune 2>&1 | while IFS= read -r line; do log "[GIT] $line"; done

log "[INFO] git pull..."
# Capture pull output for error detection and logging
PULL_OUTPUT="$(git pull --ff-only 2>&1 || true)"
while IFS= read -r line; do log "[GIT] $line"; done <<< "$PULL_OUTPUT"

# Abort if git pull clearly failed
if echo "$PULL_OUTPUT" | grep -qiE '^(fatal:|error:)' ; then
  log "[ERROR] git pull failed. Aborting."
  exit 1
fi

NEW="$(git rev-parse HEAD 2>/dev/null || true)"
log "[INFO] New commit: ${NEW:-<none>}"

# Change detection:
# - If OLD is empty but NEW exists (first run), treat as changed
# - If hashes differ, treat as changed
CHANGED=0
if [[ -n "${NEW:-}" && ( -z "${OLD:-}" || "${OLD:-}" != "${NEW:-}" ) ]]; then
  CHANGED=1
fi

if [[ "$CHANGED" == "0" && "$FORCE_REBUILD" != "1" ]]; then
  log "[INFO] No changes detected and FORCE_REBUILD!=1 → skipping rebuild."

  # Still print current running version info (useful when run manually)
  BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")"
  SHORT_HASH="$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")"
  COMMIT_DATE="$(git show -s --format=%cd --date=format:%Y.%m.%d HEAD 2>/dev/null || echo "unknown")"
  log "[INFO] Repo version: ${COMMIT_DATE}+${SHORT_HASH} ${BRANCH}"

  log "[INFO] $(timestamp) mc-webui update done"
  exit 0
fi

if [[ "$CHANGED" == "1" ]]; then
  log "[INFO] Repository changes detected → proceeding with rebuild."
else
  log "[INFO] FORCE_REBUILD=1 → forcing rebuild."
fi

# Compose command detection (use array to avoid quoting issues)
COMPOSE=()
if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE=(docker-compose)
else
  log "[ERROR] docker compose not found."
  exit 1
fi
log "[INFO] Using compose command: ${COMPOSE[*]}"

# Verify compose file exists
if [[ ! -f "$APPDIR/docker-compose.yml" && ! -f "$APPDIR/compose.yml" ]]; then
  log "[ERROR] No docker-compose.yml or compose.yml found in $APPDIR"
  exit 1
fi

log "[INFO] Running compose down..."
run_cmd "DOWN" "${COMPOSE[@]}" down

log "[INFO] Running compose build --pull..."
run_cmd "BUILD" "${COMPOSE[@]}" build --pull

log "[INFO] Running compose up -d..."
run_cmd "UP" "${COMPOSE[@]}" up -d --remove-orphans

log "[INFO] Container status after deployment:"
docker ps --format '{{.Names}}\t{{.Status}}\t{{.Image}}' \
  | grep -iE '^(mc-webui|meshcore-bridge)\b' \
  | while IFS= read -r line; do log "[PS] $line"; done || true

# ============================================
# Wait for mc-webui to become healthy (optional)
# ============================================

WAIT_HEALTH_SECONDS="${WAIT_HEALTH_SECONDS:-60}"   # set 0 to disable
if [[ "$WAIT_HEALTH_SECONDS" != "0" ]]; then
  log "[INFO] Waiting up to ${WAIT_HEALTH_SECONDS}s for mc-webui health=healthy..."

  end=$((SECONDS + WAIT_HEALTH_SECONDS))
  while (( SECONDS < end )); do
    # health can be: healthy, starting, unhealthy, or empty (no healthcheck)
    health="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}no-healthcheck{{end}}' mc-webui 2>/dev/null || echo "not-found")"
    status="$(docker inspect -f '{{.State.Status}}' mc-webui 2>/dev/null || echo "not-found")"

    log "[INFO] mc-webui status=$status health=$health"

    if [[ "$health" == "healthy" || "$health" == "no-healthcheck" ]]; then
      break
    fi

    if [[ "$status" != "running" ]]; then
      log "[ERROR] mc-webui is not running (status=$status)."
      break
    fi

    sleep 2
  done
fi

# Print repo version in requested format: YYYY.MM.DD+<shortsha> <branch>
BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")"
SHORT_HASH="$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")"
COMMIT_DATE="$(git show -s --format=%cd --date=format:%Y.%m.%d HEAD 2>/dev/null || echo "unknown")"
VERSION_STRING="${COMMIT_DATE}+${SHORT_HASH} ${BRANCH}"

log "[INFO] Running version: $VERSION_STRING"
log "[INFO] $(timestamp) mc-webui update finished successfully"
