#!/usr/bin/env bash
#
# scripts/deploy-proxy.sh — Start/restart the TierMux proxy server on the
# deployment target (172.20.10.197) so privseai-trystero can use 49-provider
# auto-failover as an OpenAI-compatible endpoint.
#
# Usage:
#   ./scripts/deploy-proxy.sh             # Start proxy with keyless providers
#   ./scripts/deploy-proxy.sh --restart   # Restart if already running
#   TIERMUX_PROVIDER_KEYS='{"openai":"sk-...","groq":"..."}' ./scripts/deploy-proxy.sh
#
# The proxy listens on 172.20.10.197:11435 by default.
# privseai-trystero can point its CloudInferenceProvider at http://172.20.10.197:11435/v1
#

set -euo pipefail

DEPLOY_HOST="${DEPLOY_HOST:-172.20.10.197}"
DEPLOY_USER="${DEPLOY_USER:-root}"
DEPLOY_PORT="${DEPLOY_PORT:-22}"
DEPLOY_KEY="${DEPLOY_KEY:-$HOME/.ssh/agentmesh_ed25519}"
PROXY_PORT="${TIERMUX_PROXY_PORT:-11435}"

RSYNC_FLAGS=(-avz --progress)
if [[ "$1" == "--dry-run" ]]; then
  RSYNC_FLAGS+=(--dry-run)
fi

# -------- preflight --------------------------------------------------------
cd "$(dirname "$0")/.."

if [[ ! -f "$DEPLOY_KEY" ]]; then
  echo "ERROR: SSH key not found at $DEPLOY_KEY" >&2
  exit 1
fi

if ! ssh -q -o BatchMode=yes -o ConnectTimeout=10 \
       -i "$DEPLOY_KEY" -p "$DEPLOY_PORT" \
       "${DEPLOY_USER}@${DEPLOY_HOST}" \
       "echo proxy-probe-ok" >/dev/null 2>&1; then
  echo "ERROR: SSH probe to ${DEPLOY_USER}@${DEPLOY_HOST}:${DEPLOY_PORT} failed" >&2
  exit 1
fi

echo "==> Copying tiermux-proxy.ts to ${DEPLOY_USER}@${DEPLOY_HOST}"
rsync "${RSYNC_FLAGS[@]}" \
  -e "ssh -i ${DEPLOY_KEY} -p ${DEPLOY_PORT} -o StrictHostKeyChecking=accept-new" \
  src/lib/providers/tiermux-catalog.ts \
  src/lib/providers/TierMuxCloudProvider.ts \
  src/lib/providers/tiermux-proxy.ts \
  "${DEPLOY_USER}@${DEPLOY_HOST}:/opt/privseai-proxy/"

# -------- Install dependencies if needed ------------------------------------
echo "==> Ensuring Node.js + tiermux deps on remote"
ssh -i "$DEPLOY_KEY" -p "$DEPLOY_PORT" \
  -o StrictHostKeyChecking=accept-new \
  "${DEPLOY_USER}@${DEPLOY_HOST}" \
  'bash -s' <<'REMOTE_SCRIPT'
set -euo pipefail

# Install Node if missing
if ! command -v node &>/dev/null; then
  echo "Installing Node.js 22..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

# Install tsx if missing (for running TS directly)
cd /opt/privseai-proxy
if ! npm ls tsx &>/dev/null 2>&1; then
  npm init -y >/dev/null 2>&1 || true
  npm install tsx --save --silent
fi

echo "Node version: $(node --version)"
REMOTE_SCRIPT

# -------- Start/restart proxy -----------------------------------------------
echo "==> Starting TierMux proxy on ${DEPLOY_HOST}:${PROXY_PORT}"

# Export API keys if provided via env
KEY_ENV=""
if [[ -n "${TIERMUX_PROVIDER_KEYS:-}" ]]; then
  KEY_ENV="TIERMUX_PROVIDER_KEYS='${TIERMUX_PROVIDER_KEYS}'"
fi

# Kill existing proxy
ssh -i "$DEPLOY_KEY" -p "$DEPLOY_PORT" \
  -o StrictHostKeyChecking=accept-new \
  "${DEPLOY_USER}@${DEPLOY_HOST}" \
  "pkill -f 'tiermux-proxy' 2>/dev/null || true"

# Start proxy with PM2 (or nohup as fallback)
ssh -i "$DEPLOY_KEY" -p "$DEPLOY_PORT" \
  -o StrictHostKeyChecking=accept-new \
  "${DEPLOY_USER}@${DEPLOY_HOST}" \
  "bash -s" <<EOF
set -euo pipefail

cd /opt/privseai-proxy

# Try PM2 first, fall back to nohup
if command -v pm2 &>/dev/null; then
  echo "Starting with PM2..."
  env TIERMUX_PROXY_PORT=${PROXY_PORT} \
      TIERMUX_PROXY_HOST=0.0.0.0 \
      ${KEY_ENV:+"TIERMUX_PROVIDER_KEYS=${TIERMUX_PROVIDER_KEYS}"} \
      pm2 start --name tiermux-proxy \
        -- node --import tsx src/lib/providers/tiermux-proxy.ts
  pm2 save
else
  echo "PM2 not found, using nohup..."
  TIERMUX_PROXY_PORT=${PROXY_PORT} \
  TIERMUX_PROXY_HOST=0.0.0.0 \
  ${KEY_ENV:?"TIERMUX_PROVIDER_KEYS=${TIERMUX_PROVIDER_KEYS}"} \
  nohup node --import tsx src/lib/providers/tiermux-proxy.ts \
    > /var/log/tiermux-proxy.log 2>&1 &
  echo "Proxy PID: \$!"
fi

echo "Waiting for proxy to start..."
sleep 2

# Verify
if curl -sf "http://${DEPLOY_HOST}:${PROXY_PORT}/health" >/dev/null 2>&1; then
  echo "Proxy is healthy!"
  curl -s "http://${DEPLOY_HOST}:${PROXY_PORT}/health" | head -c 500
  echo ""
else
  echo "WARNING: Proxy health check failed. Check logs with:"
  echo "  ssh ${DEPLOY_USER}@${DEPLOY_HOST} 'tail -20 /var/log/tiermux-proxy.log'"
fi
EOF

echo
echo "==> Done."
echo "    TierMux proxy running on http://${DEPLOY_HOST}:${PROXY_PORT}"
echo "    privseai-trystero can use: http://${DEPLOY_HOST}:${PROXY_PORT}/v1"