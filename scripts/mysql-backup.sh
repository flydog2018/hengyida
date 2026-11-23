#!/bin/sh
# 恒易搭 MySQL 逻辑备份脚本（在 mysql:8.0 容器内运行）
#
# 默认：备份 MYSQL_DATABASE 指定的业务库，gzip 压缩，保留 RETENTION_DAYS 天。
# ONCE=1 时只备份一次并退出，供恢复演练 / 手动备份使用。
# BACKUP_ALL=1 时改为 --all-databases（含系统库，恢复更重）。
# 所有凭据从环境变量读取，脚本文件本身不含任何密码。
set -eu

MYSQL_HOST="${MYSQL_HOST:-mysql}"
MYSQL_PORT="${MYSQL_PORT:-3306}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
BACKUP_INTERVAL_SECONDS="${BACKUP_INTERVAL_SECONDS:-86400}"
BACKUP_DB="${BACKUP_DB:-${MYSQL_DATABASE:-}}"
BACKUP_ALL="${BACKUP_ALL:-0}"
BACKUP_PREFIX="${BACKUP_PREFIX:-mysql}"

: "${MYSQL_ROOT_PASSWORD:?MYSQL_ROOT_PASSWORD 未注入}"

mkdir -p "$BACKUP_DIR"

dump_once() {
  ts=$(date +%Y%m%d-%H%M%S)
  if [ "$BACKUP_ALL" = "1" ]; then
    file="${BACKUP_DIR}/${BACKUP_PREFIX}-all-${ts}.sql"
    MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysqldump \
      -h "$MYSQL_HOST" -P "$MYSQL_PORT" -uroot \
      --single-transaction --routines --triggers --events \
      --all-databases > "$file"
  elif [ -n "$BACKUP_DB" ]; then
    file="${BACKUP_DIR}/${BACKUP_PREFIX}-${BACKUP_DB}-${ts}.sql"
    MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysqldump \
      -h "$MYSQL_HOST" -P "$MYSQL_PORT" -uroot \
      --single-transaction --routines --triggers --events \
      "$BACKUP_DB" > "$file"
  else
    echo "[backup] 未指定 BACKUP_DB，且 BACKUP_ALL != 1，无法备份。" >&2
    return 1
  fi

  gzip -f "$file"
  find "$BACKUP_DIR" -type f -name "${BACKUP_PREFIX}-*.sql.gz" -mtime "+${RETENTION_DAYS}" -delete
  echo "[backup] $(date '+%F %T') 完成：$(basename "$file").gz"
}

dump_once

if [ "${ONCE:-0}" = "1" ]; then
  exit 0
fi

while true; do
  sleep "$BACKUP_INTERVAL_SECONDS"
  dump_once
done
