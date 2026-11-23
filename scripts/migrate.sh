#!/usr/bin/env bash
# Schema 基线迁移运维入口（幂等）。
# 业务动态表 t_form_<formId> 由 FormService.publish 经 DataEngine 自动创建。
set -euo pipefail
cd "$(dirname "$0")/.."
node scripts/migrate.mjs
