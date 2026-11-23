#!/usr/bin/env bash
# 全量构建编排（Turbo）。Windows 用户请用 `npm run build`。
set -euo pipefail
cd "$(dirname "$0")/.."
npx turbo run build
