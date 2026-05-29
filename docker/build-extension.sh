#!/usr/bin/env bash
# Generates browser-extension/config/configs/env/self-hosted.json from the SPA's
# VITE_PUBLIC_APP_URL and runs the extension build. Invoked from Dockerfile.app
# so it can use real bash heredocs / quoting rules that dash won't accept.

set -euo pipefail

ENV_FILE="${1:-/repo/app/.env}"
EXT_ROOT="${2:-/repo/browser-extension}"

# Pull VITE_PUBLIC_APP_URL out of the env file, stripping surrounding quotes.
APP_URL="$(grep -E '^VITE_PUBLIC_APP_URL=' "$ENV_FILE" | cut -d= -f2- | sed -E 's/^["'\'']//; s/["'\'']$//')"
APP_URL="${APP_URL:-http://localhost:3005}"

echo "Building extension targeting ${APP_URL}"

cat > "${EXT_ROOT}/config/configs/env/self-hosted.json" <<EOF
{
  "WEB_URL": "${APP_URL}",
  "SESSIONS_URL": "${APP_URL}/sessions",
  "OTHER_WEB_URLS": [],
  "LANDING_PAGE_BASE_URL": "${APP_URL}",
  "logLevel": "info"
}
EOF

cd "${EXT_ROOT}"
bash build.sh self-hosted
