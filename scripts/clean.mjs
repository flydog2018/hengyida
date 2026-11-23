#!/usr/bin/env node
/** 清理各包构建产物与依赖缓存（保留 node_modules，单独删除即可重装）。 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const targets = [
  'packages/designer/dist',
  'packages/runtime/dist',
  'packages/server/dist',
  'packages/shared/dist',
  '.turbo',
];
for (const rel of targets) {
  const p = path.join(root, rel);
  if (fs.existsSync(p)) {
    fs.rmSync(p, { recursive: true, force: true });
    console.log('removed', rel);
  }
}
