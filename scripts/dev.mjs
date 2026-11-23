#!/usr/bin/env node
/**
 * 本地开发启动器：并行拉起 server / designer / runtime。
 * 使用 Node 子进程而非 shell，兼容 Windows / macOS / Linux。
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { ensureDockerPath } from './ensure-docker-path.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Windows 上 Docker Desktop 默认不把 docker.exe 加入 PATH；这里统一注入，
// 避免 `pnpm run dev` 拉起的子进程在需要调用 docker 时找不到命令。
const docker = ensureDockerPath();
if (!docker.ok) {
  console.warn(`[dev] 提示：${docker.reason}（开发服务仍会启动，仅影响需要 docker 的命令）`);
} else {
  console.log(`[dev] Docker bin 已就绪：${docker.dir}`);
}

const services = [
  { name: 'server', cmd: 'npm', args: ['run', 'dev', '-w', '@hengyida/server'] },
  { name: 'designer', cmd: 'npm', args: ['run', 'dev', '-w', '@hengyida/designer'] },
  { name: 'runtime', cmd: 'npm', args: ['run', 'dev', '-w', '@hengyida/runtime'] },
];

const children = [];
for (const s of services) {
  const child = spawn(s.cmd, s.args, { cwd: root, stdio: 'inherit', shell: true });
  children.push(child);
}

const shutdown = () => {
  for (const child of children) child.kill('SIGTERM');
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
