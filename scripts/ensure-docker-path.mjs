#!/usr/bin/env node
/**
 * Docker PATH 自动检测与注入。
 *
 * 用途：
 *   1) 被其他脚本 import：ensureDockerPath() 会把 docker.exe 所在目录注入 process.env.PATH；
 *   2) 作为 CLI 使用：
 *        node scripts/ensure-docker-path.mjs --print-export
 *        node scripts/ensure-docker-path.mjs -- docker compose up -d
 *
 * 设计目标：Windows 上 Docker Desktop 默认不把 docker.exe 加入 PATH，
 * 但安装路径相对固定；本脚本集中处理，避免每个人重复踩坑。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const exeName = process.platform === 'win32' ? 'docker.exe' : 'docker';

function candidateDirs() {
  const dirs = [];
  if (process.platform === 'win32') {
    const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
    const programData = process.env.ProgramData || 'C:\\ProgramData';
    dirs.push(
      path.join(programFiles, 'Docker', 'Docker', 'resources', 'bin'),
      path.join(programData, 'DockerDesktop', 'version-bin'),
      path.join(os.homedir(), 'AppData', 'Local', 'Docker', 'bin'),
    );
  } else {
    dirs.push('/usr/local/bin', '/usr/bin', '/opt/homebrew/bin');
  }
  return dirs;
}

export function findDockerBin() {
  if (process.env.DOCKER_BIN && fs.existsSync(process.env.DOCKER_BIN)) {
    return process.env.DOCKER_BIN;
  }
  for (const dir of candidateDirs()) {
    const candidate = path.join(dir, exeName);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

export function ensureDockerPath() {
  const bin = findDockerBin();
  if (!bin) {
    return {
      ok: false,
      bin: null,
      dir: null,
      reason:
        '未找到 docker 可执行文件。请安装 Docker Desktop 并确认 WSL2 后端，或手动设置 DOCKER_BIN 指向 docker.exe。',
    };
  }
  const dir = path.dirname(bin);
  const current = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  if (!current.some((p) => path.resolve(p) === path.resolve(dir))) {
    process.env.PATH = [dir, ...current].join(path.delimiter);
  }
  process.env.DOCKER_BIN = bin;
  return { ok: true, bin, dir, reason: null };
}

function toBashPath(p) {
  let out = p.replace(/\\/g, '/');
  out = out.replace(/^([A-Za-z]):/, (_, drive) => `/${drive.toLowerCase()}`);
  // 只在含空格时加引号；路径中无空格也允许引号，稳妥起见统一加双引号。
  return `"${out}"`;
}

function printExport(shell) {
  const found = ensureDockerPath();
  if (!found.ok) {
    process.stderr.write(`[docker-path] ${found.reason}\n`);
    process.exit(1);
  }
  if (shell === 'powershell') {
    process.stdout.write(`$env:Path = "${found.dir};$env:Path"\n`);
  } else {
    process.stdout.write(`export PATH=${toBashPath(found.dir)}:'$PATH'\n`);
  }
}

function isMain() {
  const entry = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
  return entry === import.meta.url;
}

if (isMain()) {
  const args = process.argv.slice(2);
  if (args.includes('--check')) {
    const dirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
    const inPath = dirs.some((dir) => fs.existsSync(path.join(dir, exeName)));
    const found = ensureDockerPath();
    if (!found.ok) {
      process.stderr.write('[docker-path] ERROR: 未找到 docker。请安装 Docker Desktop 并启用 WSL2 engine，或设置 DOCKER_BIN 指向 docker.exe。\n');
      process.exit(1);
    }
    if (inPath) {
      process.stdout.write(`[docker-path] OK: docker 已在 PATH（${found.bin}）。\n`);
    } else {
      process.stdout.write(
        `[docker-path] OK: docker 未在 PATH，已自动定位 ${found.dir} 并注入当前 npm 脚本及所有子进程。` +
          '若需在交互 shell 中生效，执行：eval "$(node scripts/ensure-docker-path.mjs --print-export)"\n',
      );
    }
    process.exit(0);
  }
  if (args.includes('--print-export')) {
    const shellArg = args.find((a) => a.startsWith('--shell='));
    printExport(shellArg ? shellArg.split('=')[1] : 'bash');
    process.exit(0);
  }

  const found = ensureDockerPath();
  if (!found.ok) {
    process.stderr.write(`[docker-path] ${found.reason}\n`);
    process.exit(1);
  }
  process.stderr.write(`[docker-path] 已注入 Docker bin：${found.dir}\n`);

  const sep = args.indexOf('--');
  if (sep >= 0) {
    const [cmd, ...rest] = args.slice(sep + 1);
    if (!cmd) {
      process.stderr.write('[docker-path] "--" 后需要跟一个命令。\n');
      process.exit(1);
    }
    const result = spawnSync(cmd, rest, {
      stdio: 'inherit',
      env: process.env,
      shell: process.platform === 'win32',
    });
    process.exit(result.status ?? 1);
  }
}
