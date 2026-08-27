#!/usr/bin/env sh
set -eu

# Biên dịch Native macOS App nếu chưa có
if [ "$(uname)" = "Darwin" ] && [ ! -f "Local Coder.app/Contents/MacOS/LocalCoder" ]; then
  echo "🔨 Đang biên dịch ứng dụng Native macOS (Cocoa + WebKit)..."
  node scripts/build-mac-app.mjs
fi

ADMIN_PORT="3301"
PORT="3300"
if [ -f .env ]; then
  env_admin_port=$(grep -E '^ADMIN_PORT=' .env | cut -d '=' -f2 | tr -d ' "\r\n' || true)
  if [ -n "$env_admin_port" ]; then ADMIN_PORT="$env_admin_port"; fi
  env_port=$(grep -E '^PORT=' .env | cut -d '=' -f2 | tr -d ' "\r\n' || true)
  if [ -n "$env_port" ]; then PORT="$env_port"; fi
fi

if curl -fsS "http://127.0.0.1:${PORT}/healthz" >/dev/null 2>&1; then
  echo "⚡ Server đang chạy. Đang mở dashboard Local Coder..."
  corepack pnpm dashboard
  exit 0
fi

exec corepack pnpm app
