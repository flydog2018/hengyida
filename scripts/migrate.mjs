#!/usr/bin/env node
/**
 * 恒易搭基线迁移入口（幂等）。
 *
 * 职责：
 *   1. 确保 DB_NAME 指定的业务库存在（utf8mb4）；
 *   2. 确保 4 张元数据表存在（meta_apps / meta_forms / meta_policies / meta_users）；
 *   3. 打印落库结果供 CI / 联调核验。
 *
 * 说明：业务动态表 t_form_<formId> 由 FormService.publish 经 DataEngine 幂等 DDL 创建，
 * 不属于基线迁移范围。连接参数来自仓库根目录 .env（DB_HOST=127.0.0.1 为宿主机调试）。
 * 容器内运行时 DB_HOST=mysql，同一脚本也可直接使用。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** 极简 .env 读取：仅补充尚未在 process.env 中定义的键 */
function loadDotEnv(file) {
  const values = {};
  if (!fs.existsSync(file)) return values;
  for (const rawLine of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] === undefined) values[key] = value;
  }
  return values;
}

const env = { ...loadDotEnv(path.join(ROOT, '.env')), ...process.env };
const config = {
  host: env.DB_HOST || '127.0.0.1',
  port: Number(env.DB_PORT || 3306),
  user: env.DB_USER || 'hengyida',
  password: env.DB_PASSWORD || '',
  database: env.DB_NAME || 'hengyida',
};

if (!/^[A-Za-z0-9_]+$/.test(config.database)) {
  throw new Error(`DB_NAME 不合法（只允许字母/数字/下划线）: ${config.database}`);
}

/** 基线表结构：与 NestJS 各 Service.onModuleInit 的 Knex 定义保持一致 */
const BASELINE_DDL = [
  `CREATE TABLE IF NOT EXISTS \`meta_apps\` (
    \`id\` VARCHAR(64) NOT NULL PRIMARY KEY,
    \`name\` VARCHAR(256) NOT NULL,
    \`description\` TEXT NULL,
    \`schema_json\` TEXT NULL,
    \`created_at\` VARCHAR(32) NULL,
    \`updated_at\` VARCHAR(32) NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS \`meta_forms\` (
    \`id\` VARCHAR(64) NOT NULL PRIMARY KEY,
    \`app_id\` VARCHAR(64) NOT NULL,
    \`name\` VARCHAR(256) NULL,
    \`status\` VARCHAR(32) NOT NULL DEFAULT 'draft',
    \`schema_json\` TEXT NULL,
    \`published_json\` TEXT NULL,
    \`published_version\` INT NOT NULL DEFAULT 0,
    \`published_hash\` VARCHAR(128) NULL,
    \`created_at\` VARCHAR(32) NULL,
    \`updated_at\` VARCHAR(32) NULL,
    \`published_at\` VARCHAR(32) NULL,
    KEY \`idx_meta_forms_app_id\` (\`app_id\`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS \`meta_policies\` (
    \`role\` VARCHAR(32) NOT NULL PRIMARY KEY,
    \`json_text\` TEXT NOT NULL,
    \`updated_at\` VARCHAR(32) NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS \`meta_users\` (
    \`id\` VARCHAR(64) NOT NULL PRIMARY KEY,
    \`username\` VARCHAR(128) NOT NULL UNIQUE,
    \`password_hash\` VARCHAR(128) NOT NULL,
    \`role\` VARCHAR(32) NOT NULL,
    \`app_ids\` TEXT NULL,
    \`created_at\` VARCHAR(32) NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
];

async function main() {
  console.log(`[migrate] 目标: ${config.host}:${config.port}/${config.database}`);

  // 先以“不指定库”的连接创建业务库，避免库不存在时连接失败
  const bootstrap = await mysql.createConnection({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
  });
  try {
    await bootstrap.query(
      `CREATE DATABASE IF NOT EXISTS \`${config.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
    console.log(`[migrate] 业务库已就绪: ${config.database}`);
  } finally {
    await bootstrap.end();
  }

  const conn = await mysql.createConnection(config);
  try {
    for (const sql of BASELINE_DDL) {
      await conn.query(sql);
    }
    const [rows] = await conn.query('SHOW TABLES');
    const tables = rows.map((row) => Object.values(row)[0]);
    console.log(`[migrate] 基线表（${tables.length}）: ${tables.join(', ')}`);
    console.log('[migrate] DONE. 业务动态表将在表单发布时由 DataEngine 幂等创建。');
  } finally {
    await conn.end();
  }
}

main().catch((error) => {
  console.error(`[migrate] FAILED: ${error.message}`);
  process.exitCode = 1;
});
