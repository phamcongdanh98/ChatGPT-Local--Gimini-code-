#!/usr/bin/env sh
set -eu

provider="${1:-}"
if [ -z "$provider" ]; then
  if command -v cloudflared >/dev/null 2>&1; then provider="cloudflared"; else provider="pinggy"; fi
fi
exec corepack pnpm tunnel -- "$provider"
