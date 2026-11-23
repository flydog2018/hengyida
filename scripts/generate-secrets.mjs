#!/usr/bin/env node
/**
 * 凭据轮换：生成强随机 MYSQL_ROOT_PASSWORD / MYSQL_PASSWORD / JWT_SECRET，
 * 同步写入根 .env 与 deployments/private/.env（均已被 .gitignore 忽略）。
 *
 * 若 MySQL 容器正在运行，会额外执行：
 *   - 用旧 root 密码 ALTER USER，把 root / 应用账号切到新密码；
 *   - force-recreate mysql + server，使容器环境变量与数据库账号一致；
 *   - 用新应用账号验证 SELECT 1。
 *
 * 用法：
 *   node scripts/generate-secrets.mjs            # 交互确认
 *   node scripts/generate-secrets.mjs --yes      # 跳过确认（自动化用）
 *   node scripts/generate-secrets.mjs --skip-db  # 只改文件，不改数据库账号
 *
 * 安全约定：脚本绝不打印任何明文凭据。
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { ensureDockerPath } from './ensure-docker-path.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rootEnv = path.join(root, '.env');
const privateEnv = path.join(root, 'deployments', 'private', '.env');

const args = process.argv.slice(2);
const autoYes = args.includes('--yes');
const skipDb = args.includes('--skip-db');

function parseEnv(file) {
  const map = new Map();
  const text = fs.readFileSync(file, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    map.set(trimmed.slice(0, eq).trim(), trimmed.slice(eq + 1).trim());
  }
  return map;
}

function updateEnvFile(file, updates) {
  const original = fs.readFileSync(file, 'utf8');
  const eol = original.includes('\r\n') ? '\r\n' : '\n';
  const lines = original.split(/\r?\n/);
  const seen = new Set();

  const next = lines.map((line) => {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/);
    if (!match) return line;
    const key = match[1];
    if (!(key in updates)) return line;
    seen.add(key);
    return `${key}=${updates[key]}`;
  });

  for (const [key, value] of Object.entries(updates)) {
    if (!seen.has(key)) next.push(`${key}=${value}`);
  }

  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, next.join(eol).replace(/\r?\n$/, '') + eol, { mode: 0o600 });
  fs.renameSync(tmp, file);
}

function backupEnv(file, stamp) {
  const backup = `${file}.bak-${stamp}`;
  fs.copyFileSync(file, backup, fs.constants.COPYFILE_FICLONE);
  fs.chmodSync(backup, 0o600);
  return path.basename(backup);
}

function sqlQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function run(cmd, cmdArgs, options = {}) {
  return spawnSync(cmd, cmdArgs, {
    stdio: options.stdio ?? 'inherit',
    encoding: options.encoding,
    env: process.env,
    cwd: options.cwd ?? root,
    // docker.exe 可直接以 argv 调用；不经过 shell 可避免 SQL/password 参数被 cmd 转义破坏。
    shell: false,
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function confirm() {
  if (autoYes) return true;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(
    '即将轮换 MYSQL_ROOT_PASSWORD / MYSQL_PASSWORD / JWT_SECRET，并同步数据库账号与容器。确认继续？[y/N] ',
  );
  rl.close();
  return /^y(es)?$/i.test(answer.trim());
}

async function main() {
  for (const file of [rootEnv, privateEnv]) {
    if (!fs.existsSync(file)) {
      throw new Error(`缺少环境变量文件：${path.relative(root, file)}，请先从对应 example 复制。`);
    }
  }

  const privateBefore = parseEnv(privateEnv);
  const oldRootPassword = privateBefore.get('MYSQL_ROOT_PASSWORD');
  const dbUser = privateBefore.get('MYSQL_USER') || 'hengyida';
  const dbName = privateBefore.get('MYSQL_DATABASE') || 'hengyida';

  if (!oldRootPassword) {
    throw new Error('deployments/private/.env 缺少 MYSQL_ROOT_PASSWORD，无法安全轮换。');
  }

  if (!(await confirm())) {
    console.log('[secrets] 已取消，未修改任何文件。');
    return;
  }

  const newRootPassword = crypto.randomBytes(32).toString('base64url');
  const newUserPassword = crypto.randomBytes(32).toString('base64url');
  const newJwtSecret = crypto.randomBytes(48).toString('hex');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');

  const backups = [backupEnv(rootEnv, stamp), backupEnv(privateEnv, stamp)];

  // 两个文件同步写入；根 .env 的 DB_PASSWORD 必须等于容器应用账号密码。
  updateEnvFile(privateEnv, {
    MYSQL_ROOT_PASSWORD: newRootPassword,
    MYSQL_PASSWORD: newUserPassword,
    JWT_SECRET: newJwtSecret,
  });
  updateEnvFile(rootEnv, {
    DB_PASSWORD: newUserPassword,
    JWT_SECRET: newJwtSecret,
  });

  console.log('[secrets] 已写入新凭据（值已隐藏）：MYSQL_ROOT_PASSWORD / MYSQL_PASSWORD / JWT_SECRET');
  console.log(`[secrets] 已备份原文件：${backups.join(', ')}（均被 .gitignore 忽略）`);
  console.log(`[secrets] 数据库名/用户保持不变：${dbName} / ${dbUser}`);

  if (skipDb) {
    console.log('[secrets] --skip-db：跳过数据库账号轮换。若使用现有数据卷，请手动 ALTER USER。');
    return;
  }

  const docker = ensureDockerPath();
  if (!docker.ok) {
    console.warn(`[secrets] 文件已轮换，但无法轮换数据库账号：${docker.reason}`);
    return;
  }

  const bin = docker.bin;
  const ps = run(bin, ['ps', '--filter', 'name=^/hengyida-mysql$', '--format', '{{.Names}}'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const isRunning = (ps.stdout || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .includes('hengyida-mysql');

  if (!isRunning) {
    console.warn(
      '[secrets] MySQL 容器未运行：文件已轮换，但未改数据库账号。首次用现有卷启动前需手动 ALTER USER。',
    );
    return;
  }

  const statements = [
    `ALTER USER ${sqlQuote(dbUser)}@'%' IDENTIFIED BY ${sqlQuote(newUserPassword)}`,
    `ALTER USER ${sqlQuote(dbUser)}@'localhost' IDENTIFIED BY ${sqlQuote(newUserPassword)}`,
    `ALTER USER 'root'@'%' IDENTIFIED BY ${sqlQuote(newRootPassword)}`,
    `ALTER USER 'root'@'localhost' IDENTIFIED BY ${sqlQuote(newRootPassword)}`,
  ];

  let applied = 0;
  for (const sql of statements) {
    const result = run(bin, [
      'exec',
      '-e',
      `MYSQL_PWD=${oldRootPassword}`,
      'hengyida-mysql',
      'mysql',
      '-uroot',
      '-e',
      sql,
    ], { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
    // 某些安装只会创建 root@'%' 或应用账号 @'%'，缺失账号的 ALTER 失败可忽略。
    if (result.status === 0) applied += 1;
  }
  console.log(`[secrets] 数据库账号轮换：成功 ${applied}/${statements.length} 条 ALTER USER（其余为账号不存在，已忽略）。`);

  const recreate = run(bin, ['compose', 'up', '-d', '--force-recreate', 'mysql', 'server']);
  if (recreate.status !== 0) {
    throw new Error('容器重建失败，请检查 docker compose up -d --force-recreate 输出。');
  }

  let healthy = false;
  for (let i = 0; i < 30; i += 1) {
    const inspect = run(bin, ['inspect', '-f', '{{.State.Health.Status}}', 'hengyida-mysql'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if ((inspect.stdout || '').trim() === 'healthy') {
      healthy = true;
      break;
    }
    await sleep(2000);
  }
  if (!healthy) throw new Error('MySQL 容器未在 60 秒内恢复 healthy，请检查 docker compose logs。');

  const verify = run(bin, [
    'exec',
    '-e',
    `MYSQL_PWD=${newUserPassword}`,
    'hengyida-mysql',
    'mysql',
    `-u${dbUser}`,
    '-e',
    'SELECT 1',
  ], { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
  if (verify.status !== 0) {
    throw new Error('新应用账号连接验证失败，请检查 ALTER USER 结果与 .env 同步情况。');
  }

  console.log('[secrets] 轮换完成：容器已重建、MySQL healthy、新应用账号验证通过。');
  console.log('[secrets] 请重新运行 pnpm run e2e:chain 做业务回归。');
}

main().catch((error) => {
  console.error(`[secrets] 失败：${error && error.message ? error.message : error}`);
  process.exit(1);
});
