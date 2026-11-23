#!/usr/bin/env bash
# 本地开发启动（Unix）。Windows 用户请用 `npm run dev`（跨平台 dev.mjs）。
set -euo pipefail
cd "$(dirname "$0")/.."
node scripts/dev.mjs
