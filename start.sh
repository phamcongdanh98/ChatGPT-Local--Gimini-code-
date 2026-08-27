#!/usr/bin/env sh
set -eu

corepack pnpm build
exec corepack pnpm start
