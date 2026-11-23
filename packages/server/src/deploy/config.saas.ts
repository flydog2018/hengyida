/**
 * SaaS 部署配置：环境变量优先，缺省值仅用于本地开发。
 * 一期只固化"配置切换契约"，不实现租户管理与计费（Phase 3）。
 */
import type { DeployConfig } from './DeployMode';
import { resolveJwtSecret } from './secret';

/** 安全读取正整数环境变量 */
function toPositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export const saasConfig: DeployConfig = {
  mode: 'saas',
  server: {
    port: toPositiveInt(process.env.PORT, 3000),
    apiPrefix: process.env.API_PREFIX ?? 'api',
  },
  database: {
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: toPositiveInt(process.env.DB_PORT, 3306),
    user: process.env.DB_USER ?? 'root',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_NAME ?? 'hengyida_saas',
  },
  jwt: {
    secret: resolveJwtSecret('saas'),
    expiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  },
  features: {
    excelImportExport: false,
    advancedRowPermission: false,
  },
};
