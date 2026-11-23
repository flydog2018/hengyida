#!/usr/bin/env node
/**
 * 本地环境一键引导：把两份 example 复制为真实 .env，并立即生成强随机凭据。
 *
 * - 已存在的 .env 默认不覆盖（避免误删本地数据）；
 * - 新生成的 .env 均已被 .gitignore 忽略，权限 0600；
 * - 调用 generate-secrets.mjs --yes --skip-db，凭据只写文件、不回显。
 *
 * 用法：
 *   node scripts/bootstrap.mjs            # 安全引导，不覆盖已有 .env
 *   node scripts/bootstrap.mjs --force    # 强制重建（原有 .env 会先备份为被忽略的 .bak）
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const force = process.argv.includes('--force');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');

const pairs = [
  { from: '.env.example', to: '.env' },
  { from: 'deployments/private/.env.private.example', to: 'deployments/private/.env' },
];

let created = 0;
for (const pair of pairs) {
  const src = path.join(root, pair.from);
  const dest = path.join(root, pair.to);
  if (!fs.existsSync(src)) throw new Error(`缺少样例文件：${pair.from}`);
  if (fs.existsSync(dest)) {
    if (!force) {
      console.log(`[bootstrap] 保留已存在的 ${pair.to}（如需重建请加 --force）`);
      continue;
    }
    const backup = `${dest}.bak-${stamp}`;
    fs.copyFileSync(dest, backup);
    fs.chmodSync(backup, 0o600);
    console.log(`[bootstrap] 已备份 ${pair.to} → ${path.basename(backup)}（被 .gitignore 忽略）`);
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  fs.chmodSync(dest, 0o600);
  created += 1;
  console.log(`[bootstrap] 已生成 ${pair.to}（权限 0600，已被 .gitignore 忽略）`);
}

if (created > 0) {
  const result = spawnSync(process.execPath, [path.join(root, 'scripts', 'generate-secrets.mjs'), '--yes', '--skip-db'], {
    cwd: root,
    stdio: 'inherit',
  });
  if (result.status !== 0) throw new Error('凭据生成失败，请检查上一步输出。');
}

console.log('[bootstrap] 完成。后续命令：');
console.log('  pnpm run docker:up      # 启动 MySQL 8 容器');
console.log('  pnpm run migrate        # 建立元数据基线表');
console.log('  pnpm run dev            # 启动后端/设计器/运行端');
console.log('  pnpm run e2e:chain      # 自动核验 WSL2 并跑主链路');
