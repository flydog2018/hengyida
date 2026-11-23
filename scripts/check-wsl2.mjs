#!/usr/bin/env node
/**
 * WSL2 后端自动核验（方案 B，Node 版）
 *
 * 与 scripts/check-wsl2.sh 完全等价的四断言，供 e2e-chain.mjs 跨平台调用，
 * 避免依赖 bash 是否存在。全程只用 docker info，不调用任何 Windows WSL 命令行工具。
 *
 * 用法：
 *   node scripts/check-wsl2.mjs
 *   import { assertWsl2Engine } from './check-wsl2.mjs';
 */
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { ensureDockerPath } from './ensure-docker-path.mjs';

export const WSL2_HINT = 'WSL2 engine 未启用，请在 Docker Desktop → Settings → General 勾选';

const ASSERTIONS = [
  {
    label: 'KernelVersion 含 microsoft-standard-WSL2',
    format: '{{.KernelVersion}}',
    test: (v) => /microsoft-standard-wsl2/i.test(v),
  },
  {
    label: 'OSType=linux',
    format: '{{.OSType}}',
    test: (v) => v === 'linux',
  },
  {
    label: 'Name 含 docker-desktop',
    format: '{{.Name}}',
    test: (v) => /docker-desktop/.test(v),
  },
  {
    label: 'DefaultRuntime=runc',
    format: '{{.DefaultRuntime}}',
    test: (v) => /runc/.test(v),
  },
];

/**
 * 执行四断言。全部通过时返回各项实际值；任一项失败时抛出带固定提示的错误。
 * @param {{ silent?: boolean }} options
 */
export function assertWsl2Engine({ silent = false } = {}) {
  const found = ensureDockerPath();
  if (!found.ok) throw new Error(`${WSL2_HINT}（前置失败：${found.reason}）`);

  const values = {};
  for (const assertion of ASSERTIONS) {
    const result = spawnSync(found.bin, ['info', '--format', assertion.format], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (result.status !== 0) {
      const detail = String(result.stderr || '').trim().slice(0, 180);
      throw new Error(`${WSL2_HINT}（docker info 读取失败：${detail || '无输出'}）`);
    }
    values[assertion.format] = String(result.stdout || '').trim();
  }

  const failed = ASSERTIONS.filter((a) => !a.test(values[a.format]));
  if (failed.length > 0) {
    const detail = failed
      .map((a) => `${a.label}（实际=${values[a.format] || '<空>'}）`)
      .join('；');
    throw new Error(`${WSL2_HINT}；未通过：${detail}`);
  }

  const summary = {
    kernel: values['{{.KernelVersion}}'],
    osType: values['{{.OSType}}'],
    name: values['{{.Name}}'],
    defaultRuntime: values['{{.DefaultRuntime}}'],
  };
  if (!silent) {
    console.log(
      `[wsl2] PASS: 四断言全部通过 (KernelVersion=${summary.kernel}, OSType=${summary.osType}, ` +
        `Name=${summary.name}, DefaultRuntime=${summary.defaultRuntime})`,
    );
  }
  return summary;
}

function isMain() {
  const entry = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
  return entry === import.meta.url;
}

if (isMain()) {
  try {
    assertWsl2Engine();
  } catch (error) {
    console.error(`[wsl2] FAIL: ${error && error.message ? error.message : error}`);
    process.exit(1);
  }
}
