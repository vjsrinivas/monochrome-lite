#!/usr/bin/env bash
set -euo pipefail

# ── Configuration ────────────────────────────────────────────────────────────
PB_VERSION="${PB_VERSION:-0.26.8}"
PB_PORT="${PB_PORT:-8090}"
PB_DIR="$(cd "$(dirname "$0")/.." && pwd)/pb_data"
PB_BIN="${PB_DIR}/pocketbase"
SCHEMA_FILE="$(cd "$(dirname "$0")" && pwd)/pocketbase-schema.json"

ADMIN_EMAIL="${PB_ADMIN_EMAIL:-admin@localhost.local}"
ADMIN_PASSWORD="${PB_ADMIN_PASSWORD:-admin}"

# ── Helpers ──────────────────────────────────────────────────────────────────
log() { echo "[pocketbase] $*"; }
die() { log "ERROR: $*"; exit 1; }

detect_os_arch() {
    local os arch
    case "$(uname -s)" in
        Linux)  os="linux" ;;
        Darwin) os="darwin" ;;
        *)      die "Unsupported OS: $(uname -s)" ;;
    esac
    case "$(uname -m)" in
        x86_64)  arch="amd64v1" ;;
        aarch64|arm64) arch="arm64" ;;
        *)       die "Unsupported arch: $(uname -m)" ;;
    esac
    echo "${os}-${arch}"
}

download_pb() {
    local os_arch="$1"
    local url="https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_${os_arch}.zip"

    log "Downloading PocketBase v${PB_VERSION} (${os_arch})..."
    mkdir -p "$PB_DIR"

    if command -v curl &>/dev/null; then
        curl -fsSL -o "${PB_DIR}/pb.zip" "$url"
    elif command -v wget &>/dev/null; then
        wget -q -O "${PB_DIR}/pb.zip" "$url"
    else
        die "Neither curl nor wget found. Install one and retry."
    fi

    if command -v unzip &>/dev/null; then
        unzip -oq "${PB_DIR}/pb.zip" -d "$PB_DIR"
    elif command -v 7z &>/dev/null; then
        7z x "${PB_DIR}/pb.zip" -o"$PB_DIR" -y
    else
        die "Neither unzip nor 7z found. Install one and retry."
    fi

    rm -f "${PB_DIR}/pb.zip"
    chmod +x "$PB_BIN"
    log "PocketBase binary ready: $PB_BIN"
}

# ── Main ─────────────────────────────────────────────────────────────────────

# Detect OS/arch and download if needed
OS_ARCH="$(detect_os_arch)"
if [[ ! -x "$PB_BIN" ]]; then
    download_pb "$OS_ARCH"
fi

# Ensure pb_data exists
mkdir -p "$PB_DIR"

# Start PocketBase in the background
log "Starting PocketBase on :${PB_PORT} ..."
"$PB_BIN" serve --http="0.0.0.0:${PB_PORT}" &
PB_PID=$!

# Wait for PocketBase to be ready (poll /api/health)
log "Waiting for PocketBase to be ready..."
READY=false
for i in $(seq 1 30); do
    if curl -sf "http://localhost:${PB_PORT}/api/health" &>/dev/null; then
        READY=true
        break
    fi
    sleep 1
done

if [[ "$READY" != "true" ]]; then
    kill "$PB_PID" 2>/dev/null || true
    die "PocketBase failed to start within 30 seconds"
fi

log "PocketBase is ready at http://localhost:${PB_PORT}"

# Create admin account if not exists
log "Ensuring admin account..."
ADMIN_RESP="$(curl -sf -X POST "http://localhost:${PB_PORT}/api/admins/auth-with-password" \
    -H "Content-Type: application/json" \
    -d "{\"identity\":\"${ADMIN_EMAIL}\",\"password\":\"${ADMIN_PASSWORD}\"}" 2>/dev/null || true)"

if [[ -z "$ADMIN_RESP" || "$ADMIN_RESP" == *"invalid"* ]]; then
    log "Creating admin account..."
    curl -sf -X POST "http://localhost:${PB_PORT}/api/admins" \
        -H "Content-Type: application/json" \
        -d "{\"identity\":\"${ADMIN_EMAIL}\",\"password\":\"${ADMIN_PASSWORD}\"}" >/dev/null 2>&1 || true
    log "Admin account created (or already exists)"
fi

# Create DB_users collection if not exists
if [[ -f "$SCHEMA_FILE" ]]; then
    log "Creating/verifying DB_users collection..."
    COLLECTION_ID="$(curl -sf "http://localhost:${PB_PORT}/api/collections" \
        | python3 -c "
import sys, json
data = json.load(sys.stdin)
for c in data.get('items', []):
    if c.get('name') == 'DB_users':
        print(c['id'])
        sys.exit(0)
print('')
" 2>/dev/null || true)"

    if [[ -n "$COLLECTION_ID" ]]; then
        log "DB_users collection already exists (id: $COLLECTION_ID), updating..."
        curl -sf -X PATCH "http://localhost:${PB_PORT}/api/collections/${COLLECTION_ID}" \
            -H "Content-Type: application/json" \
            -d @"$SCHEMA_FILE" >/dev/null 2>&1 || true
    else
        log "Creating DB_users collection..."
        curl -sf -X POST "http://localhost:${PB_PORT}/api/collections" \
            -H "Content-Type: application/json" \
            -d @"$SCHEMA_FILE" >/dev/null 2>&1 || true
        log "DB_users collection created"
    fi
else
    log "WARNING: Schema file not found at $SCHEMA_FILE — skipping collection setup"
fi

log "===================================================="
log "  PocketBase is running at http://localhost:${PB_PORT}"
log "  Admin: ${ADMIN_EMAIL}"
log "  Data directory: ${PB_DIR}"
log "===================================================="

# Keep the script running so PocketBase stays alive
wait "$PB_PID"
